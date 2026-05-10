# Leaderboard Case — Design Spec

**Date:** 2026-05-09
**Author:** Caner Özüş (with Claude Code)
**Context:** Take-home case — design and ship a weekly leaderboard for an idle/clicker game with ~10M registered and ~2M DAU.

---

## 1. Goals & non-goals

### Goals
- Instant leaderboard reads at 2M DAU scale.
- Players always see top 100; players outside the top 100 see their rank with 3 above and 2 below.
- Weekly prize pool: 2% of all currency earned that week. Distributed to top 100 at week end (1st 20%, 2nd 15%, 3rd 10%, 4th–100th share 55% by linear weight).
- Weekly reset is automatic — pool and leaderboard zero out, payouts written durably.
- Stateless backend; horizontally scalable.
- **Resilient to Redis outages** — leaderboard remains correct (slower) when the cache is unavailable; cache rehydrates from MongoDB on recovery without data loss.
- Production build deployed at a public domain.
- Clean separation of backend and frontend as independent projects (per case requirements).

### Non-goals (out of scope)
- The actual game. The case says players earn currency; we expose the API a real client would call (`POST /score/submit`) and provide a "Tap to earn" demo button + a server-side simulator so the leaderboard moves.
- Anti-cheat / score validation beyond basic rate-limiting and per-request bounds. Real anti-cheat is its own project.
- Friends/social. One leaderboard, global.
- OAuth, email verification, password reset. Username + password is enough for a case.
- Multi-region. Single EC2 region.

---

## 2. Architecture

### 2.1 Topology

```
[ Browser SPA (Vite/React/TS) ]
              │  HTTPS, JWT in Authorization header, polls every 5–7s
              ▼
[ nginx on EC2 ]  ── TLS via certbot, gzip, serves SPA, proxies /api/* ──┐
              │                                                          │
              ▼                                                          ▼
[ API: Node 24/Express × 2 (stateless) ]               [ Worker: Node × 1 ]
              │                                                          │
   ┌──────────┼──────────────────────────────┐                           │
   ▼          ▼                              ▼                           ▼
[ Redis ]  [ Postgres ]                  [ MongoDB ]              (same Redis/PG/Mongo)
 (cache)    (identity, history)          (primary scores)
```

- API and Worker are built from the **same backend codebase**, with two entrypoints (`index.api.ts`, `index.worker.ts`). One multi-stage Docker image (`backend/Dockerfile`: `base` → `dev`/`build`/`prod`); two `command:` overrides in compose.
- API processes are stateless — JWT-only, no sessions, no in-memory caches that would diverge across replicas. Scaling = `--scale api=N` behind nginx.
- Worker is a single instance (cron + simulator).
- All data stores run as containers on the same EC2 host with persistent volumes.
- **Local dev runs the entire stack in Docker Compose** — postgres + mongo + redis + api + worker + frontend (Vite dev server). `docker compose -f infrastructure/docker-compose.yml up` brings up everything; source dirs are bind-mounted with anonymous volumes shadowing `node_modules`, so `tsx watch` (api/worker) and `vite --host 0.0.0.0` (frontend) hot-reload on host edits. Tests still run on the host with testcontainers spawning their own ephemeral containers, so dev compose is independent of the test runner. Production compose (Plan 3) replaces the dev `frontend` service with a single `edge` container (nginx + bundled SPA + reverse proxy + TLS).

### 2.2 Datastore role split

| Store | Role | Why this store |
|---|---|---|
| **MongoDB** | **Primary score store.** One document per `(userId, day)` (Bucket Pattern). Every score submit `$inc`s a daily bucket. Source of truth for live weekly scores; the system can fully reconstruct any leaderboard view from MongoDB alone. | Schemaless + write-heavy, indexed for both daily upserts and weekly aggregation. Daily partitioning gives query pushdown and bounded working-set growth as the dataset ages. |
| **PostgreSQL** | `users`, `weekly_history`, `payouts`. Identity and final, archived results. Source of truth for *who is who* and *what was paid*. | Relational, transactional, durable. Money math belongs in a real RDBMS. |
| **Redis** | **Fail-open cache** for the live experience: leaderboard `ZSET`, prize pool counter, profile cache, rate-limit buckets, top-100 query cache. Reconstructible from MongoDB at any time. | `ZADD`/`ZREVRANK`/`ZRANGE` are O(log N) — without them, instant rank lookups don't fit the latency budget. But the cache is not a system of record; if it disappears, the system continues. |

**Mental model:** **Postgres is identity. MongoDB is the score truth. Redis is a fast cache — losing it slows reads but never loses data.**

### 2.3 Stack

| Layer | Choice | Rationale |
|---|---|---|
| Backend runtime | **Node.js 24** (latest LTS-track) + TypeScript | Required by case; modern V8 perf, native fetch, stable test runner |
| HTTP framework | Express | User preference; well-known, minimal |
| Postgres ORM | Drizzle ORM | Lightweight, type-safe, no decorator gymnastics |
| MongoDB ODM | **Mongoose** | Schema validation at the boundary, typed models per feature, middleware hooks if needed; centralises Mongo connection lifecycle |
| Redis client | `ioredis` | Pipelines, MULTI, robust — used **only** by `CacheService` |
| Auth | JWT (HS256) + bcrypt | Stateless, simple |
| Validation | zod | Single source of truth for env, DTOs |
| Logging | pino | Structured JSON, fast |
| Cron | `node-cron` in worker process | One job, no need for BullMQ |
| Frontend | Vite + React 18 + TypeScript | SPA, fastest path to deploy |
| Styling | Tailwind CSS + clsx + tailwind-merge (`cn` helper) | User preference |
| Server state | TanStack Query | Polling, caching, optimistic updates |
| Client state | Zustand | User preference; minimal stores for auth + optimistic |
| List virtualization | `@tanstack/react-virtual` | Top 100 isn't huge, but virtualization is cheap insurance for mobile |
| Animation | `framer-motion` (small, scoped) | Two motion moments only |
| Testing | Vitest (both ends) + testcontainers | Fast, TS-native, real services in integration |
| Containerization | Docker + Docker Compose; `node:24-bookworm-slim` base; multi-stage backend Dockerfile (`base`/`dev`/`build`/`prod`); multi-stage frontend Dockerfile (`base`/`dev`/`build`); production SPA bundled into the edge image | Same image graph drives both dev and prod; `docker compose up` runs the full stack locally |
| Reverse proxy | nginx + certbot/Let's Encrypt | Standard |

