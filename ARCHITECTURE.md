# Architecture

A standalone tour of the system. The full engineering rationale (data model, every Redis key, every aggregation pipeline, the rehydration race analysis) lives in `DESIGN.md`. This document is the reviewer-friendly **TL;DR with diagrams** — focused on the case rubric: cloud usage, scalability, performance, and suitability for the scenario.

## Topology

```
                                ┌────────────────────────────────┐
                                │ Browser (SPA)                  │
                                │ Vite/React/TS · TanStack Query │
                                └──────────────┬─────────────────┘
                                               │ HTTPS · JWT bearer · poll 5–7s
                                               ▼
                                ┌──────────────────────────────────┐
                                │ Edge (nginx + bundled SPA)       │
                                │ · TLS termination (Let's Encrypt)│
                                │ · Static SPA at /                │
                                │ · Reverse proxy /api → backend   │
                                └─────────┬────────────┬───────────┘
                                          │            │
                          (round-robin via Docker DNS) │
                                          ▼            ▼
                               ┌─────────────────────────────────┐
                               │ backend × 2 (stateless API)     │
                               │ Node 24 + Express + TypeScript  │
                               └──────────────┬──────────────────┘
                                              │
            ┌─────────────────────────────────┼─────────────────────────────────┐
            ▼                                 ▼                                 ▼
   ┌────────────────┐               ┌──────────────────┐                ┌────────────────┐
   │ Redis (cache)  │               │ MongoDB          │                │ PostgreSQL     │
   │ ZSET, pool ctr │               │ scores (primary) │                │ users, history │
   │ FAIL-OPEN      │               │ Bucket Pattern   │                │ payouts (TX)   │
   └────────────────┘               │ daily partition  │                └────────────────┘
                                    └──────────────────┘
                                              ▲
                                              │
                                  ┌────────────────────────┐
                                  │ worker × 1             │
                                  │ payout cron: Mon 00:00 │
                                  └────────────────────────┘
```

## Datastore role split

| Store | Role |
|---|---|
| **PostgreSQL** | Identity (`users`), final week archive (`weekly_history`), prize payouts (`payouts`). Source of truth for *who is who* and *what was paid*. Money math belongs in a real RDBMS. |
| **MongoDB** | **Primary score store.** One document per `(userId, day)` (Bucket Pattern). Every score submit `$inc`s a daily bucket. Source of truth for live weekly scores; the system can fully reconstruct any leaderboard view from MongoDB alone. |
| **Redis** | **Fail-open cache** for the live experience: leaderboard `ZSET`, prize-pool counter, profile cache, rate-limit, top-100 query cache. Reconstructible from MongoDB at any time. |

**Mental model:** *Postgres is identity. MongoDB is the score truth. Redis is a fast cache — losing it slows reads but never loses data.*

## Score-submit hot path (Mongo first, Redis best-effort)

```
POST /api/v1/score/submit { delta: 1 }
  1. acquireRateLimit(userId, 1s)                           [CacheService — best-effort]
       null  → fail-open, allow (Redis is down)
       false → 429
  2. Mongo upsert  scores { userId, day }   $inc { total, count }      [DURABLE]
  3. CacheService.incrementScore(userId, weekId, delta)     (best-effort, ignore null)
  4. CacheService.incrementPrizePool(weekId, delta * 0.02)  (best-effort, ignore null)
  5. respond 204
```

Durability is owned by step 2. Steps 1, 3, and 4 silently no-op when Redis is unreachable — the data on disk in MongoDB remains correct, and the next read after Redis recovers triggers a lazy single-flight rehydration of the cache.

## Read paths (cache-first, Mongo-fallback)

For both `/leaderboard/top` and `/leaderboard/me`:
1. Try `CacheService.<get>`. On hit, return.
2. On `null`, run a Mongo aggregation across the week's daily buckets, return the result, and fire a background `rehydrateWeek(weekId)` (single-flight via SETNX lock).
3. Subsequent reads after rehydration return from the cached path again.

The 1-second TTL on the cached top-100 JSON keeps fast-path reads cheap at 2 M DAU — the top-100 query hits Redis ~1×/sec across the fleet, not 1× per request. Stale-by-one-second is invisible to a human reading a leaderboard.

