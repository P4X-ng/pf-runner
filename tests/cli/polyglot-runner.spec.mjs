import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../');
const RUNNER = path.join(ROOT, 'tools/polyglot-cli/runner.mjs');

function runNode(args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile('node', args, { cwd: ROOT, ...opts }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout: String(stdout).trim(), stderr: String(stderr).trim() });
    });
  });
}

test('wat run returns 42', async () => {
  const { stdout } = await runNode([RUNNER, '--lang=wat', '--action=run']);
  assert.match(stdout, /RESULT=42/);
});

test('dry-run: C build shows emcc command', async () => {
  const { stdout } = await runNode([RUNNER, '--lang=c', '--action=build', '--dry-run']);
  assert.match(stdout, /DRY-RUN c\/build: emcc/);
});

test('dry-run: C run shows node import', async () => {
  const { stdout } = await runNode([RUNNER, '--lang=c', '--action=run', '--dry-run']);
  assert.match(stdout, /DRY-RUN c\/run: node import/);
});

test('dry-run: Rust build shows wasm-pack cmd', async () => {
  const { stdout } = await runNode([RUNNER, '--lang=rust', '--action=build', '--dry-run']);
  assert.match(stdout, /DRY-RUN rust\/build: wasm-pack build/);
});

test('dry-run: Fortran build shows lfortran cmd', async () => {
  const { stdout } = await runNode([RUNNER, '--lang=fortran', '--action=build', '--dry-run']);
  assert.match(stdout, /DRY-RUN fortran\/build: lfortran/);
});