---

## 3. Data model

### 3.1 PostgreSQL

```sql
-- Identity & profile
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      citext UNIQUE NOT NULL,
  password_hash text NOT NULL,
  display_name  text NOT NULL,
  country       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Snapshot of the top 1000 ranked users for each closed week.
-- Users outside the top 1000 are not stored — see §11 for the user-facing limitation.
CREATE TABLE weekly_history (
  week_id       integer NOT NULL,           -- see §5.0 weekId definition
  user_id       uuid    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  final_rank    integer NOT NULL,
  final_score   bigint  NOT NULL,
  PRIMARY KEY (week_id, user_id)
);
CREATE INDEX ON weekly_history (user_id, week_id DESC);

-- Top-100 winners per week. Idempotent via UNIQUE.
CREATE TABLE payouts (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id   integer NOT NULL,
  user_id   uuid    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank      integer NOT NULL,
  amount    numeric(20, 2) NOT NULL,
  paid_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_id, user_id)
);
CREATE INDEX ON payouts (user_id, week_id DESC);
```

### 3.2 MongoDB (primary score store, daily bucket pattern)

Database `leaderboard`, collection `scores`. One document per `(userId, day)` — every submit upserts and `$inc`s the bucket.

```ts
// features/score/score.model.ts (Mongoose)
const ScoreSchema = new Schema({
  userId:  { type: String, required: true },          // FK to Postgres users.id
  day:     { type: String, required: true },          // "YYYY-MM-DD" UTC — partition key
  weekId:  { type: Number, required: true, index: true },
  total:   { type: Number, required: true, default: 0 },
  count:   { type: Number, required: true, default: 0 },
  firstAt: { type: Date,   required: true },
  lastAt:  { type: Date,   required: true },
}, { collection: 'scores', timestamps: false });

ScoreSchema.index({ day: 1, userId: 1 }, { unique: true });   // hot upsert path
ScoreSchema.index({ weekId: 1, userId: 1 });                  // weekly aggregation per user
ScoreSchema.index({ weekId: 1, total: -1 });                  // top-N rehydration / fallback
```

**Why Bucket Pattern:** instead of one document per tap (potentially billions over time), each user collapses a day's activity into a single bucket. This:
- Reduces document count by ~3 orders of magnitude.
- Makes weekly aggregation fast — sum 7 docs per user, not thousands of events.
- Gives a natural day-partitioning unit: as the dataset ages, old days can be archived/dropped wholesale.
- Aligns with MongoDB's storage layout — small writes, large index locality.

We deliberately do **not** store per-tap details (`delta`, `source`, `ts`) on the bucket. That's an analytics need, not a leaderboard need. If product later wants per-tap attribution, the additive change is an `events: [...]` capped subdocument or a sibling `score_events` collection.

### 3.3 Redis keys (cache layer)

Every key here is reconstructible from MongoDB. Loss is acceptable; corruption is not — we always trust MongoDB on disagreement. Per-week keys are namespaced by `weekId` so the weekly reset is a key-namespace swap rather than a destructive update.

```
lb:{weekId}              ZSET   member=userId, score=weekly running total
pool:{weekId}            STRING numeric, INCRBYFLOAT (cached; truth = aggregate from Mongo)
user:{userId}            HASH   { displayName, country }    (denormalized cache, no TTL)
ratelimit:earn:{userId}  STRING SETNX EX 1                   (1 tap per second)
top:{weekId}             STRING JSON cache of top-100 (TTL 1s)
rehydrate:{weekId}       STRING SETNX EX 30                  (rehydration lock — see §5.5)
```

The `user:{userId}` hash has no TTL — it's written on user creation and read forever. No write path mutates these fields today. If a profile-update endpoint is added later, it must `DEL user:{userId}` on update.

**These keys are touched in exactly one place: `CacheService` (§7.2).** Feature services never import `ioredis` directly.

---

## 4. API surface