## Weekly reset (Mon 00:00:30 UTC)

Worker process runs `node-cron`. The reset is idempotent:

1. `pg_try_advisory_lock(closingWeekId)` — exit if another worker is running.
2. If `weekly_history` already has rows for `closingWeekId`, skip recompute (just clean up cache).
3. Aggregate from Mongo: top-1000 for history, total earnings × 2% for the prize pool.
4. Compute prizes (1st 20%, 2nd 15%, 3rd 10%; ranks 4–100 split 55% by weights 97 → 1).
5. Single Postgres transaction: `INSERT weekly_history` + `INSERT payouts ON CONFLICT DO NOTHING`.
6. Best-effort cache cleanup. Release advisory lock.

The 30-second offset from the week boundary drains in-flight `score/submit` requests that were captured pre-boundary, ensuring their Mongo upsert lands before the cron's aggregation reads.

## Stateless guarantee

API replicas hold zero per-user state. Auth is JWT-only (HS256). Hot data lives in Redis (cache) or MongoDB (primary). The `--scale backend=2` setup behind nginx round-robin proves the property — the same JWT works against either replica. The worker is single-instance and protected by a Postgres advisory lock against accidental duplication.

## Performance & scalability properties

- **Top-100 read:** O(log N) ZSET range from Redis, ~1 ms hot path. Cached top-100 JSON has a 1 s TTL, so the rank ZSET is touched once per second per replica regardless of QPS.
- **Self+neighbours read:** ZRANK + ZRANGE around the user's index, also O(log N). Per-user, not cacheable — but it's a tiny payload (6 rows).
- **Score submit:** one Mongo upsert + two best-effort Redis ops. Mongo writes are async-replicated; the daily-bucket pattern keeps the hot working set bounded as the dataset ages.
- **Weekly reset:** one cron tick per week, single Postgres transaction with up to ~1100 rows. Well under any reasonable timeout.
- **Horizontal scaling:** the API and worker are stateless. `--scale backend=N` is the entire scaling story today; managed services (below) take it the rest of the way.

## Scale-out path (single-EC2 → managed services)

The current Compose deployment is sized for the case demo. The path to real load:

| Current (compose) | Production target | Why |
|---|---|---|
| `mongo` container | **MongoDB Atlas** (M30+, replica set) | Primary store; managed replication, backups, point-in-time restore are mandatory. |
| `redis` container | **ElastiCache for Redis** (multi-AZ replica) | Managed failover; AOF + snapshots without operating it. |
| `postgres` container | **RDS PostgreSQL** (Multi-AZ) | Managed backups, point-in-time restore, automatic failover. |
| `backend × 2` on EC2 | **ECS Fargate behind ALB**, autoscale on CPU + ALB request count | Stateless API → Fargate fits perfectly. |
| `worker × 1` on EC2 | **ECS Fargate scheduled task** (EventBridge cron) | Singleton task — respects the advisory-lock contract. |
| `edge` (nginx) | **ALB + ACM** (TLS); **CloudFront + S3** for the SPA | Managed TLS; SPA from a CDN. |
| `.env.production` | **AWS Secrets Manager** (DB creds, JWT) + **SSM Parameter Store** (config) | No secrets on disk; rotation handled. |
| Pino → docker logs | **CloudWatch Logs** + Logs Insights | Structured-log queries out of the box. |

The API and worker move to Fargate with **zero code changes** — they're stateless and read all config from env. Two attention points: (a) the cron must run as a singleton task to respect the advisory-lock contract, (b) the demo seed-traffic generator stays out of production deployments (it lives in `seed/`, not in any deployable image).

## What we'd add with more time

- Real metrics + tracing (Prometheus/Grafana or CloudWatch dashboards for cache-down rate, rehydration time, cron duration, p95 read latency).
- Anti-cheat: server-side delta plausibility, pattern flags, per-IP write ceilings, device fingerprinting at the edge.
- Multi-region read replicas with eventual consistency on rank ordering.
- SSE on `/leaderboard/stream` backed by Redis pub/sub for real-time rank-change pushes — additive to the polling design, not a rewrite.
- Visual regression baselines (Playwright snapshots compared against committed PNGs).
