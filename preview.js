'use strict';
const { PreviewQueue } = require('./preview-queue');
const { previewHtml } = require('./preview-html');
const { render, validatePng } = require('./renderer');

function createPreviewPanel(vscode, context, { readSelection, capture }) {
  const panel = vscode.window.createWebviewPanel('codesnap-rs.preview', 'CodeSnap 📸',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, localResourceRoots: [] });
  let sourceEditor;
  let disposed = false;
  let status = { type: 'status', kind: 'empty', text: 'Select code in the editor to preview it here.' };
  const disposables = [];
  const post = message => { if (!disposed) void panel.webview.postMessage(message); };
  const sendImage = snapshot => {
    const dimensions = validatePng(snapshot.png);
    status = null;
    post({ type: 'image', data: snapshot.png.toString('base64'), filename: snapshot.request.filename, ...dimensions });
  };
  const queue = new PreviewQueue({
    createToken: () => new vscode.CancellationTokenSource(),
    render: (request, token) => render(context.extensionPath, request, token),
    onResult: sendImage,
    onStatus: (kind, text) => { status = { type: 'status', kind, text }; post(status); }
  });

  function update(editor = sourceEditor, immediate = false, force = false) {
    if (disposed || !panel.visible) return;
    const request = readSelection(editor, false);
    if (!request) return;
    sourceEditor = editor;
    queue.update(request, immediate, force);
  }

  disposables.push(
    panel.webview.onDidReceiveMessage(async message => {
      if (disposed || !message || typeof message.type !== 'string') return;
      if (message.type === 'ready') {
        const snapshot = queue.current();
        if (snapshot) sendImage(snapshot);
        else if (status) post(status);
      } else if (message.type === 'refresh') {
        update(sourceEditor, true, true);
      } else if (['save', 'copy', 'shutter'].includes(message.type)) {
        const snapshot = queue.current();
        if (!snapshot) return;
        post({ type: 'exporting', value: true });
        try { await capture(message.type === 'shutter' ? undefined : message.type, snapshot); }
        finally { post({ type: 'exporting', value: false }); }
      }
    }),
    vscode.window.onDidChangeTextEditorSelection(event => {
      if (event.textEditor.selections.length !== 1 || event.textEditor.selection.isEmpty) return;
      sourceEditor = event.textEditor;
      update(sourceEditor);
    }),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document === sourceEditor?.document) update();
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('codesnap') || event.affectsConfiguration('codesnap-rs')) update();
    }),
    panel.onDidChangeViewState(() => {
      if (panel.visible) update(sourceEditor, true);
      else queue.pause();
    }),
    panel.onDidDispose(() => {
      disposed = true;
      queue.dispose();
      disposables.forEach(item => item.dispose());
    })
  );
  panel.webview.html = previewHtml();
  return {
    panel,
    get disposed() { return disposed; },
    show(editor) {
      if (editor && !editor.selection.isEmpty) sourceEditor = editor;
      panel.reveal(vscode.ViewColumn.Beside, true);
      update(sourceEditor, true);
    },
    dispose() { panel.dispose(); }
  };
}

module.exports = { createPreviewPanel };
