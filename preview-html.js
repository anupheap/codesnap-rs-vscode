'use strict';
const { randomBytes } = require('node:crypto');

function previewHtml() {
  const nonce = randomBytes(18).toString('base64');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<title>CodeSnap Preview</title>
<style nonce="${nonce}">
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; color: var(--vscode-foreground); font: var(--vscode-font-size)/1.5 var(--vscode-font-family); background: var(--vscode-editor-background); }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--vscode-panel-border); position: sticky; top: 0; background: var(--vscode-editor-background); z-index: 1; }
  button, select { font: inherit; border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; padding: 6px 12px; cursor: pointer; }
  button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary, select { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  button:disabled { opacity: .45; cursor: default; }
  button:focus-visible, select:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
  select { margin-left: auto; }
  #status { margin: 0; padding: 9px 16px; color: var(--vscode-descriptionForeground); min-height: 38px; overflow-wrap: anywhere; }
  #status.error { color: var(--vscode-errorForeground); }
  #stage { margin: 0 16px; min-height: 220px; height: calc(100vh - 190px); overflow: auto; display: grid; align-items: center; justify-items: center; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background-color: var(--vscode-editor-background); background-image: linear-gradient(45deg, #88888810 25%, transparent 25%), linear-gradient(-45deg, #88888810 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #88888810 75%), linear-gradient(-45deg, transparent 75%, #88888810 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0; }
  #empty { padding: 30px; max-width: 360px; text-align: center; color: var(--vscode-descriptionForeground); }
  img { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
  #stage.actual { display: block; }
  #stage.actual img { max-width: none; max-height: none; margin: auto; }
  [hidden] { display: none !important; }
  footer { display: flex; justify-content: center; align-items: center; padding: 14px; gap: 12px; color: var(--vscode-descriptionForeground); }
  #shutter { border-radius: 50%; width: 44px; height: 44px; padding: 0; font-size: 22px; }
  #detail { font-size: 12px; }
</style></head><body>
<div class="toolbar" role="toolbar" aria-label="Screenshot actions">
  <button id="save" disabled>Save PNG</button>
  <button id="copy" class="secondary" disabled>Copy image</button>
  <button id="refresh" class="secondary" title="Refresh the selected code">Refresh</button>
  <select id="zoom" aria-label="Preview zoom"><option value="fit">Fit</option><option value="actual">100%</option></select>
</div>
<p id="status" role="status" aria-live="polite">Select code in the editor to preview it here.</p>
<main id="stage"><p id="empty">Select a block of code.<br>The preview updates when you finish selecting.</p><img id="preview" alt="Code screenshot preview" hidden></main>
<footer><button id="shutter" disabled aria-label="Capture screenshot" title="Capture screenshot">📷</button><span id="detail">Ready when you are</span></footer>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const image = document.getElementById('preview');
  const status = document.getElementById('status');
  const actions = ['save', 'copy', 'shutter'].map(id => document.getElementById(id));
  const stage = document.getElementById('stage');
  let ready = false;
  let exporting = false;
  let imageRevision = 0;
  function enableActions() { actions.forEach(button => button.disabled = !ready || exporting); }
  for (const id of ['save', 'copy', 'shutter', 'refresh']) {
    document.getElementById(id).addEventListener('click', () => vscode.postMessage({ type: id }));
  }
  document.getElementById('zoom').addEventListener('change', event => {
    stage.classList.toggle('actual', event.target.value === 'actual');
  });
  window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'image') {
      ready = false;
      const revision = ++imageRevision;
      image.onload = () => { if (revision !== imageRevision) return; ready = true; image.hidden = false; document.getElementById('empty').hidden = true; enableActions(); };
      image.src = 'data:image/png;base64,' + message.data;
      status.className = '';
      status.textContent = message.filename;
      document.getElementById('detail').textContent = message.width + ' × ' + message.height + ' px';
    } else if (message.type === 'status') {
      ++imageRevision;
      ready = false;
      status.className = message.kind === 'error' ? 'error' : '';
      status.textContent = message.text;
    } else if (message.type === 'exporting') {
      exporting = message.value;
    }
    enableActions();
  });
  vscode.postMessage({ type: 'ready' });
</script></body></html>`;
}

module.exports = { previewHtml };
