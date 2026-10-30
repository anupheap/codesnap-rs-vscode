'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizeCode, validatePng, render } = require('../renderer');

function harness(options = {}) {
  const commands = new Map();
  const calls = { renders: [], writes: [], errors: [], notices: [], statuses: [], previews: [] };
  let previewHooks;
  const token = { isCancellationRequested: false };
  const uri = { path: '/test/hello.js', fsPath: 'C:\\test\\hello.js' };
  const selection = { isEmpty: false, start: { line: 8 } };
  const editor = {
    selection, selections: [selection], options: { tabSize: 4 },
    document: { uri, isUntitled: false, fileName: 'C:\\test\\hello.js', languageId: 'javascript', getText: () => '    const x = "hello";\n    console.log(x);\n' }
  };
  const vscode = {
    commands: { registerCommand: (id, fn) => { commands.set(id, fn); return { dispose() {} }; } },
    ProgressLocation: { Notification: 15 },
    Uri: { file: fsPath => ({ fsPath, path: fsPath }), joinPath: (root, ...parts) => ({ path: path.posix.join(root.path, ...parts), fsPath: path.posix.join(root.path, ...parts) }) },
    workspace: {
      workspaceFolders: [{ uri: { path: '/test', fsPath: 'C:\\test' } }],
      getConfiguration: section => ({ get: (key, fallback) => options.settings?.[`${section}.${key}`] ?? fallback }),
      fs: { writeFile: async (dest, data) => calls.writes.push({ dest, data }) }
    },
    window: {
      activeTextEditor: editor,
      showInformationMessage: msg => calls.notices.push(msg),
      showErrorMessage: msg => calls.errors.push(msg),
      setStatusBarMessage: msg => calls.statuses.push(msg),
      showSaveDialog: async () => options.dialog ? options.dialog() : options.cancel ? undefined : { path: '/test/out.png', fsPath: 'C:\\test\\out.png' },
      withProgress: async (_options, task) => task({}, token)
    }
  };
  const testModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'extension.js'), 'utf8'), {
    module: testModule,
    require: name => name === 'vscode' ? vscode : name === './renderer'
      ? { normalizeCode, render: async (_dir, request) => { calls.renders.push(request); return options.render ? options.render(request, token) : Buffer.from('png'); } }
      : name === './preview' ? { createPreviewPanel: (_vscode, _context, hooks) => {
        previewHooks = hooks;
        const preview = { disposed: false, show: () => {}, dispose() { this.disposed = true; } };
        calls.previews.push(preview);
        return preview;
      } } : require(name)
  });
  testModule.exports.activate({ extensionPath: __dirname, subscriptions: [] });
  return { vscode, commands, calls, token, get previewHooks() { return previewHooks; } };
}

test('normalizes common indentation, CRLF and tab stops', () => {
  assert.equal(normalizeCode('    def hello():\r\n    \tprint("hi")\r\n', 4), 'def hello():\n    print("hi")');
  assert.equal(normalizeCode('a\tb', 4), 'a   b');
});

test('selection is captured before the save dialog; source numbering is preserved', async () => {
  let h;
  h = harness({ settings: { 'codesnap.realLineNumbers': true }, dialog: async () => {
    h.vscode.window.activeTextEditor.document.getText = () => 'changed after dialog';
    return { path: '/test/out.png', fsPath: 'C:\\test\\out.png' };
  } });
  await h.commands.get('codesnap-rs.save')();
  assert.equal(h.calls.renders[0].startLine, 9);
  assert.equal(h.calls.renders[0].code, 'const x = "hello";\nconsole.log(x);');
  assert.equal(h.calls.renders[0].scale, 2);
  assert.equal(h.calls.writes.length, 1);
});

test('cancelled save does not render and releases the busy lock', async () => {
  const h = harness({ cancel: true });
  await h.commands.get('codesnap-rs.save')();
  await h.commands.get('codesnap-rs.copy')();
  assert.equal(h.calls.renders.length, 1);
  assert.equal(h.calls.renders[0].copy, true);
  assert.equal(h.calls.writes.length, 0);
});

