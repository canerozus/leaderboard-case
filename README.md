# Leaderboard Case

A weekly leaderboard system for an idle/clicker game with ~10 M registered players and ~2 M DAU. Players earn currency, the top 100 split a 2 %-of-earnings prize pool every week, and the system has to feel **instant** — including for players outside the top 100, who need to see their own rank with the players around them.

Submitted as a Panteon take-home case.

- **Deployed:** _<add domain after Plan 3b deploy>_
- **Demo account:** `caner` / `leaderboard` (lands at rank ~5 000 against the 100 000-user seed)
- **Tech:** Node 24 + TypeScript, Express, PostgreSQL, MongoDB, Redis · React 19 + Vite 8 + Tailwind 4 · Docker Compose for everything

## A note on the live demo

The deployed leaderboard reflects a **static seeded state** — the demo-traffic simulator (`backend/seed/demo-traffic.ts`) is intentionally **not** running in production. Two reasons:

1. It would write fake winners into `weekly_history` every Monday, polluting the archive with synthetic data forever.
2. The architecture is fully demonstrated without it. Everything that defines the product is visible from the deployed URL: the self+neighbors view (caner is at rank ~5 000), the podium, the countdown ticking against UTC, and — most importantly — the optimistic UI when you click **Tap to earn**.

So the prize pool sits still by design. To see motion you have two options:

- Click **Tap to earn** on the deployed URL. The optimistic increment lands instantly; the next 7-second `/leaderboard/me` poll reconciles with the server. That round-trip is the load-bearing UX claim of this submission.
- Run the simulator locally:

  ```bash
  git clone <repo-url> && cd leaderboard-case
  make full-stack-up && make seed && make seed-traffic
  ```

The full rationale ("not a worker job, not deployed to production") is in `DESIGN.md` §5.4 and §10.3.

## What this delivers

- **`POST /score/submit`** durable in MongoDB, best-effort cached in Redis. The endpoint never hides a Mongo failure behind a Redis success.
- **`GET /leaderboard/top`** — top 100 from a Redis `ZSET`, falls back to a Mongo aggregation if Redis is unreachable.
- **`GET /leaderboard/me`** — your rank + 3 above + 2 below if you're outside the top 100; just your rank inside it.
- **`GET /leaderboard/state`** — live prize pool, week countdown, distribution rules.
- **Weekly reset** every Monday 00:00:30 UTC, runs in a separate worker process, idempotent via `pg_try_advisory_lock` + `UNIQUE (week_id, user_id)` on payouts.
- **Fail-open architecture** — every Redis call is wrapped in a single `CacheService` that returns `null` on failure. The whole system continues to serve correct data from MongoDB when Redis is down. Verified by an integration test that **stops the Redis container mid-test** and asserts the API stays correct.
- **A polished, mobile-first SPA** with optimistic Tap-to-earn, polled state (top + me at 7 s, prize pool/countdown at 5 s), virtualized list, two intentional motion moments (the prize-pool ticker, the rank-change flash), and a self+neighbors view that solves the "I'm rank 5 317, where am I?" problem without a second screen.

The full design rationale — datastore role split, fail-open contract, weekly reset semantics, scale-out story — is in **[`DESIGN.md`](DESIGN.md)**.

## How AI was used

A short, honest version: **architecture and judgment calls were mine; scaffolding, code, docs polish, and verification loops were Claude Code.** The full breakdown — tools, flow, where AI helped substantially, where I made the call, honest notes — is in **[`AI_WORKFLOW.md`](AI_WORKFLOW.md)**.

## Run it locally

Requires Docker Desktop, GNU Make, and `git`.

```bash
git clone <repo-url> leaderboard-case && cd leaderboard-case

# one command brings up frontend + api + worker + postgres + mongo + redis
# (env files .env.development / .env.production are committed — see .gitignore)
make full-stack-up

# seed 100k users + power-law scores (caner / leaderboard at rank ~5000)
make seed

# optional — drives the leaderboard live so the prize pool ticks visibly
make seed-traffic
```

