# Product Requirements — Leaderboard Case

**Date:** 2026-05-10
**Author:** Caner Özüş
**Source case:** [`docs/CASE.md`](docs/CASE.md)

The case framing in one paragraph: an idle/clicker game with ~10 M registered players and ~2 M DAU has a leaderboard that "works but barely." Players complain the page is slow, can't find their own rank, and freezes mid-scroll. Product wants the leaderboard to feel **instant**, weekly rewards to go out automatically, and a screen designed for competitive players. This document captures the product cut of that ask — goals, scope, and what we'll accept as "done."

The engineering cut (architecture, fail-open contract, data model, deploy topology) lives in **[`docs/DESIGN.md`](docs/DESIGN.md)**. This file is the *what* and *why*; that one is the *how*.

---

## 1. Goals

### Player-facing

1. **Open the leaderboard, see your rank instantly.** Top-100 read in under 200 ms after first paint on the cached path.
2. **Always know where you stand.** If you're outside the top 100, see your own rank with the 3 players above you and the 2 players below you on the same screen — no second click, no "search" UI.
3. **See the prize pool tick up live.** The screen should *feel alive* during a session even when you aren't tapping yourself.
4. **Never have the screen freeze on you.** No matter how long the list, scrolling stays smooth on mobile.
5. **Trust that rewards arrive.** When the week ends, payouts settle automatically and the new week starts cleanly.

### System

6. **Stateless backend.** API replicas are interchangeable; horizontal scaling is `--scale api=N`.
7. **Survives Redis outages.** When the cache is unavailable the system stays correct (slower) — leaderboard and prize pool reconstruct from MongoDB. No data loss, no stuck UI.
8. **Two separate projects.** Client and server in independent codebases per the case requirement.
9. **TypeScript end-to-end.**
10. **Production build deployed at a public domain.**

---

## 2. Acceptance criteria

The system is "done" when each of these is true. These are the exact items the regression in [`docs/TEST.md`](docs/TEST.md) verifies, expressed here in product language.

| # | Criterion | Status |
|---|---|---|
| 1 | A reviewer can register at the deployed URL, log in, and see their rank update on every tap. | ✅ verified locally; pending public deploy |
| 2 | The top-100 view loads in under 200 ms after first paint on the cached path. | ✅ |
| 3 | A user not in the top 100 sees their rank with 3 above and 2 below them. | ✅ |
| 4 | The prize pool ticks up visibly as taps and simulator events fire. | ✅ |
| 5 | The week countdown is correct against UTC. | ✅ |
| 6 | Triggering the reset writes payouts to Postgres, zeroes the cache, and the new week starts on the next tap. The reset reads from Mongo, not Redis. | ✅ |
| 7 | Two API replicas serve traffic correctly behind nginx — the same JWT works against either. | ✅ via `docker compose --scale backend=2` |
| 8 | **Fail-open verified:** with the Redis container stopped, `/score/submit`, `/leaderboard/top`, and `/leaderboard/me` all return correct data; on Redis restart, the cache rehydrates on the next read with no data loss. | ✅ via `cache-failover.test.ts` |
| 9 | Public domain reachable over HTTPS. | 🟡 pending Plan 3b |
| 10 | Repo on GitHub, README + DESIGN.md + PRD.md + AI_WORKFLOW.md all present. | 🟡 README/PRD landing in this branch |

---

## 3. Out of scope (and why)

These are deliberate non-goals for the case, called out so the boundary is explicit:

- **The actual game.** The case states players earn currency; we expose the API a real client would call (`POST /score/submit`) and provide a "Tap to earn" demo button + a server-side simulator script so the leaderboard moves visibly during review. No idle-clicker mechanics.
- **Anti-cheat / score validation beyond rate-limiting.** Real anti-cheat is its own project (server-side replay, rate variance, device fingerprinting, etc.). We rate-limit at 1 tap/sec/user and bound `delta ∈ [1, 1000]`.
- **Friends, social, multi-leaderboard.** One leaderboard, global.
- **OAuth, email verification, password reset.** Username + password is enough for a take-home; the auth path is JWT (HS256) + bcrypt (cost 10).
- **Multi-region deployment.** Single EC2 region. The scale-out table in DESIGN.md §9.5 documents the path to managed AWS (Atlas, ElastiCache, RDS, Fargate) when the case becomes a real product.
- **Real-time push (WebSocket / SSE).** A weekly leaderboard is high-read, low-event-rate — polling at 5–7 s is invisible to the user and keeps the API stateless. The path to SSE is additive (`/leaderboard/stream` backed by Redis pub/sub) when product needs sub-second rank-change feedback.

---

## 4. Why these requirements drive specific decisions

A short bridge between this PRD and the engineering doc, so the "why" doesn't get lost between files.

- **"Top-100 in under 200 ms"** → Redis `ZSET` for ranks (O(log N)), 1-second TTL on the materialized top-100 JSON to share reads across replicas. Without this the top query hits Mongo per request at 2 M DAU.
- **"3-above + 2-below for users outside top 100"** → `/leaderboard/me` is its own endpoint that returns the user's rank + 5 neighbours. Cacheable per-user only; not the same call as `/leaderboard/top`.
- **"Survives Redis outages"** → `CacheService` is the only file in the codebase that imports `ioredis`; every method wraps in `try/catch`, returns `null` on failure, never throws. Feature services treat `null` as "do the slow thing." Verified by an integration test that **kills the Redis container mid-test**.
- **"Stateless backend"** → JWT (no sessions), no in-memory caches that diverge across replicas. The advisory-lock-guarded payout cron lives in a separate single-instance worker process built from the same image.
- **"Weekly reset is automatic"** → `node-cron` in the worker, fires Monday 00:00:30 UTC, idempotent via `pg_try_advisory_lock(weekId)` + `UNIQUE (week_id, user_id)` on payouts. Reads from Mongo, not Redis.

The full chain of decisions and their alternatives is in DESIGN.md.

---

## 5. Definition of done

This PRD is satisfied when:

1. All criteria in §2 are checked or have a documented blocker.
2. The deployed URL is reachable over HTTPS and returns the seeded leaderboard for the demo account.
3. README.md + DESIGN.md + PRD.md + AI_WORKFLOW.md are all present at the repo root.
4. The `v1.0` tag is pushed and the email to HR has been sent.
