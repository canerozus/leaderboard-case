# Makefile — leaderboard-case
# Wraps docker compose + ops scripts so daily commands are one word.
# Default target prints help.

SHELL := /bin/bash

# ── Compose file shortcuts ────────────────────────────────────────────────────
DEV       := docker compose
PROD      := docker compose -f docker-compose.prod.yml --env-file .env.production
SCRIPTS   := ./infrastructure/scripts

.DEFAULT_GOAL := help

.PHONY: help
.PHONY: full-stack-up full-stack-down full-stack-restart full-stack-rebuild
.PHONY: logs logs-api logs-worker logs-frontend
.PHONY: ps status health
.PHONY: shell-api shell-worker shell-frontend shell-postgres shell-mongo shell-redis
.PHONY: migrate seed seed-traffic reset-db
.PHONY: test test-backend test-frontend typecheck-frontend build-frontend
.PHONY: clean clean-volumes
.PHONY: prod-up prod-down prod-build prod-logs prod-deploy prod-seed prod-reset-week

# ── Help ──────────────────────────────────────────────────────────────────────

help:  ## Show this help
	@printf "\n\033[1mLeaderboard Case — make targets\033[0m\n\n"
	@printf "  \033[36m%-22s\033[0m %s\n" "Daily dev"
	@grep -E '^(full-stack-up|full-stack-down|full-stack-restart|full-stack-rebuild|logs|logs-api|logs-worker|logs-frontend|ps|status|health):.*?##' $(MAKEFILE_LIST) | \
		awk -F':.*?## ' '{ printf "    \033[33m%-22s\033[0m %s\n", $$1, $$2 }'
	@printf "\n  \033[36m%-22s\033[0m %s\n" "Shells"
	@grep -E '^shell-[a-z]+:.*?##' $(MAKEFILE_LIST) | awk -F':.*?## ' '{ printf "    \033[33m%-22s\033[0m %s\n", $$1, $$2 }'
	@printf "\n  \033[36m%-22s\033[0m %s\n" "Data + tests"
	@grep -E '^(migrate|seed|seed-traffic|reset-db|test|test-backend|test-frontend|typecheck-frontend|build-frontend):.*?##' $(MAKEFILE_LIST) | \
		awk -F':.*?## ' '{ printf "    \033[33m%-22s\033[0m %s\n", $$1, $$2 }'
	@printf "\n  \033[36m%-22s\033[0m %s\n" "Cleanup"
	@grep -E '^(clean|clean-volumes):.*?##' $(MAKEFILE_LIST) | awk -F':.*?## ' '{ printf "    \033[33m%-22s\033[0m %s\n", $$1, $$2 }'
	@printf "\n  \033[36m%-22s\033[0m %s\n" "Production"
	@grep -E '^prod-[a-z-]+:.*?##' $(MAKEFILE_LIST) | awk -F':.*?## ' '{ printf "    \033[33m%-22s\033[0m %s\n", $$1, $$2 }'
	@printf "\n"

# ── Daily dev ────────────────────────────────────────────────────────────────

full-stack-up:  ## 🚀 Start the full dev stack (api + worker + frontend + dbs)
	@echo "▸ Bringing up dev stack…"
	$(DEV) up -d --build
	@echo ""
	@echo "✅ Stack up:"
	@echo "   Frontend:  http://localhost:5173"
	@echo "   API:       http://localhost:3000"
	@echo "   Postgres:  localhost:5432  (leaderboard / leaderboard)"
	@echo "   Mongo:     localhost:27017"
	@echo "   Redis:     localhost:6379"
	@echo ""
	@echo "Next: 'make seed' to populate 100k users, then open http://localhost:5173"

full-stack-down:  ## 🛑 Stop the full dev stack (volumes preserved)
	@echo "▸ Stopping dev stack…"
	$(DEV) down

full-stack-restart:  ## 🔄 Restart all containers (no rebuild)
	$(DEV) restart

full-stack-rebuild:  ## 🔨 Force rebuild + recreate (use after Dockerfile/dep changes)
	$(DEV) up -d --build --force-recreate

logs:  ## 📊 Tail logs from every service (follow)
	$(DEV) logs -f

logs-api:  ## 📊 API logs only
	$(DEV) logs -f api

logs-worker:  ## 📊 Worker logs only
	$(DEV) logs -f worker

logs-frontend:  ## 📊 Frontend (Vite) logs only
	$(DEV) logs -f frontend

ps:  ## 📋 Show running containers
	$(DEV) ps

status: ps  ## 📋 Alias for ps

