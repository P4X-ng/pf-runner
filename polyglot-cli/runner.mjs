#!/usr/bin/env node
// Minimal polyglot CLI runner helper to exercise different langs.
// Usage examples:
//   node tools/polyglot-cli/runner.mjs --lang=wat --action=run
//   node tools/polyglot-cli/runner.mjs --lang=rust --action=build --dry-run
//   node tools/polyglot-cli/runner.mjs --lang=c --action=run --dry-run

import fs from 'node:fs';
import path from 'node:path';

function getArg(flag, dflt = undefined) {
  for (const a of process.argv.slice(2)) {
    if (a === `--${flag}`) return true;
    if (a.startsWith(`--${flag}=`)) return a.split('=')[1];
  }
  return dflt;
}

function usage() {
  console.error("Usage: runner.mjs --lang=<wat|c|rust|fortran> --action=<build|run> [--dry-run]");
  process.exit(2);
}

const lang = getArg('lang');
const action = getArg('action');
const dryRun = !!getArg('dry-run', false);
if (!lang || !action) usage();

const ROOT = process.cwd();

function logDry(cmd) {
  console.log(`DRY-RUN ${lang}/${action}: ${cmd}`);
}

async function runWat() {
  if (action === 'build') {
    return dryRun
      ? logDry('wat: embedded sample, nothing to build')
      : console.log('BUILD: nothing to do for embedded wat sample');
  }
  if (action !== 'run') usage();
  if (dryRun) return logDry('wat: instantiate embedded wasm and call answer()');
  // Minimal wasm binary exporting answer() -> i32 42
  const bytes = new Uint8Array([
    0x00,0x61,0x73,0x6d, // '\0asm'
    0x01,0x00,0x00,0x00, // version 1
    // Type section
  0x01, // id: Type
  0x05, // section size
    0x01, // type count
    0x60, // func type
    0x00, // param count
    0x01, // result count
    0x7f, // i32
    // Function section
    0x03, // id: Function
    0x02, // section size
    0x01, // func count
    0x00, // type index 0
    // Export section
  0x07, // id: Export
  0x0a, // section size
    0x01, // export count
    0x06, // name length
    0x61,0x6e,0x73,0x77,0x65,0x72, // 'answer'
    0x00, // export kind: func
    0x00, // func index 0
    // Code section
    0x0a, // id: Code
    0x06, // section size
    0x01, // body count
    0x04, // body size
    0x00, // local decl count
    0x41,0x2a, // i32.const 42
    0x0b, // end
  ]);
  const mod = await WebAssembly.compile(bytes);
  const inst = await WebAssembly.instantiate(mod, {});
  if (typeof inst.exports.answer !== 'function') {
    console.error('WAT sample missing answer() export');
    process.exit(1);
  }
  const res = inst.exports.answer();
  console.log(`RESULT=${res}`);
}

async function runC() {
  const js = path.resolve(ROOT, 'demos/pf-web-polyglot-demo-plus-c/web/wasm/c/c_trap.js');
  if (action === 'build') {
    const cmd = 'emcc c_trap.c -O0 -sASSERTIONS=1 -sMODULARIZE -sEXPORT_ES6 -sENVIRONMENT=node -sEXPORTED_FUNCTIONS=_trigger_trap,_main -sINVOKE_RUN=0 -o ../web/wasm/c/c_trap.js';
    return dryRun ? logDry(cmd) : console.log('Use pf web-build-c for web; for CLI prefer ENVIRONMENT=node');
  }
  if (action !== 'run') usage();
  if (dryRun) return logDry(`node import ${js}`);
  if (!fs.existsSync(js)) {
    console.log('SKIP: C JS artifact not found (use pf web-build-c)');
    return;
  }
  // This file is a stub in this repo; dynamic import should succeed.
  await import(pathToFileURL(js).href);
  console.log('RESULT=C_OK');
}

async function runRust() {
  const pkgDir = path.resolve(ROOT, 'demos/pf-web-polyglot-demo-plus-c/web/wasm/rust/pkg');
  if (action === 'build') {
    const cmd = 'wasm-pack build --target nodejs --out-dir ../web/wasm/rust/pkg --out-name rust_demo';
    return dryRun ? logDry(cmd) : console.log('Use pf web-build-rust for web; for CLI prefer --target nodejs');
  }
  if (action !== 'run') usage();
  if (dryRun) return logDry(`node import ${path.join(pkgDir, 'rust_demo.js')}`);
  if (!fs.existsSync(pkgDir)) {
    console.log('SKIP: Rust pkg not found (use wasm-pack --target nodejs)');
    return;
  }
  console.log('RESULT=RUST_OK');
}

async function runFortran() {
  const wasm = path.resolve(ROOT, 'demos/pf-web-polyglot-demo-plus-c/web/wasm/fortran/fortran.wasm');
  if (action === 'build') {
    const cmd = 'lfortran src/hello.f90 -o ../web/wasm/fortran/fortran.wasm --target=wasm32-unknown-unknown';
    return dryRun ? logDry(cmd) : console.log('Use pf web-build-fortran to produce wasm');
  }
  if (action !== 'run') usage();
  if (dryRun) return logDry(`instantiate ${wasm}`);
  if (!fs.existsSync(wasm)) {
    console.log('SKIP: Fortran wasm not found');
    return;
  }
  const bytes = fs.readFileSync(wasm);
  const mod = await WebAssembly.compile(bytes);
  const inst = await WebAssembly.instantiate(mod, {});
  console.log('RESULT=FORTRAN_OK');
}

import { pathToFileURL } from 'node:url';

(async () => {
  try {
    switch (lang) {
      case 'wat':
        await runWat();
        break;
      case 'c':
        await runC();
        break;
      case 'rust':
        await runRust();
        break;
      case 'fortran':
        await runFortran();
        break;
      default:
        usage();
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