Open http://localhost:5173 → log in as `caner` / `leaderboard`. The seeded account lands at rank ~5 000, which exercises the self+neighbors view immediately. Click **Tap to earn** to see optimistic UI; the rank moves on the next 7 s poll.

`make help` prints every target, grouped by purpose (daily dev, shells, data + tests, cleanup, production). The most useful besides the above:

| Target | What |
|---|---|
| `make logs` | Tail all service logs |
| `make reset-db` | Truncate Postgres + drop Mongo scores + flush Redis + re-seed (the seed isn't idempotent) |
| `make test` | Run the full backend + frontend test suites |
| `make health` | Curl `/api/v1/healthz` |
| `make full-stack-down` | Stop the stack (volumes preserved) |
| `make clean-volumes` | Stop + delete all data volumes (interactive confirm) |

## How it's tested

Three layers, fully documented in **[`TEST.md`](TEST.md)**:

| Layer | Tools | Tests | Runtime |
|---|---|---|---|
| Backend code | Vitest + testcontainers (real Postgres / Mongo / Redis, no mocks) | 37 across 7 files | ~100 s |
| Frontend code | Vitest + React Testing Library + happy-dom | 35 across 8 files | ~2 s |
| Browser regression | Playwright MCP driving a real Chromium against the live Docker stack | 13 user-flow checks | ~3 min |

```bash
make test                        # both suites in one go
make test-backend                # 37 tests, ~100 s (includes cache-failover)
make test-frontend               # 35 tests, ~2 s
make typecheck-frontend          # tsc -b --noEmit
make build-frontend              # production bundle
```

Browser regression is driven via Claude Code + the Playwright MCP plugin — the "test" is the checklist in `TEST.md` itself, not a separate `*.spec.ts` file. To re-run, ask Claude: *"run the regression in `TEST.md` against the live stack."*

The standout test is `backend/tests/integration/cache-failover.test.ts` — it boots Postgres + Mongo + Redis via testcontainers, kills the Redis container mid-test, and asserts `/score/submit`, `/leaderboard/top`, and `/leaderboard/me` all keep returning correct data via the Mongo fallback. That test is the load-bearing claim of this submission.

## Repo layout

```
leaderboard-case/
├── Makefile                  # `make help` lists every command
├── docker-compose.yml        # local dev — full stack
├── docker-compose.prod.yml   # production stack (EC2 + nginx + certbot)
├── .env.example              # dev env template (committed)
├── .env.production.example   # prod env template (committed)
├── backend/                  # Node 24 + Express + Drizzle + Mongoose + ioredis
├── frontend/                 # React 19 + Vite 8 + Tailwind 4 + TanStack Query + Zustand
├── infrastructure/
│   ├── edge/                       # nginx + bundled SPA Dockerfile + nginx configs
│   ├── ec2/                        # provisioning checklist + first-boot user-data
│   └── scripts/                    # deploy.sh, seed.sh, reset-week.sh, certbot-renew.sh
├── docs/
│   ├── DESIGN.md                   # canonical engineering spec
│   ├── CASE.md                     # the original Panteon brief
│   ├── TEST.md                     # 3-layer test plan + checklist
│   ├── findings-and-bugs/          # findings + bug log per branch
│   └── playwright/                 # regression screenshots
├── README.md                 # this file
├── PRD.md                    # product requirements (goals / scope / acceptance)
├── ARCHITECTURE.md           # diagram + scale-out path
└── AI_WORKFLOW.md            # AI tools, flow, judgment calls
```

The backend and frontend are **separate projects** with no shared workspace tooling — a few types are hand-duplicated (`LbEntry`, `HistoryEntry`, etc.) per the case requirement.

## Known limitations

These are real and documented (DESIGN.md §11, `docs/findings-and-bugs/finding_*.md`):

- **Fail-open is not the steady-state operating mode.** The Mongo fallback path is sub-second on healthy hardware but materially slower than the cached path. If Redis is down for more than ~5 minutes at 2 M-DAU scale, the right move is to route around at the infra layer, not to keep serving from the slow path.
- **Rate-limit fails open during a Redis outage** — acceptable for a leaderboard, would not be acceptable for billing. The trade-off is documented; the code path treats `null` from `acquireRateLimit` as "allow."
- **`/history` is capped at top 1 000 per week.** Users who finished outside that bucket don't see the week in their history. Bounded storage cost vs. complete-history trade-off.
- **Optimistic-tap rollback on 429 is silent** — no toast. Acceptable for the case; trivially extended.

## Next steps if this became a real product

The current deploy is **single EC2 + Docker Compose** — a deliberate trade-off for the case timeline. The codebase is already compatible with managed services (stateless API, env-only config, JWT auth, no local file state), so the move is connection-string + secrets-manager work, not a rewrite. Concretely, with more time:

- **Data tier → managed.** `mongo` container → **MongoDB Atlas** (M30+, multi-AZ replica set, point-in-time restore — Mongo is the primary score store, this is non-negotiable at real scale). `postgres` → **RDS for PostgreSQL** Multi-AZ. `redis` → **ElastiCache for Redis** (multi-AZ replica). Even with the fail-open contract in place, faster Redis recovery means less time on the slow Mongo aggregation path.
- **Compute tier → Fargate.** `backend × 2` → **ECS Fargate behind an ALB**, autoscaling on CPU + ALB request count. `worker × 1` → **ECS Fargate scheduled task** triggered by **EventBridge** (singleton task, respects the Postgres advisory-lock contract for the weekly cron).
- **Edge → ALB + ACM + CloudFront + S3.** Drop the nginx + certbot containers. **ALB** terminates TLS via **ACM**; the API runs behind it. The SPA gets hashed-asset bundling at build time, uploads to **S3**, fronted by **CloudFront** with long-cache headers. No more host-managed certs, no more nginx config to babysit.
- **Image registry + CI/CD.** Build images in **GitHub Actions** on every merge to main, push to **ECR**, trigger an **ECS service deployment** via `aws ecs update-service`. The PR check workflow runs typecheck + lint + the full Vitest suite (including the `cache-failover.test.ts` testcontainers integration). No more "git pull and rebuild on the EC2 host" — deploys become artifact-driven, rollback is `aws ecs update-service --task-definition <prev-revision>`.
- **Secrets → Secrets Manager + SSM.** `.env.production` goes away. DB credentials, JWT secret, Let's Encrypt email → **AWS Secrets Manager** (with automatic rotation). Non-secret config (LOG_LEVEL, IMAGE_TAG) → **SSM Parameter Store**. Fargate task definitions reference both at task-launch time. Nothing on disk.
- **Observability → CloudWatch + Logs Insights.** Pino's stdout JSON lands directly in CloudWatch Logs on Fargate. **Logs Insights** queries replace `docker logs | grep`. **CloudWatch Metrics** + a dashboard for the four numbers that matter: cache-down rate, rehydration time, cron duration, p95 read latency.
- **Beyond infra:**
  - Real metrics + tracing (OpenTelemetry → CloudWatch or Prometheus/Grafana).
  - Anti-cheat: server-side delta plausibility, pattern flags, per-IP write ceilings, optional device fingerprinting at the edge.
  - Multi-region read replicas with eventual consistency on rank ordering.
  - SSE on `/leaderboard/stream` backed by Redis pub/sub for real-time rank-change pushes — additive to the polling design, not a rewrite.
  - Visual regression baselines (Playwright snapshots compared against committed PNGs in CI).

The full per-container mapping with rationale is in DESIGN.md §9.5 and ARCHITECTURE.md.
