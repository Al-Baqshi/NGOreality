# Optional shortcuts — same as yarn scripts (run from repo root).
.PHONY: help dev dev-frontend dev-backend api worker install

help:
	@echo "Local dev (from repo root):"
	@echo "  make dev            frontend only (same as yarn dev)"
	@echo "  make dev-backend    Go API + worker (cd backend && make dev)"
	@echo "  yarn dev:all        frontend + API (no worker)"
	@echo "  yarn api            backend API only → :8080"
	@echo "  yarn worker         backend worker only"
	@echo ""
	@echo "Backend details: backend/README.md"

dev:
	yarn dev

dev-frontend: dev

dev-backend:
	$(MAKE) -C backend dev

api:
	yarn api

worker:
	yarn worker

install:
	yarn install
	cd backend && go mod tidy
