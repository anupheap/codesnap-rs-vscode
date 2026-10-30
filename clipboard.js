'use strict';
const childProcess = require('node:child_process');

function copyPng(png, token, { env = process.env, spawn = childProcess.spawn } = {}) {
  const wayland = Boolean(env.WAYLAND_DISPLAY);
  const command = wayland ? 'wl-copy' : 'xclip';
  const args = wayland ? ['--type', 'image/png'] : ['-selection', 'clipboard', '-t', 'image/png', '-i'];
  if (!wayland && !env.DISPLAY) return Promise.reject(new Error('Copy image needs a Linux desktop session. Save the PNG instead.'));
  if (token?.isCancellationRequested) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    // The helper forks to retain clipboard ownership. Do not keep its output pipes open.
    const child = spawn(command, args, { shell: false, stdio: ['pipe', 'ignore', 'ignore'] });
    let cancellation;
    let settled = false;
    const timer = setTimeout(() => { child.kill(); finish(new Error('Clipboard helper timed out.')); }, 15000);
    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cancellation?.dispose();
      if (token?.isCancellationRequested) resolve(null);
      else if (error) reject(error);
      else resolve(Buffer.alloc(0));
    }
    child.on('error', error => finish(error.code === 'ENOENT'
      ? new Error(`Copy image requires ${command}. Install ${wayland ? 'wl-clipboard' : 'xclip'}, or save the PNG instead.`)
      : error));
    child.on('exit', code => finish(code === 0 ? null : new Error(`${command} could not copy the image. Check your desktop clipboard session.`)));
    child.stdin.on('error', error => finish(error));
    cancellation = token?.onCancellationRequested(() => child.kill());
    if (token?.isCancellationRequested) child.kill();
    else child.stdin.end(png);
  });
}

module.exports = { copyPng };