health:  ## ❤️  Hit /healthz on the running api
	@curl -s http://localhost:3000/api/v1/healthz | jq . || echo "(api not reachable on :3000)"

# ── Shells ───────────────────────────────────────────────────────────────────

shell-api:  ## 🐚 Open a shell in the api container
	$(DEV) exec api sh

shell-worker:  ## 🐚 Open a shell in the worker container
	$(DEV) exec worker sh

shell-frontend:  ## 🐚 Open a shell in the frontend container
	$(DEV) exec frontend sh

shell-postgres:  ## 🐚 psql into the dev postgres
	$(DEV) exec postgres psql -U leaderboard -d leaderboard

shell-mongo:  ## 🐚 mongosh into the dev mongo
	$(DEV) exec mongo mongosh --quiet leaderboard

shell-redis:  ## 🐚 redis-cli into the dev redis
	$(DEV) exec redis redis-cli

# ── Data + tests ─────────────────────────────────────────────────────────────

migrate:  ## 🧱 Apply Drizzle migrations to the dev Postgres (idempotent)
	@echo "▸ Applying migrations…"
	$(DEV) exec api npm run db:migrate

seed: migrate  ## 🌱 Seed 100k users (deterministic; caner / leaderboard at rank ~5000) — auto-migrates first
	@echo "▸ Seeding 100k users…"
	$(DEV) exec api npm run seed

seed-traffic:  ## 📈 Run the demo-traffic generator in the foreground (Ctrl-C to stop)
	@echo "▸ Starting demo-traffic — Ctrl-C to stop"
	$(DEV) exec api npm run seed:traffic

reset-db: migrate  ## ♻️  Wipe all stores + re-seed (idempotent reset for demos) — auto-migrates first
	@echo "▸ Truncating Postgres tables…"
	@$(DEV) exec postgres psql -U leaderboard -d leaderboard \
	  -c "TRUNCATE users, weekly_history, payouts CASCADE;" >/dev/null
	@echo "▸ Dropping Mongo scores…"
	@$(DEV) exec mongo mongosh --quiet \
	  --eval "db.getSiblingDB('leaderboard').scores.deleteMany({})" >/dev/null
	@echo "▸ Flushing Redis…"
	@$(DEV) exec redis redis-cli FLUSHDB >/dev/null
	@echo "▸ Re-seeding…"
	@$(DEV) exec api npm run seed
	@echo "✅ DBs reset and re-seeded"

test: test-backend test-frontend  ## 🧪 Run backend + frontend test suites

test-backend:  ## 🧪 Backend Vitest (unit + testcontainers integration)
	cd backend && npm test

test-frontend:  ## 🧪 Frontend Vitest (unit + RTL)
	cd frontend && npm test

typecheck-frontend:  ## 🧐 tsc --noEmit on the frontend
	cd frontend && npm run typecheck

build-frontend:  ## 📦 Production frontend build (writes frontend/dist/)
	cd frontend && npm run build

# ── Cleanup ──────────────────────────────────────────────────────────────────

clean:  ## 🧹 Stop dev stack + remove orphan containers (volumes kept)
	$(DEV) down --remove-orphans

clean-volumes:  ## ⚠️  Stop dev stack AND remove all volumes (DELETES SEEDED DATA)
	@echo "⚠️  This deletes pgdata, mongodata, redisdata, and node_modules volumes."
	@read -p "    Type 'yes' to confirm: " ans; [ "$$ans" = "yes" ] || { echo "aborted"; exit 1; }
	$(DEV) down -v --remove-orphans

# ── Production ───────────────────────────────────────────────────────────────
# Targets here run from the EC2 host (or local prod-smoke from your laptop).
# All assume .env.production is present at the repo root.

prod-up:  ## 🚀 Bring up the prod stack (edge + 2× backend + worker + dbs)
	@test -f .env.production || { echo "✗ .env.production missing — copy from .env.production.example"; exit 1; }
	$(PROD) up -d --build
	$(PROD) ps

prod-down:  ## 🛑 Stop the prod stack
	$(PROD) down

prod-build:  ## 🔨 Rebuild prod images (edge + backend) without starting
	$(PROD) build

prod-logs:  ## 📊 Tail prod logs
	$(PROD) logs -f

prod-deploy:  ## 🚢 Deploy to EC2 (requires SSH_HOST=user@host)
	@$(SCRIPTS)/deploy.sh

prod-seed:  ## 🌱 Seed prod (run on the EC2 host)
	@$(SCRIPTS)/seed.sh

prod-reset-week:  ## ♻️  Manually trigger the weekly reset on prod (demo helper)
	@$(SCRIPTS)/reset-week.sh
