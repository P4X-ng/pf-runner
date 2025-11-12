import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pExecFile = promisify(execFile);

async function cmdExists(cmd) {
  try {
    await pExecFile('sh', ['-c', `command -v ${cmd} >/dev/null 2>&1`]);
    return true;
  } catch {
    return false;
  }
}

test('shell: echo via sh', async () => {
  const { stdout } = await pExecFile('sh', ['-c', 'echo hello']);
  assert.equal(stdout.trim(), 'hello');
});

test('shell: simple pipeline count', async () => {
  const { stdout } = await pExecFile('sh', ['-c', 'printf "a\nb\n" | grep -c .']);
  assert.equal(stdout.trim(), '2');
});

test('interpreter: node eval 6*7', async () => {
  const { stdout } = await pExecFile('node', ['-e', 'console.log(6*7)'], {
    env: { ...process.env, NO_COLOR: '1', NODE_DISABLE_COLORS: '1', FORCE_COLOR: '0' },
  });
  assert.equal(stdout.trim(), '42');
});

test('interpreter: python3 prints 42 (skip if missing)', async (t) => {
  if (!(await cmdExists('python3'))) return t.skip('python3 not available');
  const { stdout } = await pExecFile('python3', ['-c', 'print(6*7)']);
  assert.equal(stdout.trim(), '42');
});

test('compiled: gcc hello world (skip if missing)', async (t) => {
  if (!(await cmdExists('gcc'))) return t.skip('gcc not available');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-cli-c-'));
  const src = path.join(tmp, 'hello.c');
  const out = path.join(tmp, 'hello');
  fs.writeFileSync(src, '#include <stdio.h>\nint main(){ printf("42\\n"); return 0; }\n');
  try {
    await pExecFile('gcc', [src, '-o', out]);
    const { stdout } = await pExecFile(out, []);
    assert.equal(stdout.trim(), '42');
  } finally {
    try { fs.unlinkSync(out); } catch {}
    try { fs.unlinkSync(src); } catch {}
    try { fs.rmdirSync(tmp); } catch {}
  }
});
