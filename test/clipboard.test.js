'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { copyPng } = require('../clipboard');
const { executablePath } = require('../renderer');

function fakeSpawn(callback) {
  return (command, args, options) => {
    const child = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.end = data => queueMicrotask(() => callback({ child, command, args, options, data }));
    child.kill = () => child.emit('exit', null);
    return child;
  };
}

test('native executable resolves correctly for Windows and Linux', () => {
  assert.equal(executablePath('/extension', 'linux'), path.join('/extension', 'bin', 'codesnap'));
  assert.equal(executablePath('/extension', 'win32'), path.join('/extension', 'bin', 'codesnap.exe'));
  assert.throws(() => executablePath('/extension', 'darwin'), /supports Windows and Linux/);
});

test('Wayland copies PNG bytes to wl-copy without a shell', async () => {
  const png = Buffer.from('PNG');
  await copyPng(png, undefined, { env: { WAYLAND_DISPLAY: 'wayland-0' }, spawn: fakeSpawn(call => {
    assert.equal(call.command, 'wl-copy');
    assert.deepEqual(call.args, ['--type', 'image/png']);
    assert.equal(call.options.shell, false);
    assert.equal(call.data, png);
    call.child.emit('exit', 0);
  }) });
});

test('X11 uses xclip with PNG MIME type and clipboard selection', async () => {
  await copyPng(Buffer.from('PNG'), undefined, { env: { DISPLAY: ':99' }, spawn: fakeSpawn(call => {
    assert.equal(call.command, 'xclip');
    assert.deepEqual(call.args, ['-selection', 'clipboard', '-t', 'image/png', '-i']);
    call.child.emit('exit', 0);
  }) });
});

test('missing clipboard helper reports the installable package', async () => {
  await assert.rejects(copyPng(Buffer.from('PNG'), undefined, {
    env: { WAYLAND_DISPLAY: 'wayland-0' }, spawn: fakeSpawn(call => call.child.emit('error', Object.assign(new Error(), { code: 'ENOENT' })))
  }), /Install wl-clipboard/);
});

test('headless sessions report that saving is available', async () => {
  await assert.rejects(copyPng(Buffer.from('PNG'), undefined, { env: {} }), /Save the PNG instead/);
});

test('cancelled clipboard operations do not launch a helper', async () => {
  let spawned = false;
  const result = await copyPng(Buffer.from('PNG'), { isCancellationRequested: true }, {
    env: { DISPLAY: ':99' }, spawn: () => { spawned = true; }
  });
  assert.equal(result, null);
  assert.equal(spawned, false);
});