All endpoints under `/api/v1`. JWT required except `/auth/*`. Errors are JSON: `{ "error": "code", "message": "human" }`.

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/healthz` | — | `200 { status: 'ok', uptime, version, redis: 'up'\|'down' }` — used by nginx upstream check; auth-free. `redis: 'down'` is informational, not a 5xx. |
| POST | `/auth/register` | `{ username, password, displayName, country? }` | `{ token, user }` |
| POST | `/auth/login` | `{ username, password }` | `{ token, user }` |
| GET | `/me` | — | `{ user, weekly: { score, rank \| null } }` |
| POST | `/score/submit` | `{ delta }` (1–1000 integer) | `204` |
| GET | `/leaderboard/top` | — | `{ weekId, entries: LbEntry[] }` (size 100) |
| GET | `/leaderboard/me` | — | `{ weekId, inTop100, rank, score, neighbors: LbEntry[] }` |
| GET | `/leaderboard/state` | — | `{ weekId, prizePool, secondsUntilReset, distribution: Distribution }` |
| GET | `/history?limit=10` | — | `{ entries: HistoryEntry[] }` (only weeks the user placed in top 1000 — see §11) |

```ts
type LbEntry      = { rank: number; userId: string; displayName: string; country?: string; score: number; isMe?: boolean }
type HistoryEntry = { weekId: number; finalRank: number; finalScore: number; prizeAmount: number | null }
type Distribution = {
  topThree: { rank: 1 | 2 | 3; percent: number }[]              // [{1, 0.20}, {2, 0.15}, {3, 0.10}]
  rest:     { fromRank: 4; toRank: 100; totalPercent: 0.55; weighting: 'linear' }
}
```

`HistoryEntry.prizeAmount` is computed by `weekly_history LEFT JOIN payouts USING (week_id, user_id)` — `null` when the user finished outside the top 100.

### Design notes

- **`/leaderboard/top` and `/leaderboard/me` are separate** so `top` is cacheable across all users (1s TTL) while `me` stays per-user.
- **`/score/submit` is not idempotent.** A leaderboard tap is not a payment; losing one to a network blip is fine.
- **`/me` returns the user's current weekly rank and score** so the screen can render immediately on first paint without waiting for `/leaderboard/me`.
- **All read endpoints are fail-open.** When Redis is unavailable, they transparently fall back to MongoDB aggregation (§5.2). The response shape is identical; only latency degrades.

---

## 5. Critical flows

### 5.0 weekId definition

```ts
// shared/lib/weekId.ts
const EPOCH_MS = Date.UTC(1970, 0, 5);   // 1970-01-05 — first Monday in 1970
const WEEK_MS  = 7 * 24 * 60 * 60 * 1000;
export function currentWeekId(now = Date.now()): number {
  return Math.floor((now - EPOCH_MS) / WEEK_MS);
}
export function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);  // "YYYY-MM-DD" UTC
}
```

Week boundaries align to Monday 00:00 UTC. Day boundaries align to UTC midnight. Computed at request time — no scheduled "create new week" job; new keys/buckets come into existence on first write of the new week or day.

### 5.1 Score submit (hot path) — Mongo-first, Redis best-effort

```
POST /api/v1/score/submit { delta: 1 }
JWT verified → userId

  1. Rate limit:
       allowed = await cacheService.acquireRateLimit(userId, 1)  // returns true | false | null
       if allowed === false  → 429
       if allowed === null   → Redis is down: fail-open, allow through (logged)
  2. Validate:  delta ∈ [1, 1000], integer, finite
  3. weekId = currentWeekId();  day = dayKey()
  4. Mongo durable write (awaited):
       Score.updateOne(
         { userId, day },
         {
           $inc:         { total: delta, count: 1 },
           $setOnInsert: { weekId, firstAt: now },
           $set:         { lastAt:  now }
         },
         { upsert: true }
       )
  5. Cache update (best-effort, non-awaited-on-error):
       await cacheService.incrementScore(userId, weekId, delta)        // null on Redis failure
       await cacheService.incrementPrizePool(weekId, delta * 0.02)     // null on Redis failure
  6. respond 204
```

**Durability is owned by step 4.** Steps 1 and 5 are best-effort: they go through `CacheService`, which never throws. If Redis is down:
- The rate-limit check fails open — the trade-off is a brief abuse window during a Redis outage, acceptable for a leaderboard, would not be acceptable for billing.
- Cache updates silently no-op. The leaderboard data on disk in MongoDB stays correct. The next read after Redis recovers will rehydrate the cache (§5.5).

### 5.2 Leaderboard read — cache-first, Mongo-fallback

The client opens the screen → fires three queries in parallel: `state`, `top`, `me`.

```
GET /leaderboard/top
  cached = await cacheService.getTopHundred(weekId)
  if cached !== null:
    return cached                                          // hit
  // null = Redis down OR cache cold/empty. Caller cannot distinguish; both go to Mongo.
  entries = await scoreRepo.aggregateTopN(weekId, 100)
  void leaderboardService.rehydrateWeek(weekId)            // fire-and-forget; §5.5
  cacheService.warmTopJson(weekId, entries)                // best-effort, non-blocking
  return entries

GET /leaderboard/me
  result = await cacheService.getRankAndScore(userId, weekId)
  if result !== null AND result.rank !== null:
    if result.rank < 100:
      return { inTop100: true,  rank: result.rank+1, score: result.score, neighbors: [] }
    neighbors = await cacheService.getNeighbors(userId, weekId, result.rank)  // can be null
    if neighbors !== null:
      return { inTop100: false, rank: result.rank+1, score: result.score, neighbors }
  // Cache miss / Redis down / partial failure — full Mongo path:
  void leaderboardService.rehydrateWeek(weekId)            // fire-and-forget; §5.5
  return await leaderboardService.computeMeFromMongo(userId, weekId)
```

The fallback path doesn't try to distinguish "Redis down" from "cache cold" — both produce `null` from `CacheService`, and both are handled the same way: serve from Mongo, fire a rehydration attempt. If Redis is genuinely down, `rehydrateWeek` will hit a `null` from `acquireRehydrateLock` and no-op. If Redis is up but cold (e.g., right after a deploy or after an outage), the rehydration succeeds and subsequent reads serve from the cached path. Self-correcting.

**MongoDB aggregation pipelines** (in `features/score/score.repo.ts`):

```ts
// Top N for the week (and rehydration source)
aggregateTopN(weekId, n) =
  Score.aggregate([
    { $match:   { weekId } },
    { $group:   { _id: "$userId", total: { $sum: "$total" } } },
    { $sort:    { total: -1 } },
    { $limit:   n },
  ]);

// User's weekly total
weeklyTotal(userId, weekId) =
  Score.aggregate([
    { $match: { userId, weekId } },
    { $group: { _id: null, total: { $sum: "$total" } } },
  ])[0]?.total ?? 0;

// User's rank = 1 + count of users with strictly greater weekly total
rankOf(userId, weekId, myTotal) =
  Score.aggregate([
    { $match:  { weekId } },
    { $group:  { _id: "$userId", total: { $sum: "$total" } } },
    { $match:  { total: { $gt: myTotal } } },
    { $count:  "above" },
  ])[0]?.above ?? 0;     // rank = above + 1
```

The 1-second TTL on `top:{weekId}` keeps fast-path reads cheap at 2M DAU — the top-100 query hits Redis ~1×/sec across the fleet, not 1× per request. Stale-by-one-second is invisible to a human eye and irrelevant for a weekly leaderboard.

**Performance note:** the Mongo fallback path is meaningfully slower than the cached path — a top-100 aggregation across 2M DAU touches ~14M daily-bucket docs over 7 days. With the `{weekId: 1, total: -1}` index it's still well under a second on healthy hardware, but it's not a steady-state operating mode. Fail-open exists for *brief* Redis outages, not as the primary read path. If Redis is down for >5 minutes, alerting fires and we route around the outage at the infra layer.

### 5.3 Weekly reset & payout (cron, Monday 00:00:30 UTC)

Runs in the worker process, guarded by `pg_try_advisory_lock(weekId)`. **Reads exclusively from MongoDB** — Redis is not consulted, since the cron runs once per week and the authoritative source is Mongo.

```
1. closingWeek = currentWeekId() - 1
2. acquire advisory lock; if not acquired, exit (another worker is running)
3. Aggregate the closing week from MongoDB:
     entries = scoreRepo.aggregateTopN(closingWeek, 1000)         // top 1000 for history
     poolTotal = scoreRepo.weeklyEarningsTotal(closingWeek) * 0.02
