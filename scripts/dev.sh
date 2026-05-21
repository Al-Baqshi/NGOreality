#!/usr/bin/env bash
# yarn dev:all — frontend + API (two processes, one terminal).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules ]]; then
  echo "Run 'yarn install' first."
  exit 1
fi

echo ""
echo "  Frontend  →  http://localhost:5173   (yarn dev)"
echo "  API       →  http://localhost:8080   (yarn api)"
echo "  Ctrl+C stops both"
echo ""

cleanup() {
  trap - INT TERM
  kill "${WEB_PID:-}" "${API_PID:-}" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

if command -v yarn >/dev/null 2>&1; then
  yarn dev &
else
  npm run dev &
fi
WEB_PID=$!

go run -C "$ROOT/backend" ./cmd/api &
API_PID=$!

wait "$WEB_PID" "$API_PID"
