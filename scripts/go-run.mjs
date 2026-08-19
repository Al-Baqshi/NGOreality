#!/usr/bin/env node
/**
 * Cross-platform Go launcher. Finds go.exe when it is not on PATH (common on Windows
 * until the terminal is restarted after install).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function goCandidates() {
  const list = [];
  if (process.env.GO_EXECUTABLE) list.push(process.env.GO_EXECUTABLE);

  if (process.platform === 'win32') {
    list.push('C:\\Program Files\\Go\\bin\\go.exe');
    list.push(path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Go', 'bin', 'go.exe'));
  }

  list.push('go');
  return list;
}

function findGo() {
  for (const candidate of goCandidates()) {
    if (!candidate) continue;
    const isPath = candidate.includes(path.sep) || candidate.includes('/');
    if (isPath) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    const check = spawnSync(candidate, ['version'], { encoding: 'utf8', shell: process.platform === 'win32' });
    if (check.status === 0) return candidate;
  }
  return null;
}

const go = findGo();
if (!go) {
  console.error(
    'Go was not found. Install from https://go.dev/dl/ and restart your terminal,\n' +
      'or set GO_EXECUTABLE to the full path of go.exe',
  );
  process.exit(1);
}

const userArgs = process.argv.slice(2);
const backendDir = path.join(repoRoot, 'backend');

/** npm run api / worker → go run ./cmd/... with cwd backend */
const result = spawnSync(go, userArgs, {
  cwd: backendDir,
  stdio: 'inherit',
  shell: false,
  env: process.env,
});

process.exit(result.status ?? 1);