4. Compute prize amounts for top 100:
     - rank 1 → poolTotal * 0.20
     - rank 2 → poolTotal * 0.15
     - rank 3 → poolTotal * 0.10
     - ranks 4..100 → split (poolTotal * 0.55) by weights w[r] = 101 - r,
                     amount[r] = poolTotal * 0.55 * w[r] / Σw[r]
5. BEGIN TX (postgres)
     INSERT INTO weekly_history (...)             // top 1000
     INSERT INTO payouts (...) ON CONFLICT (week_id, user_id) DO NOTHING   // top 100
   COMMIT
6. cacheService.deleteWeekData(closingWeek)        // best-effort cleanup of lb:/pool:/top: keys
7. release advisory lock; emit metric & log
```

**Idempotency:**
- `pg_try_advisory_lock(weekId)` prevents concurrent runs.
- `UNIQUE (week_id, user_id)` on `payouts` makes step 5 safe to retry.
- On worker restart, if `weekly_history` already has rows for `closingWeek`, skip step 4–5 and go straight to step 6 (cleanup).
- The Mongo daily buckets for the closing week are **not deleted** — they remain as the durable record. A separate retention policy (out of scope for this case) can drop bucket documents older than N weeks.

**Boundary race:** the cron fires 30 seconds after the week boundary, not at it. New writes for the new week are unaffected — they go into `lb:{newWeekId}` and a new day's bucket automatically as soon as the boundary passes, since `currentWeekId()` and `dayKey()` are computed at request time. The 30s grace exists to drain any in-flight `/score/submit` requests that captured `weekId = closingWeek` pre-boundary, ensuring their Mongo upsert lands before the cron's aggregation reads.

**The new week starts on its own** — `currentWeekId()` is computed from UTC at request time, so as soon as the boundary passes, `lb:{newWeekId}` and `pool:{newWeekId}` come into existence on first write, and a new daily bucket is created on first upsert. Nothing to "create".

### 5.4 Demo seed traffic (standalone script, on demand)

`backend/seed/demo-traffic.ts` is a one-off script: it picks 50 random seeded users every 2s and submits small random deltas via the same internal score-service function the API uses. This keeps the leaderboard visibly moving during a demo without a reviewer needing to open multiple browsers. It is **not** a worker job and never runs in production — it's a CLI invocation (`npm run seed:traffic`) on the dev or demo environment.

### 5.5 Cache rehydration on Redis recovery

When Redis is down, score writes still land in MongoDB. When Redis recovers, the cache is empty for the current week. We **rehydrate lazily, triggered by any leaderboard read that found `null`** (§5.2), rather than running a recovery daemon:

```
leaderboardService.rehydrateWeek(weekId):
  acquired = await cacheService.acquireRehydrateLock(weekId, 30)
  if acquired !== true: return                              // null=Redis down, false=another replica is rehydrating
  try:
    cursor = Score.aggregate([
      { $match: { weekId } },
      { $group: { _id: "$userId", total: { $sum: "$total" } } },
    ]).cursor({ batchSize: 1000 })
    for batch of cursor:
      await cacheService.bulkZAdd(`lb:${weekId}`, batch)    // pipelined ZADD; null on failure
    poolTotal = await scoreRepo.weeklyEarningsTotal(weekId) * 0.02
    await cacheService.setPrizePool(weekId, poolTotal)
  finally:
    await cacheService.releaseRehydrateLock(weekId)
```

**Key properties:**
- **Lazy:** triggered by reads; no extra moving part.
- **Idempotent:** rehydration overwrites with the truth from Mongo. Concurrent score writes during rehydration win or lose by milliseconds, but the next ZINCRBY on top of a rehydrated value is correct (the bucket in Mongo always has the authoritative running total; the next read converges).
- **Single-flight:** the `rehydrate:{weekId}` SETNX lock prevents N replicas from each running a full aggregation. If the lock is held, the requester serves from Mongo and lets the holder finish.
- **Bounded cost:** for 2M DAU at week midpoint, the aggregation produces ~2M user totals. Streamed in batches of 1000, pipelined ZADDs, this completes in seconds — slow but bounded, and it only happens after a Redis outage.

This is the entire fail-open story: **never throw on cache failure, never trust the cache as a source of truth, always be able to rebuild it from MongoDB.**

---

## 6. Frontend architecture

### 6.1 Pages

| Route | Purpose |
|---|---|
| `/auth` | Login + register, single screen with tab toggle |
| `/leaderboard` | Main screen — everything lives here |

### 6.2 Screen anatomy

```
┌──────────────────────────────────────────────┐
│  Header: week countdown · prize pool · me    │
├──────────────────────────────────────────────┤
│  Hero "you are here" card (always visible)   │
│   — your rank, score, delta-to-next-rank     │
│   — "Tap to earn" button                     │
├──────────────────────────────────────────────┤
│  Top 100 list (virtualized)                  │
│   — rows 1–3 styled as podium                │
│   — your row highlighted if in top 100       │
│   — sticky "you are here" band slides in     │
│     when scrolled past your position         │
├──────────────────────────────────────────────┤
│  Footer: rewards distribution preview link   │
└──────────────────────────────────────────────┘
```

The case's "self + neighbors" requirement is solved without a second screen: in top 100 → row highlight; otherwise → divider after row 100, then rows N-3..N+2 with `me` centered.

### 6.3 Folder layout (feature-based)

```
frontend/
  src/
    app/                          // root, providers (QueryClient, AuthProvider)
    features/
      auth/
        api/authApi.ts
        components/AuthForm.tsx
        hooks/useAuth.ts
        store/authStore.ts        // zustand: { token, user, login(), logout() }, persist→localStorage
        pages/AuthPage.tsx
        types.ts
      leaderboard/
        api/leaderboardApi.ts
        components/
          LeaderboardRow.tsx
          LeaderboardList.tsx     // @tanstack/react-virtual
          SelfBand.tsx
          HeroCard.tsx
          Podium.tsx
          PrizePoolTicker.tsx
          Countdown.tsx
          RewardsModal.tsx
        hooks/
          useLeaderboard.ts       // TanStack Query, polling
          useCountdown.ts
          useTapToEarn.ts
        store/leaderboardStore.ts // zustand: pendingDelta, lastKnownRank
        pages/LeaderboardPage.tsx
        types.ts
      history/
        api/, components/HistoryDrawer.tsx, hooks/, pages/
    shared/
      api/client.ts               // fetch wrapper, JWT interceptor, 401→logout
      components/                 // Button, Modal, Skeleton
      hooks/
      lib/cn.ts                   // clsx + tailwind-merge
    styles/globals.css            // @tailwind + design tokens
    main.tsx
