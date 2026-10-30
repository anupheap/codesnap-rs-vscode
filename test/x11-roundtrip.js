'use strict';
// Run only in an isolated Xvfb desktop; never uses the user's clipboard.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const { render } = require('../renderer');
const { copyPng } = require('../clipboard');

(async () => {
  const png = await render(path.join(__dirname, '..'), {
    code: 'print("Linux clipboard")', filename: 'clipboard.py', copy: false, scale: 1,
    theme: 'candy', background: '#abb8c3', windowControls: true,
    lineNumbers: true, startLine: 1
  });
  await copyPng(png);
  const pasted = execFileSync('xclip', ['-selection', 'clipboard', '-t', 'image/png', '-o'], { timeout: 5000 });
  assert.ok(pasted.equals(png), 'clipboard must retain exactly the generated PNG bytes');
  console.log(`X11 PNG clipboard round-trip passed (${png.length} bytes).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
