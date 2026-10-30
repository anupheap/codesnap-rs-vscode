'use strict';

const path = require('node:path');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const { copyPng } = require('./clipboard');
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function normalizeCode(text, tabSize = 4) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  const indents = lines.filter(line => line.trim()).map(line => /^\s*/.exec(line)[0].length);
  const indent = indents.length ? indents.reduce((min, n) => Math.min(min, n), Infinity) : 0;
  const width = Math.max(1, Math.min(16, Number(tabSize) || 4));
  return lines.map(line => {
    let column = 0;
    return line.slice(indent).replace(/[^\t]|\t/g, char => {
      if (char !== '\t') { column += 1; return char; }
      const spaces = width - column % width;
      column += spaces;
      return ' '.repeat(spaces);
    });
  }).join('\n');
}

function validatePng(data) {
  if (!Buffer.isBuffer(data) || data.length < 33 || !data.subarray(0, 8).equals(PNG_SIGNATURE) || data.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('The Rust renderer did not return a valid PNG.');
  }
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function executablePath(extensionPath, platform = process.platform) {
  if (!['win32', 'linux'].includes(platform)) throw new Error('This extension currently supports Windows and Linux.');
  return path.join(extensionPath, 'bin', platform === 'win32' ? 'codesnap.exe' : 'codesnap');
}

async function render(extensionPath, request, token) {
  if (request.copy && process.platform === 'linux') {
    const png = await render(extensionPath, { ...request, copy: false }, token);
    if (png === null) return null;
    return copyPng(png, token);
  }
  const executable = executablePath(extensionPath);
  if (process.platform === 'linux') {
    try { fs.accessSync(executable, fs.constants.X_OK); }
    catch { fs.chmodSync(executable, 0o755); }
  }
  const args = [
    '--config', path.join(extensionPath, 'config.json'),
    '--from-code', '-', '--file-path', request.filename,
    '--output', request.copy ? 'clipboard' : 'raw', '--silent', '--disable-watermark',
    '--scale-factor', String(request.scale), '--code-theme', request.theme,
    '--background', request.background,
    '--mac-window-bar', String(request.windowControls)
  ];
  if (request.lineNumbers) args.push('--has-line-number', '--start-line-number', String(request.startLine));
  if (request.title) args.push('--title', request.title);

  return new Promise((resolve, reject) => {
    let cancellation;
    let inputError;
    const child = execFile(executable, args, {
      encoding: 'buffer', windowsHide: true, shell: false, timeout: 45000,
      maxBuffer: 64 * 1024 * 1024, cwd: extensionPath
    }, (error, stdout, stderr) => {
      cancellation?.dispose();
      if (token?.isCancellationRequested) { resolve(null); return; }
      const diagnostics = (stderr.toString('utf8') || (error || request.copy ? stdout.toString('utf8') : ''))
        .replace(/\u001b\[[0-9;]*m/g, '').trim();
      // Check diagnostics and the PNG payload as well as the process exit status.
      if (error || inputError || diagnostics) {
        reject(new Error((diagnostics || error?.message || inputError?.message).slice(0, 800)));
        return;
      }
      try {
        if (!request.copy) validatePng(stdout);
        resolve(stdout);
      } catch (failure) { reject(failure); }
    });
    child.stdin.on('error', error => { inputError = error; });
    cancellation = token?.onCancellationRequested(() => child.kill());
    if (token?.isCancellationRequested) child.kill();
    else child.stdin.end(request.code, 'utf8');
  });
}

module.exports = { normalizeCode, validatePng, render, executablePath };
