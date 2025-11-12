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

function mktmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('shell: word frequency top word via pipeline', async () => {
  const tmp = mktmp('pf-cli-shell-');
  try {
    const wordsPath = path.join(tmp, 'words.txt');
    fs.writeFileSync(wordsPath, 'foo bar foo baz foo qux bar foo baz\n');
    const bashAvailable = await cmdExists('bash');
    const shell = bashAvailable ? 'bash' : 'sh';
    const prefix = bashAvailable ? 'set -euo pipefail; ' : 'set -eu; ';
    const script = `${prefix}cat ${wordsPath} | tr -s '[:space:]' '\\n' | grep -v '^$' | sort | uniq -c | sort -nr | awk 'NR==1{print $1":"$2}'`;
    const args = bashAvailable ? ['-lc', script] : ['-c', script];
    const { stdout } = await pExecFile(shell, args);
    // Expect top word to be foo with count 4
    assert.equal(stdout.trim(), '4:foo');
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
});

test('node: sum numbers from JSON file', async () => {
  const tmp = mktmp('pf-cli-node-');
  try {
    const dataPath = path.join(tmp, 'nums.json');
    const numbers = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100 => 5050
    fs.writeFileSync(dataPath, JSON.stringify(numbers));
    const jsPath = path.join(tmp, 'sum.js');
    fs.writeFileSync(jsPath, `import fs from 'node:fs/promises';
const p = process.argv[2];
const arr = JSON.parse(await fs.readFile(p, 'utf8'));
console.log(arr.reduce((a,b)=>a+b,0));
`);
    const { stdout } = await pExecFile('node', [jsPath, dataPath], {
      env: { ...process.env, NO_COLOR: '1', NODE_DISABLE_COLORS: '1', FORCE_COLOR: '0' },
    });
    assert.equal(stdout.trim(), '5050');
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
});

test('python3: parse JSON and compute product (skip if missing)', async (t) => {
  if (!(await cmdExists('python3'))) return t.skip('python3 not available');
  const tmp = mktmp('pf-cli-py-');
  try {
    const dataPath = path.join(tmp, 'nums.json');
    fs.writeFileSync(dataPath, JSON.stringify([1,2,3,4,5]));
    const pyPath = path.join(tmp, 'prod.py');
    fs.writeFileSync(pyPath, `import json,sys
with open(sys.argv[1]) as f:
  arr=json.load(f)
prod=1
for x in arr:
  prod*=x
print(prod)
`);
    const { stdout } = await pExecFile('python3', [pyPath, dataPath]);
    assert.equal(stdout.trim(), '120');
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
});

test('gcc: count lines in a text file (skip if missing)', async (t) => {
  const hasGcc = await cmdExists('gcc');
  if (!hasGcc) return t.skip('gcc not available');
  const tmp = mktmp('pf-cli-c-');
  try {
    const dataPath = path.join(tmp, 'data.txt');
    const lines = Array.from({ length: 7 }, (_, i) => `line-${i+1}`);
    fs.writeFileSync(dataPath, lines.join('\n') + '\n');
    const cPath = path.join(tmp, 'count_lines.c');
    const out = path.join(tmp, 'count_lines');
  fs.writeFileSync(cPath, `#include <stdio.h>\n#include <stdlib.h>\nint main(int argc, char** argv){\n if(argc<2){fprintf(stderr, "usage: %s <file>\\n", argv[0]); return 2;}\n FILE* f=fopen(argv[1], "r"); if(!f){perror("fopen"); return 1;}\n int c=0; int ch; int last_nl=1;\n while((ch=fgetc(f))!=EOF){ if(ch=='\\n'){ c++; last_nl=1; } else { last_nl=0; } }\n if(!last_nl) c++; fclose(f);\n printf("LINES=%d\\n", c); return 0; }\n`);
    await pExecFile('gcc', [cPath, '-O2', '-o', out]);
    const { stdout } = await pExecFile(out, [dataPath]);
    assert.equal(stdout.trim(), 'LINES=7');
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
});
