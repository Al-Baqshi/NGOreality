#!/usr/bin/env bash
# Local backend: HTTP API + monitoring worker (two processes, one terminal).
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BACKEND_DIR"

if [[ ! -f .env ]] && [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Missing backend/.env"
  echo "  cp backend/.env.example backend/.env"
  echo "  Then set DATABASE_URL (Supabase → Database → Connection string → URI)."
  exit 1
fi

echo ""
echo "  NGOreality backend (one codebase, two processes)"
echo "  ────────────────────────────────────────────────"
echo "  API     →  http://localhost:8080/health"
echo "  Worker  →  website checks every \${WORKER_CHECK_INTERVAL:-15m}"
echo "  Ctrl+C stops both"
echo ""

cleanup() {
  trap - INT TERM
  kill "${API_PID:-}" "${WORKER_PID:-}" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

go run ./cmd/api &
API_PID=$!

go run ./cmd/worker &
WORKER_PID=$!

wait "$API_PID" "$WORKER_PID"