```

### 6.4 State separation

- **TanStack Query** = server cache. Owns `top`, `me`, `state`, `history`. Nothing from the server lives anywhere else.
- **Zustand** = ephemeral UI state. Two stores:
  - `authStore` — token + user, persisted via the `persist` middleware.
  - `leaderboardStore` — `pendingDelta` (optimistic score offset) and `lastKnownRank` (so the row can flash when it changes between polls).

### 6.5 Polling

| Query | Interval | Notes |
|---|---|---|
| `top` + `me` | 7s | Both queries fire on the same tick |
| `state` | 5s | Lightweight; drives countdown reconciliation and pool ticker |

On `visibilitychange` → hidden, polling pauses (TanStack Query default). On focus → immediate refetch.

**Why polling, not WebSocket/SSE?** A weekly leaderboard is high-read, low-event-rate — events aggregate server-side regardless of how clients fetch. A 7-second poll is invisible to a human reading a leaderboard, while a persistent connection per concurrent user breaks the "stateless API" requirement (or pushes the state into a separate connection-broker tier — extra moving parts for no user-visible win at this scale). If real-time rank-change ever becomes a product feature, the path is SSE on a separate `/leaderboard/stream` endpoint backed by Redis pub/sub, fanned out only when ranks actually change — additive to the current design, not a rewrite.

### 6.6 Optimistic tap

```
useTapToEarn.mutate()
  → leaderboardStore.addPendingDelta(+1)              // HeroCard re-renders instantly
  → POST /score/submit
  → onSuccess: queryClient.invalidateQueries(['me']) + clearPendingDelta()
  → onError:   clearPendingDelta() + toast
```

The next `me` refetch supersedes the optimistic value — server is authoritative.

### 6.7 Visual language

- Dark, neon-on-charcoal, mobile-first. Single accent (gold/amber) for podium and prize pool.
- **Two motion moments only** (the budget):
  1. Prize pool ticker — animated number on change (framer-motion spring).
  2. Rank-change flash — when a row's rank changes between polls, it does a subtle slide+highlight.
- Mobile: single column. Desktop: hero card moves to a left rail; list takes ~70%.
- No 3D, no particles, no maximalism. Graded on taste.

---

## 7. Backend architecture

### 7.1 Folder layout (feature-based, mirrors the frontend)

```
backend/
  src/
    features/
      auth/
        auth.routes.ts
        auth.controller.ts
        auth.service.ts
        auth.repo.ts                // Drizzle queries on `users`
        auth.dto.ts                 // zod schemas
        auth.types.ts
      score/
        score.routes.ts
        score.controller.ts
        score.service.ts            // orchestrates Mongo write + CacheService
        score.repo.ts               // Mongoose queries + aggregations
        score.model.ts              // Mongoose schema (§3.2)
        score.dto.ts
        score.service.test.ts       // unit
      leaderboard/
        leaderboard.routes.ts
        leaderboard.controller.ts
        leaderboard.service.ts      // cache-first, Mongo-fallback (§5.2)
        leaderboard.dto.ts
      history/
        history.routes.ts
        history.controller.ts
        history.service.ts
        history.repo.ts             // Drizzle on `weekly_history` + `payouts`
        history.dto.ts
      payout/
        payout.cron.ts              // node-cron registration, only in worker
        payout.service.ts           // §5.3 reset & payout flow
        payout.repo.ts              // Drizzle write of weekly_history + payouts
        prizes.ts                   // pure: computePrizes(pool, ranks): Prize[]
        prizes.test.ts              // golden distribution test
      me/
        me.routes.ts
        me.controller.ts
        me.service.ts               // composes from auth + leaderboard + scoreRepo
    shared/
      cache/
        cache.service.ts            // ALL Redis operations live here (§7.2)
        cache.types.ts
      db/
        mongo.ts                    // mongoose.connect, connection lifecycle
        postgres.ts                 // drizzle client + schema
        redis.ts                    // ioredis client (only consumed by CacheService)
      middleware/
        auth.middleware.ts          // JWT verify
        rateLimit.middleware.ts     // delegates to CacheService (fail-open)
        errorHandler.middleware.ts
      lib/
        weekId.ts                   // currentWeekId, dayKey
        logger.ts                   // pino
      types/
        api.types.ts                // shared response shapes (LbEntry, etc.)
    config.ts                       // zod-validated env
    app.ts                          // Express factory: wires features + middleware
    index.api.ts                    // boots app, listens on PORT
    index.worker.ts                 // boots payout.cron, no HTTP listener
  migrations/                       // drizzle-kit SQL migrations
  seed/
    seed.ts                         // 100k users in Postgres + initial Mongo daily buckets
    demo-traffic.ts                 // optional CLI; drives the leaderboard during demos
  tests/
    integration/
      score-flow.test.ts            // testcontainers: real Mongo + Redis
      payout-flow.test.ts           // testcontainers: real Mongo + Postgres
      cache-failover.test.ts        // stop Redis mid-test → assert API still serves correctly
  Dockerfile                        // FROM node:24-alpine
  package.json
  tsconfig.json
