'use strict';

const vscode = require('vscode');
const path = require('node:path');
const { normalizeCode, render } = require('./renderer');
const { createPreviewPanel } = require('./preview');

const UNTITLED_EXTENSIONS = {
  javascript: 'js', javascriptreact: 'jsx', typescript: 'ts', typescriptreact: 'tsx',
  python: 'py', rust: 'rs', cpp: 'cpp', c: 'c', csharp: 'cs', shellscript: 'sh',
  powershell: 'ps1', plaintext: 'txt', markdown: 'md'
};

function activate(context) {
  let busy = false;
  let lastDirectory;
  let preview;

  function readSelection(editor = vscode.window.activeTextEditor, notify = true) {
    if (!editor || editor.document.isClosed || editor.selections.length !== 1 || editor.selection.isEmpty) {
      if (notify) vscode.window.showInformationMessage('Select one block of code, then run CodeSnap.');
      return null;
    }
    const selection = editor.selection;
    const code = normalizeCode(editor.document.getText(selection), editor.options.tabSize);
    if (!code.trim()) {
      if (notify) vscode.window.showInformationMessage('Select some code to capture.');
      return null;
    }
    if (code.length > 200000) {
      if (notify) vscode.window.showErrorMessage('CodeSnap RS: select a smaller snippet (up to 200,000 characters).');
      return null;
    }
    const config = vscode.workspace.getConfiguration('codesnap');
    const rust = vscode.workspace.getConfiguration('codesnap-rs');
    const filename = editor.document.isUntitled
      ? `snippet.${UNTITLED_EXTENSIONS[editor.document.languageId] || editor.document.languageId}`
      : path.basename(editor.document.fileName);
    return {
      code, filename, copy: false,
      scale: rust.get('scaleFactor', 2), theme: rust.get('theme', 'candy'),
      background: config.get('transparentBackground', false) ? '#00000000' : config.get('backgroundColor', '#abb8c3'),
      windowControls: config.get('showWindowControls', true),
      lineNumbers: config.get('showLineNumbers', true),
      startLine: config.get('realLineNumbers', false) ? selection.start.line + 1 : 1,
      title: config.get('showWindowTitle', false) ? filename : ''
    };
  }

  async function capture(action, snapshot) {
    if (busy) {
      vscode.window.setStatusBarMessage('CodeSnap RS: a capture is already in progress.', 2500);
      return;
    }
    const source = snapshot?.request || readSelection();
    if (!source) return;
    const copy = (action || vscode.workspace.getConfiguration('codesnap').get('shutterAction', 'save')) === 'copy';
    const request = { ...source, copy };
    const { filename } = request;
    busy = true;
    try {
      let destination;
      if (!copy) {
        const root = lastDirectory || vscode.workspace.workspaceFolders?.[0]?.uri;
        const basename = filename.replace(/\.[^.]+$/, '') || 'code';
        destination = await vscode.window.showSaveDialog({
          defaultUri: root ? vscode.Uri.joinPath(root, `${basename}.png`) : vscode.Uri.file(path.join(require('node:os').homedir(), 'Desktop', `${basename}.png`)),
          filters: { 'PNG image': ['png'] }, saveLabel: 'Save Screenshot'
        });
        if (!destination) return;
        if (!destination.path.toLowerCase().endsWith('.png')) {
          vscode.window.showErrorMessage('CodeSnap RS: choose a filename ending in .png.');
          return;
        }
      }
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: copy ? 'CodeSnap RS: copying image…' : 'CodeSnap RS: rendering image…',
        cancellable: true
      }, async (_progress, token) => {
        const result = !copy && snapshot?.png ? snapshot.png : await render(context.extensionPath, request, token);
        if (result === null || token.isCancellationRequested) return;
        if (copy) {
          vscode.window.setStatusBarMessage('CodeSnap RS: image copied to clipboard.', 4000);
        } else {
          await vscode.workspace.fs.writeFile(destination, result);
          lastDirectory = vscode.Uri.joinPath(destination, '..');
          vscode.window.setStatusBarMessage(`CodeSnap RS: saved ${path.basename(destination.fsPath)}.`, 4000);
        }
      });
    } catch (error) {
      vscode.window.showErrorMessage(`CodeSnap RS: ${error.message}`);
    } finally {
      busy = false;
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('codesnap.start', () => {
      if (!preview || preview.disposed) preview = createPreviewPanel(vscode, context, { readSelection, capture });
      preview.show(vscode.window.activeTextEditor);
    }),
    vscode.commands.registerCommand('codesnap-rs.save', () => capture('save')),
    vscode.commands.registerCommand('codesnap-rs.copy', () => capture('copy')),
    { dispose: () => preview?.dispose() }
  );
}

module.exports = { activate };