test('rejects concurrent captures while a save dialog is open', async () => {
  let close;
  const h = harness({ dialog: () => new Promise(resolve => { close = resolve; }) });
  const pending = h.commands.get('codesnap-rs.save')();
  await h.commands.get('codesnap-rs.copy')();
  assert.equal(h.calls.renders.length, 0);
  close(undefined);
  await pending;
});

test('no selection is handled without starting a renderer', async () => {
  const h = harness();
  h.vscode.window.activeTextEditor.selection.isEmpty = true;
  await h.commands.get('codesnap-rs.save')();
  assert.equal(h.calls.renders.length, 0);
  assert.equal(h.calls.notices.length, 1);
});

test('copy honors legacy shutter action, transparency and untitled language', async () => {
  const h = harness({ settings: { 'codesnap.shutterAction': 'copy', 'codesnap.transparentBackground': true } });
  h.vscode.window.activeTextEditor.document.isUntitled = true;
  h.vscode.window.activeTextEditor.document.languageId = 'python';
  await h.commands.get('codesnap.start')();
  const request = h.previewHooks.readSelection();
  await h.previewHooks.capture(undefined, { request, png: Buffer.from('preview png') });
  assert.equal(h.calls.renders[0].copy, true);
  assert.equal(h.calls.renders[0].filename, 'snippet.py');
  assert.equal(h.calls.renders[0].background, '#00000000');
  assert.equal(h.calls.writes.length, 0);
});

test('failed rendering never overwrites the chosen file and allows retry', async () => {
  const h = harness({ render: async () => { throw new Error('renderer failed'); } });
  await h.commands.get('codesnap-rs.save')();
  await h.commands.get('codesnap-rs.save')();
  assert.equal(h.calls.writes.length, 0);
  assert.equal(h.calls.errors.length, 2);
});

test('cancellation before writing preserves the chosen file', async () => {
  const h = harness({ render: async (_request, token) => { token.isCancellationRequested = true; return Buffer.from('png'); } });
  await h.commands.get('codesnap-rs.save')();
  assert.equal(h.calls.writes.length, 0);
});

test('the original command opens and reuses a preview without a save dialog or clipboard write', async () => {
  let dialogs = 0;
  const h = harness({ dialog: async () => { dialogs++; } });
  await h.commands.get('codesnap.start')();
  await h.commands.get('codesnap.start')();
  assert.equal(h.calls.previews.length, 1);
  assert.equal(dialogs, 0);
  assert.equal(h.calls.renders.length, 0);
  h.calls.previews[0].dispose();
  await h.commands.get('codesnap.start')();
  assert.equal(h.calls.previews.length, 2);
});

test('preview saves use cached image bytes even if the editor changes while choosing a file', async () => {
  let h;
  h = harness({ dialog: async () => {
    h.vscode.window.activeTextEditor.document.getText = () => 'new selection';
    return { path: '/test/out.png', fsPath: 'C:\\test\\out.png' };
  } });
  await h.commands.get('codesnap.start')();
  const snapshot = { request: h.previewHooks.readSelection(), png: Buffer.from('visible preview png') };
  await h.previewHooks.capture('save', snapshot);
  assert.equal(h.calls.renders.length, 0);
  assert.equal(h.calls.writes[0].data.toString(), 'visible preview png');
});

test('native renderer pipes Unicode and shell metacharacters and produces scaled PNGs', async () => {
  const request = {
    code: '# សួស្តី — café\nprint("$(); & < > \\\" quoted")', filename: 'unicode sample.py',
    copy: false, scale: 1, theme: 'candy', background: '#abb8c3', windowControls: true,
    lineNumbers: true, startLine: 9, title: 'Unicode sample'
  };
  const directory = path.join(__dirname, '..');
  const first = await render(directory, request);
  const second = await render(directory, { ...request, scale: 2 });
  const small = validatePng(first);
  const large = validatePng(second);
  assert.ok(small.width > 100 && small.height > 100);
  assert.equal(large.width, small.width * 2);
  assert.equal(large.height, small.height * 2);
  assert.throws(() => validatePng(Buffer.from('not a PNG')));
});

test('invalid native theme reports failure rather than saving an error as a PNG', async () => {
  await assert.rejects(render(path.join(__dirname, '..'), {
    code: 'print(1)', filename: 'sample.py', copy: false, scale: 1,
    theme: 'no-such-local-theme-987654321', background: '#abb8c3', windowControls: true
  }));
});
