#!/usr/bin/env node
/** Frontend + local API (Windows-friendly; no bash required). */
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const node = process.execPath;
const API_PORT = 8080;

function portInUse(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(true));
    tester.once('listening', () => tester.close(() => resolve(false)));
    tester.listen(port, '127.0.0.1');
  });
}

function run(name, args, cwd = repoRoot) {
  const child = spawn(node, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  });
  child.on('error', (err) => {
    console.error(`[dev:all] failed to start ${name}:`, err.message);
    shutdown(1);
  });
  return child;
}

const children = [];

function shutdown(code = 0) {
  for (const child of children) {
    if (child && !child.killed) {
      try {
        child.kill('SIGTERM');
      } catch {
        /* already exited */
      }
    }
  }
  process.exit(code);
}

async function main() {
  if (await portInUse(API_PORT)) {
    console.error(`\n  Port ${API_PORT} is already in use — usually a leftover "npm run api".\n`);
    if (process.platform === 'win32') {
      console.error('  Free it (PowerShell):');
      console.error(
        `    Get-NetTCPConnection -LocalPort ${API_PORT} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`,
      );
    } else {
      console.error(`  Free it: lsof -ti :${API_PORT} | xargs kill`);
    }
    console.error('\n  Or run frontend only: npm run dev\n');
    process.exit(1);
  }

  console.log('\n  dev:all — frontend (Vite) + API (:8080)\n  Ctrl+C stops both\n');

  children.push(
    run('frontend', [path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js')]),
    run('api', [path.join(repoRoot, 'scripts', 'go-run.mjs'), 'run', './cmd/api']),
  );

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  for (const child of children) {
    child.on('exit', (code, signal) => {
      if (signal === 'SIGTERM') return;
      if (code && code !== 0) shutdown(code);
    });
  }
}

main();
