.PHONY: help dev api worker run-once build tidy check-env

# Default: show how to run the backend
help:
	@echo "NGOreality backend (from backend/)"
	@echo ""
	@echo "  make dev       Start API + worker together (recommended for local dev)"
	@echo "  make api       HTTP API only (:8080)"
	@echo "  make worker    Monitoring loop only (background jobs)"
	@echo "  make run-once  Single check cycle, then exit"
	@echo "  make build     Compile bin/api and bin/worker"
	@echo ""
	@echo "Requires backend/.env with DATABASE_URL — see README.md"

# Recommended: both processes (same as production, on your machine)
dev: check-env
	@chmod +x scripts/dev.sh 2>/dev/null || true
	@./scripts/dev.sh

api: check-env
	go run ./cmd/api

worker: check-env
	go run ./cmd/worker

run-once: check-env
	WORKER_RUN_ONCE=true go run ./cmd/worker

check-env:
	@test -n "$$DATABASE_URL" || grep -qE '^DATABASE_URL=.+.' .env 2>/dev/null || (echo "Missing DATABASE_URL. Copy .env.example → .env and set your Supabase Postgres URI." && exit 1)

tidy:
	go mod tidy

build:
	go build -o bin/worker ./cmd/worker
	go build -o bin/api ./cmd/api