```

**Conventions:**
- Each feature owns its full vertical slice — routes, controller, service, repo, DTO, model, tests. No layer-named folders at the top.
- Cross-feature reuse goes in `shared/`. The bar is high: a thing belongs in `shared/` only when more than one feature legitimately consumes it.
- Unit tests live next to the code they cover (`*.test.ts`). Integration tests, which need real services via testcontainers, live in `tests/integration/`.
- `me` is a feature even though it's small — it composes data from `auth` + `leaderboard` + `score`, so giving it its own slice keeps the dependency graph clean.

### 7.2 CacheService — the single Redis touchpoint

Every Redis operation in the system is a method on `CacheService`. Feature services never import `ioredis`. Every method follows the **fail-open contract**:

> Wrap the Redis call in `try/catch`. On error: `logger.warn({err, ...ctx}, '<op> failed')` and `return null`. Never re-throw.

The caller treats `null` as "cache unavailable, do the slow thing."

```ts
// shared/cache/cache.service.ts
export class CacheService {
  constructor(private redis: Redis, private logger: Logger) {}

  /** Returns cached top-100 entries; null on Redis failure or cold miss. */
  async getTopHundred(weekId: number): Promise<LbEntry[] | null> {
    try {
      const cached = await this.redis.get(`top:${weekId}`);
      if (cached) return JSON.parse(cached) as LbEntry[];

      const flat = await this.redis.zrevrange(`lb:${weekId}`, 0, 99, 'WITHSCORES');
      if (flat.length === 0) return null;                      // cold/empty → fall back

      const entries = await this.hydrate(flat, weekId);
      await this.redis.set(`top:${weekId}`, JSON.stringify(entries), 'EX', 1);
      return entries;
    } catch (err) {
      this.logger.warn({ err, weekId }, 'cache.getTopHundred failed');
      return null;
    }
  }

  async incrementScore(userId: string, weekId: number, delta: number): Promise<number | null> {
    try {
      const next = await this.redis.zincrby(`lb:${weekId}`, delta, userId);
      return Number(next);
    } catch (err) {
      this.logger.warn({ err, userId, weekId }, 'cache.incrementScore failed');
      return null;
    }
  }

  async incrementPrizePool(weekId: number, amount: number): Promise<number | null> {
    try {
      const next = await this.redis.incrbyfloat(`pool:${weekId}`, amount);
      return Number(next);
    } catch (err) {
      this.logger.warn({ err, weekId, amount }, 'cache.incrementPrizePool failed');
      return null;
    }
  }

  async getRankAndScore(userId: string, weekId: number): Promise<{ rank: number | null; score: number } | null> {
    try {
      const [rank, score] = await Promise.all([
        this.redis.zrevrank(`lb:${weekId}`, userId),
        this.redis.zscore(`lb:${weekId}`, userId),
      ]);
      return { rank, score: score ? Number(score) : 0 };
    } catch (err) {
      this.logger.warn({ err, userId, weekId }, 'cache.getRankAndScore failed');
      return null;
    }
  }

  async getNeighbors(userId: string, weekId: number, rank: number): Promise<LbEntry[] | null> {
    try {
      const start = Math.max(rank - 3, 100);
      const end   = rank + 2;
      const flat  = await this.redis.zrevrange(`lb:${weekId}`, start, end, 'WITHSCORES');
      return await this.hydrate(flat, weekId, start);
    } catch (err) {
      this.logger.warn({ err, userId, weekId }, 'cache.getNeighbors failed');
      return null;
    }
  }

  async getPrizePool(weekId: number): Promise<number | null> {
    try {
      const v = await this.redis.get(`pool:${weekId}`);
      return v === null ? null : Number(v);
    } catch (err) {
      this.logger.warn({ err, weekId }, 'cache.getPrizePool failed');
      return null;
    }
  }

  async setPrizePool(weekId: number, value: number): Promise<void | null> {
    try { await this.redis.set(`pool:${weekId}`, String(value)); }
    catch (err) { this.logger.warn({ err, weekId }, 'cache.setPrizePool failed'); return null; }
  }

  async deleteWeekData(weekId: number): Promise<void | null> {
    try { await this.redis.del(`lb:${weekId}`, `pool:${weekId}`, `top:${weekId}`); }
    catch (err) { this.logger.warn({ err, weekId }, 'cache.deleteWeekData failed'); return null; }
  }

  /**
   * Rate-limit acquire. Returns true=allowed, false=blocked, null=Redis failure (caller decides).
   * Score-submit fails open by treating null as allowed; other consumers may choose differently.
   */
  async acquireRateLimit(userId: string, ttlSec: number): Promise<boolean | null> {
    try {
      const ok = await this.redis.set(`ratelimit:earn:${userId}`, '1', 'NX', 'EX', ttlSec);
      return ok === 'OK';
    } catch (err) {
      this.logger.warn({ err, userId }, 'cache.acquireRateLimit failed');
      return null;
    }
  }

  async warmTopJson(weekId: number, entries: LbEntry[]): Promise<void | null> {
    try { await this.redis.set(`top:${weekId}`, JSON.stringify(entries), 'EX', 1); }
    catch (err) { this.logger.warn({ err, weekId }, 'cache.warmTopJson failed'); return null; }
  }

  async acquireRehydrateLock(weekId: number, ttlSec: number): Promise<boolean | null> { /* same shape as acquireRateLimit */ }
  async releaseRehydrateLock(weekId: number): Promise<void | null>                    { /* DEL rehydrate:{weekId} */ }
  async bulkZAdd(key: string, members: Array<{userId: string; score: number}>): Promise<void | null> { /* pipelined ZADD */ }

  async ping(): Promise<boolean> {            // exposed by /healthz, never throws
    try { return (await this.redis.ping()) === 'PONG'; } catch { return false; }
  }

