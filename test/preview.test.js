'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PreviewQueue } = require('../preview-queue');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(condition) {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for preview');
    await sleep(5);
  }
}

function harness() {
  const renders = [], results = [], statuses = [];
  const queue = new PreviewQueue({
    delay: 15,
    createToken: () => ({ token: { isCancellationRequested: false }, cancel() { this.token.isCancellationRequested = true; }, dispose() {} }),
    render: (request, token) => new Promise((resolve, reject) => renders.push({ request, token, resolve, reject })),
    onResult: snapshot => results.push(snapshot),
    onStatus: (kind, text) => statuses.push({ kind, text })
  });
  return { queue, renders, results, statuses };
}

test('rapid selections debounce to one render of the latest selection', async () => {
  const h = harness();
  h.queue.update({ code: 'one' });
  h.queue.update({ code: 'two' });
  h.queue.update({ code: 'three' });
  await until(() => h.renders.length === 1);
  assert.equal(h.renders[0].request.code, 'three');
  h.renders[0].resolve(Buffer.from('png'));
  await until(() => h.results.length === 1);
  assert.equal(h.queue.current().request.code, 'three');
  h.queue.dispose();
});

test('superseded work is cancelled, never shown, and never overlaps another preview render', async () => {
  const h = harness();
  h.queue.update({ code: 'first' }, true);
  h.queue.update({ code: 'second' }, true);
  h.queue.update({ code: 'third' }, true);
  assert.equal(h.renders[0].token.isCancellationRequested, true);
  assert.equal(h.renders.length, 1);
  h.renders[0].resolve(Buffer.from('stale'));
  await until(() => h.renders.length === 2);
  assert.equal(h.results.length, 0);
  assert.equal(h.renders[1].request.code, 'third');
  h.renders[1].resolve(Buffer.from('current'));
  await until(() => h.results.length === 1);
  assert.equal(h.queue.current().png.toString(), 'current');
  h.queue.dispose();
});

test('hidden and closed panels cancel active work and discard pending selections', async () => {
  const h = harness();
  h.queue.update({ code: 'one' }, true);
  h.queue.update({ code: 'two' });
  h.queue.pause();
  assert.equal(h.renders[0].token.isCancellationRequested, true);
  h.renders[0].resolve(Buffer.from('stale'));
  await sleep(25);
  assert.equal(h.renders.length, 1);
  assert.equal(h.results.length, 0);
  h.queue.dispose();
  h.queue.update({ code: 'closed' }, true);
  assert.equal(h.renders.length, 1);
});

test('unchanged selections are cached and the saved snapshot stays stable during updates', async () => {
  const h = harness();
  h.queue.update({ code: 'one' }, true);
  h.renders[0].resolve(Buffer.from('visible png'));
  await until(() => h.results.length === 1);
  const saved = h.queue.current();
  h.queue.update({ code: 'one' }, true);
  assert.equal(h.renders.length, 1);
  h.queue.update({ code: 'two' });
  assert.equal(h.queue.current(), null);
  assert.equal(saved.request.code, 'one');
  assert.equal(saved.png.toString(), 'visible png');
  h.queue.pause();
  h.queue.update({ code: 'one' }, true);
  assert.equal(h.renders.length, 1);
  assert.equal(h.queue.current(), saved);
  h.queue.dispose();
});

test('failed previews can be refreshed with the same selection', async () => {
  const h = harness();
  h.queue.update({ code: 'one' }, true);
  h.renders[0].reject(new Error('bad theme'));
  await until(() => h.statuses.some(status => status.kind === 'error'));
  h.queue.update({ code: 'one' }, true);
  assert.equal(h.renders.length, 2);
  h.renders[1].resolve(Buffer.from('good'));
  await until(() => h.results.length === 1);
  h.queue.dispose();
});
