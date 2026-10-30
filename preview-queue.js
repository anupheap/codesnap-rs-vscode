'use strict';

// One renderer at a time. New selections cancel and supersede older work.
class PreviewQueue {
  constructor({ render, createToken, onResult, onStatus, delay = 300 }) {
    Object.assign(this, { render, createToken, onResult, onStatus, delay });
    this.generation = 0;
    this.active = null;
    this.pending = null;
    this.timer = null;
    this.snapshot = null;
    this.key = null;
    this.disposed = false;
  }

  update(request, immediate = false, force = false) {
    if (this.disposed) return;
    const key = JSON.stringify(request);
    if (!force && key === this.key) return;
    this.key = key;
    const generation = ++this.generation;
    clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    this.active?.cancel();
    if (!force && this.snapshot?.key === key) {
      this.onResult(this.snapshot);
      return;
    }
    this.pending = { request, key, generation };
    this.onStatus('rendering', 'Updating preview…');
    if (immediate) this.drain();
    else this.timer = setTimeout(() => { this.timer = null; this.drain(); }, this.delay);
  }

  async drain() {
    if (this.disposed || this.active || !this.pending || this.timer) return;
    const job = this.pending;
    this.pending = null;
    const tokenSource = this.createToken();
    this.active = tokenSource;
    try {
      const png = await this.render(job.request, tokenSource.token);
      if (png && !this.disposed && job.generation === this.generation) {
        this.snapshot = { request: job.request, png, key: job.key };
        this.onResult(this.snapshot);
      }
    } catch (error) {
      if (!this.disposed && job.generation === this.generation) {
        this.key = null; // Allow retrying the same selection after a failure.
        this.onStatus('error', error.message);
      }
    } finally {
      tokenSource.dispose();
      this.active = null;
      this.drain();
    }
  }

  current() {
    return this.snapshot?.key === this.key ? this.snapshot : null;
  }

  pause() {
    ++this.generation;
    clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    this.key = null;
    this.active?.cancel();
  }

  dispose() {
    this.disposed = true;
    this.pause();
    this.snapshot = null;
  }
}

module.exports = { PreviewQueue };