  // ...hydrate(flat, weekId, startRank=0): pipelined HMGET for user:{id}, build entries
}
```

Two principles, written once, repeated in every method:
1. **Every method has its own try/catch.** No shared wrapper that could swallow a different exception type.
2. **`null` is the only failure signal.** No throws, no Result types, no booleans-with-out-params.

### 7.3 Testing

- **Unit (Vitest, no I/O):** `computePrizes` (golden-test the exact distribution for a known pool), `currentWeekId`/`dayKey` boundaries, JWT helpers.
- **Integration (Vitest + testcontainers):** real Mongo, real Redis, real Postgres.
  - `score-flow.test.ts` — submit lands in Mongo, ZSET reflects it, prize pool ticks up.
  - `payout-flow.test.ts` — seed Mongo with a closing week, run cron, assert Postgres rows match the prize-distribution math.
  - **`cache-failover.test.ts`** — the load-bearing fail-open test. Stop the Redis container mid-test. Assert: (a) `/score/submit` continues to return 204 and writes to Mongo; (b) `/leaderboard/top` and `/leaderboard/me` return correct data via the Mongo fallback; (c) when Redis restarts, the next read repopulates `lb:{weekId}` and the cached path resumes.
- **Frontend (Vitest + RTL):** `LeaderboardRow` snapshot, `useTapToEarn` reducer logic, `Countdown` tick math. Light coverage — type-check is the bigger guard.

We don't mock Redis, Mongo, or Postgres in integration tests. Mocks of stateful services drift from reality, and the fail-open + cron paths are the highest-stakes code in the system.

### 7.4 Observability

- pino structured logs (level via env).
- Request log middleware: method, path, status, ms, userId.
- Cron job emits start/finish/duration logs with the weekId.
- **Every `CacheService` catch logs at `warn` with key + operation context.** A spike in these is the first signal of a Redis issue.
- `/healthz` reports `redis: 'up' | 'down'` so dashboards/alerts can distinguish a fail-open mode from full health.

### 7.5 Security

- bcrypt cost 10 for password hashes.
- JWT HS256, 7-day expiry, secret in env. No refresh tokens (case scope).
- Rate limit: 1 tap/sec per user (fail-open during Redis outage; see §5.1), 10 reqs/sec global per IP at nginx (independent of Redis).
- All input validated by zod at the route boundary.
- CORS allowlist = the deployed frontend origin only.
- Helmet middleware enabled.

---

## 8. Repo layout

```
leaderboard-case/
├── backend/                  // independent project: own package.json, lockfile, README
├── frontend/                 // independent project: own package.json, lockfile, README
├── infrastructure/
│   ├── docker-compose.yml          // local dev (postgres, redis, mongo, backend, worker, frontend)
│   ├── docker-compose.prod.yml     // EC2 stack (+ nginx + certbot, no host-mounted volumes for secrets)
│   ├── nginx/
│   │   ├── nginx.conf
│   │   └── conf.d/site.conf
│   ├── scripts/
│   │   ├── deploy.sh               // ssh + docker compose pull && up -d
│   │   ├── seed.sh
│   │   └── reset-week.sh           // manual payout trigger for demo
│   ├── ec2/
│   │   └── user-data.sh            // EC2 first-boot: install docker, certbot
│   └── .env.example
├── docs/
│   ├── DESIGN.md             // this document — engineering design spec
│   ├── PRD.md                // product requirements: goals, scope, out-of-scope, acceptance criteria
│   ├── ARCHITECTURE.md       // produced via bmad-create-architecture; diagrams + scale-out story
│   └── TEST_RESULTS.md       // regression test outputs and deploy-readiness gate
├── README.md                 // architecture overview, run instructions, deployed URL
└── AI_WORKFLOW.md            // tools/skills used at each stage, where AI helped vs. where the calls were mine
```

Each app folder is independent. No workspace tooling at the root. The two projects share **no source code** — types are duplicated where needed (typically just `LbEntry`, `HistoryEntry`, and a couple of API shapes), per the "client and server in separate projects" requirement.

---

## 9. Deployment

### 9.1 Target

Single EC2 instance (Ubuntu 22.04, t3.small or t3.medium), public elastic IP, A-record from a cheap domain (or `*.duckdns.org` / `*.nip.io` for free).

### 9.2 docker-compose.prod.yml services

```
nginx       → 80/443, certbot sidecar, proxies /api → backend, serves /static SPA
backend     × 2  (Express, command: node dist/index.api.js)        # node:24-alpine
worker      × 1  (cron, command: node dist/index.worker.js)        # node:24-alpine
postgres    × 1  (volume-mounted /var/lib/postgresql/data)
redis       × 1  (AOF on, volume-mounted)
mongo       × 1  (volume-mounted; primary score store — backups configured)
```

The `--scale backend=2` is intentional: the case requires statelessness, so we run two API replicas behind nginx round-robin to prove it.

nginx upstream config marks a backend instance unhealthy after consecutive `/healthz` failures (`max_fails=3 fail_timeout=10s`) and rotates traffic to the surviving replica until the failed one recovers. Note: `redis: 'down'` in `/healthz` does **not** mark the instance unhealthy — the API is still serving traffic correctly via the Mongo fallback.

### 9.3 TLS

`certbot --nginx` for Let's Encrypt; renewal via system cron.

### 9.4 CI / CD

Out of scope for this submission. Deploy is a manual `git push` → `infrastructure/scripts/deploy.sh` (SSH to EC2 + `git pull` + `docker compose up -d --build`). With more time, the natural shape is described in §9.5 (managed services + ECR + ECS Fargate); a CI step that builds images and pushes to ECR is part of that picture, not bolted onto the current single-EC2 deployment.

### 9.5 Scale-out to managed services

The case scopes a single-EC2 deployment, but the obvious next step at real load is to lift each container to a managed equivalent. The mapping is direct enough to write down — it's how you'd evolve at scale, not a rewrite.

| Current (compose) | Production target | Why |
|---|---|---|
| `mongo` container | **MongoDB Atlas** (M30+, replica set) | Mongo is now the primary score store; managed replication, backups, point-in-time restore are mandatory. Atlas is the path of least resistance on AWS — DocumentDB has wire-compat gaps that aren't worth fighting for an active write path. |
| `redis` container | **ElastiCache for Redis** (cluster mode off, multi-AZ replica) | Managed failover; AOF + snapshots without operating it. Even with fail-open in place, faster recovery means less time on the slow Mongo path. |
| `postgres` container | **RDS for PostgreSQL** (Multi-AZ) | Backups, point-in-time restore, automatic failover. No `pg_dump` cron to babysit. |
| `backend × 2` on EC2 | **ECS Fargate behind ALB**; autoscale on CPU + ALB request count | Stateless API → Fargate is the right fit; no instance management. |
| `worker × 1` on EC2 | **ECS Fargate scheduled task** for `weekly-reset` (EventBridge cron) | Worker doesn't need long-running compute; EventBridge handles the schedule and retries. |
| `nginx + certbot` | **ALB + ACM** (TLS); **CloudFront + S3** for the SPA | Managed TLS termination; SPA served as a CDN-fronted static site. |
| `git clone` + `docker build` on EC2 | **GitHub Actions** build → push to **ECR** → `aws ecs update-service` | Artifact-driven deploys; rollback is `aws ecs update-service --task-definition <previous-revision>`. No more "build on the production host". |
| `.env` file | **AWS Secrets Manager** (DB creds, JWT secret) + **SSM Parameter Store** (non-secret config) | No secrets on disk; rotation handled. |
| Pino → stdout → docker logs | **CloudWatch Logs** (Fargate native) + Logs Insights queries | Default destination on Fargate; structured-log queries out of the box. |

Two things the design is *already* compatible with: the API and worker are stateless and read all config from env, so they move to Fargate with zero code changes. The only build-time edits are connection strings and rotating credentials through Secrets Manager.

Two things that *would* need attention: (a) the Postgres advisory lock (§5.3) is per-cluster, so the EventBridge → Fargate cron must run as a singleton task to avoid two concurrent payout attempts; (b) the demo seed-traffic generator (§5.4) stays out of production entirely — it lives in `seed/`, not in any deployable image.

---

## 10. Sample data & demo experience

### 10.1 Seed

`backend/seed/seed.ts` generates:
- 100,000 users with deterministic usernames (`player_00001` … `player_100000`), random display names from a name list, random country codes — written to **Postgres** `users`.
- All passwords are `leaderboard` (bcrypted on seed for realism).
- Initial weekly scores sampled from a power-law distribution so the leaderboard looks like a real game (a few whales at the top, a long tail) — written to **MongoDB** as one daily-bucket document per user for the current day, with `total` set to that user's seeded score and `count: 1`.
- Profile cache entries written to Redis (`user:{userId}`) and the leaderboard ZSET (`lb:{weekId}`) populated via pipelined `ZADD`s. If Redis is unavailable at seed time, the seed still succeeds — the cache will rehydrate on the first read (§5.5).
- One known account `caner / leaderboard` is seeded near rank ~5000 so the reviewer can log in and immediately see the "self + neighbors" view.
- Seeding uses a **fixed RNG seed** (`seedrandom('leaderboard-2026')`) so rank assignments are reproducible across runs — the canonical account lands at the same rank every time.

### 10.2 Demo button

The HeroCard's "Tap to earn" hits `/score/submit` with `delta: 1`. With rate limiting at 1/sec, mashing it climbs the board visibly within seconds.

### 10.3 Demo seed traffic

`backend/seed/demo-traffic.ts`, run via `npm run seed:traffic`: every 2s it picks 50 random seeded users and submits random `delta ∈ [1, 5]` via the internal score service. The leaderboard moves on its own during demos. Standalone CLI script — not a worker job, not deployed to production (see §5.4).

---

## 11. Open questions / risks

- **Fail-open path is slower than the cached path.** Mongo aggregation across 7 days of buckets at 2M DAU is sub-second on healthy hardware with the right index, but it is not the steady-state operating mode. The fail-open story is for *brief* Redis outages. If Redis is down for >5 minutes, alerting fires and we route around at the infra layer rather than serving sustained traffic from the Mongo path.
- **Rate-limit bypass during Redis outage.** When `acquireRateLimit` returns `null`, we fail open and accept the request. Brief abuse window; acceptable for a leaderboard, would be unacceptable for billing. If anti-abuse becomes the priority, swap the policy (treat null as "deny") or add a process-local token bucket as a fallback layer.
- **`/history` is capped at top 1000 per week.** Users who finished outside the top 1000 in a given week will not see that week in their `/history` response. Trades full per-user history for a bounded, predictable storage cost (~52k rows/year vs. 100M+ if every participant were stored). For a take-home case with a competitive-leaderboard product framing, this is acceptable. If product later wants every week shown, the schema is unchanged — the cron at §5.3 step 5 just inserts every participating user instead of slicing at 1000.
- **Payout precision:** currency is stored as `numeric(20, 2)` in Postgres, as `Number` in Mongoose (IEEE-754 double), and as a float in Redis (`INCRBYFLOAT`). For 2% of weekly earnings this is rounding noise, but if currency math became real money we'd switch to integer cents end-to-end (`Decimal128` in Mongo, integer ZSET scores in Redis).
- **Concurrent rehydration vs. live writes.** During a rehydration run, score submits continue to ZINCRBY on whatever value the rehydrator has just ZADD'd. The bucket in Mongo is always authoritative, so the next read after rehydration completes is correct. The single-flight `rehydrate:{weekId}` lock prevents N replicas from running parallel aggregations.
- **Reset job in transaction:** the Postgres tx writes up to 1000 history rows + 100 payouts. Well under any reasonable timeout.

---

## 12. Acceptance criteria

The system is "done" when:

- [ ] A reviewer can register at the deployed URL, log in, and see their rank update on every tap.
- [ ] The top-100 view loads in under 200ms after first paint (cached path).
- [ ] A user not in the top 100 sees their rank with 3 above and 2 below them.
- [ ] The prize pool ticks up visibly as taps and simulator events fire.
- [ ] The week countdown is correct against UTC.
- [ ] Triggering the reset (cron or manual `reset-week.sh`) writes payouts to Postgres, zeroes the cache, and the new week starts on the next tap. Reset reads from Mongo, not Redis.
- [ ] Two API replicas (`--scale backend=2`) serve traffic correctly behind nginx — the same JWT works against either.
- [ ] **Fail-open verified:** with the Redis container stopped (`docker stop redis`), `/score/submit`, `/leaderboard/top`, and `/leaderboard/me` all return correct data; on Redis restart, the cache rehydrates on the next read with no data loss. Captured in `cache-failover.test.ts`.
