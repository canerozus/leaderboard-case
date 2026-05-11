# Product Requirements — Leaderboard Case

**Date:** 2026-05-11
**Author:** Caner Özüş
**Source case:** `CASE.md`
**Engineering counterpart:** `DESIGN.md` (this file is *what & why*; that one is *how*).

---

## 1. Overview

The system is a **weekly competitive leaderboard** for an idle/clicker mobile game with ~10 M registered players and ~2 M DAU. Players earn in-game currency by playing; each week starts fresh and the players who earn the most that week climb the board. At the end of each week, 2 % of all currency earned that week is automatically distributed to the top 100, then the pool and the leaderboard reset.

Its core design challenge is **instant-feeling reads at 2 M-DAU scale** while keeping the **player's own rank discoverable** even when they're far outside the top 100. A second axis is **operational resilience**: the live cache is fast but disposable, while the underlying score store stays correct through outages.

---

## 2. Scope

### 2.1 In Scope

- Username + password sign-up and login, JWT bearer auth
- A single global leaderboard, scoped per ISO-aligned week (Mon 00:00:30 UTC)
- Score submission via `POST /score/submit` (the API a real game client would call)
- A demo **Tap to earn** button in the SPA so reviewers can move the board themselves
- Top-100 read for the current week, refreshed by the client every ~7 s
- Self+neighbours read for users outside the top 100 (3 above + me + 2 below)
- Weekly prize pool — 2 % of all currency earned that week
- Automatic weekly distribution to the top 100 every Monday at 00:00:30 UTC
- Persistent payout records (Postgres) + a top-1000 weekly archive for player history
- Fail-open caching — reads and writes stay correct when Redis is down (slower)
- Mobile-first, virtualised SPA; horizontal-scale-ready API behind nginx
- Sample data seed (100 000 users, power-law scores, deterministic demo account)

### 2.2 Out of Scope

*Authentication & accounts*
- Email verification on registration
- Password reset / "forgot password" flow
- Profile management (changing username, password, display name)
- OAuth or social login
- Refresh tokens or session revocation (7-day JWT is the entire auth lifetime)
- Brute-force protection (account lockout, captcha)

*Game mechanics*
- The actual idle/clicker game — only the score-submit API and the demo button
- Per-tap attribution (source, device, geolocation) on score events
- Anti-cheat beyond per-user rate-limiting (no server-side replay verification, no pattern detection, no device fingerprinting)
- Score bounds beyond `delta ∈ [1, 1000]` per request

*Social / multi-board*
- Friends, groups, regional leaderboards
- Multiple concurrent leaderboards (events, modes)
- Notifications for rank changes or week-end payouts
- Public profiles or share-my-rank links

*Real-time / push*
- WebSocket / SSE push for rank changes (we poll at 5–7 s)
- Sub-second prize-pool ticker (animation is client-side easing)

*History*
- More than the top-1 000-per-week archive (users finishing 1001+ don't see that week in `/history`)
- Search or filtering of past weeks
- Exporting history as CSV / receipt

*Operational*
- Multi-region deployment (single EC2 region for this case)
- Auto-scaling beyond the manual `--scale backend=2` setup
- Real metrics, tracing, alerting
- CI/CD pipeline (current deploy is `git pull` + `docker compose up -d --build` over SSH)

### 2.3 Business Rules

*Auth & users*
- A new sign-up always creates a regular player. The case has no admin/operator role exposed in the product UI; system-level actions (seed, reset, deploy) live behind SSH on the host.
- Username is unique and case-insensitive (Postgres `citext`).
- Passwords are stored as bcrypt hashes (cost 10).
- JWTs are HS256, 7-day expiry, no refresh.

*Score submission*
- Each `POST /score/submit` carries a positive integer `delta ∈ [1, 1000]`.
- Each user is rate-limited to **at most 1 score submit per second** (Redis SETNX bucket).
- If Redis is unreachable when the rate-limit check runs, the request **fails open** (allowed). The trade-off is a brief abuse window during a Redis outage — acceptable for a leaderboard, would not be acceptable for billing.
- Score writes are durable in MongoDB (one daily bucket per `(userId, day)`). Redis updates are best-effort and silently no-op on failure.

*Leaderboard reads*
- `GET /leaderboard/top` returns up to 100 entries for the current week.
- `GET /leaderboard/me` returns the user's rank, score, and — if the user is outside the top 100 — exactly **5 neighbours** (the 3 players above + the 2 players below).
- When the user is in the top 100, the response carries the rank only; the top-100 view already shows the surrounding context.
- A new user with zero score starts ranked **at or near the bottom**; their rank is "1 + count of users with strictly greater weekly total".

*Weekly accrual & reset*
- Every score submit accrues **2 %** of its `delta` into the weekly prize pool.
- The pool and the leaderboard are scoped per week and reset on week roll-over.
- A weekly reset job fires **Monday 00:00:30 UTC** in the worker process — a deliberate 30-second offset so any score submits captured pre-boundary have time to durably land in Mongo before the cron aggregates.
- The reset reads from Mongo (not Redis), writes the top-1 000 finishers into `weekly_history`, then computes and writes the top-100 prizes into `payouts`, then deletes the closed-week cache keys.
- The reset is idempotent: guarded by `pg_try_advisory_lock(weekId)` and `UNIQUE (week_id, user_id)` on `payouts`. Re-running it is a no-op once `weekly_history` has rows for the closing week.

*Prize distribution (top 100)*
- 1st place: **20 %** of the pool.
- 2nd place: **15 %**.
- 3rd place: **10 %**.
- Ranks 4–100: share the remaining **55 %** by **linear weighting** — weight `w[r] = 101 − r`, so rank 4 gets the largest slice of the 55 % bucket and rank 100 the smallest.
- The four numbers sum to exactly 100 % of the pool (verified by a golden unit test).

*History*
- Each weekly reset stores the **top 1 000** finishers' final rank + score.
- Users who finish 1001+ don't see that week in their `/history` response. This caps storage at ~52 k rows/year regardless of player count.
- Prize amount is joined per-history-row from `payouts`; `null` for ranks 101–1000.

*Cache & resilience*
- All Redis access goes through a single `CacheService`. Every method wraps in `try/catch` and returns `null` on failure — never throws.
- Feature services treat `null` from the cache as "do the slow thing" — usually a Mongo aggregation.
- On cache cold-miss after recovery, the first read fires a lazy single-flight rehydration of the week's ZSET. Subsequent reads return from the cached path.
- Redis is **never** the source of truth on disagreement; MongoDB always wins.

*Statelessness*
- API replicas are interchangeable. JWT-only auth; no sessions, no per-replica caches.
- The worker is single-instance. Concurrent worker invocations would race on the weekly reset — the Postgres advisory lock is the safety net.

---

## 3. Stories

### 3.1 As a Player

*Auth*
- I can register with a username + password (+ display name + optional country code) and get a JWT.
- I can log in with my username + password.
- My JWT persists across browser reloads (LocalStorage); logging out clears it.

*Browsing*
- I can see the top 100 players for the current week, ranked by weekly score.
- I can see my own current rank, weekly score, and display name in a "hero" card at the top.
- I can see the prize pool for the current week and a live countdown to the next weekly reset.
- I can see the prize distribution rules (1st=20 %, 2nd=15 %, 3rd=10 %, 4–100 share 55 %) in a modal.

*Self+neighbours view*
- When I am inside the top 100, the list highlights my row and the standard top-100 context already surrounds me.
- When I am outside the top 100, the list shows the top 100 first, then a divider, then exactly the 3 players above me + me (highlighted) + the 2 players below me.

*Tap to earn*
- I can tap a button to submit `+1` to my weekly score.
- The hero card score increments immediately (optimistic UI) and reconciles with the server on the next 7 s poll.
- If I tap more than once per second, the second tap returns 429 — the optimistic increment quietly rolls back; my score is unchanged.

*History*
- I can open a drawer to see my past weeks (final rank + final score + prize amount if any).
- Weeks where I finished 1001+ don't appear (bounded archive).

### 3.2 As the System

*Continuous accrual*
- I automatically add 2 % of every score submit into the current week's prize pool counter (Redis best-effort, Mongo durable).

*Weekly close (Mon 00:00:30 UTC)*
- I aggregate the closing week's scores from Mongo (not Redis) to compute the top 1 000.
- I compute prize amounts for the top 100 from the pool total.
- I write the top 1 000 into `weekly_history` and the top 100 into `payouts` in a single Postgres transaction.
- I clear the closing-week's Redis keys so the new week starts clean.
- I do all of the above under a `pg_try_advisory_lock(closingWeekId)` so concurrent workers can't double-pay.

*Rate-limit & abuse*
- I rate-limit each user to 1 score submit per second.
- During a Redis outage I fail-open on the rate limit (allow) — the trade-off is documented; a real anti-abuse strategy would be additive.

*Fail-open reads*
- When Redis returns `null` (down or cold), I serve the same response from a Mongo aggregation. The user sees correct data, just slower; my logs warn about it.
- After Redis recovers, the next read kicks off a single-flight rehydration (guarded by a SETNX lock), and subsequent reads return from the cached path.

---

## 4. Acceptance criteria

The system is "done" when each of these is true. These are the items verified end-to-end in `TEST.md`.

| # | Criterion | Status |
|---|---|---|
| 1 | A reviewer can register at the deployed URL, log in, and see their rank update on every tap. | ✅ live at http://panteon-case-caner-ozus.duckdns.org/ |
| 2 | The top-100 view loads in under 200 ms after first paint on the cached path. | ✅ |
| 3 | A user outside the top 100 sees their rank with 3 above and 2 below. | ✅ |
| 4 | The prize pool ticks up visibly as taps and simulator events fire. | ✅ in local dev; prod is static-by-design (no simulator running) |
| 5 | The week countdown is correct against UTC. | ✅ |
| 6 | Triggering the reset writes payouts to Postgres, zeroes the cache, and the new week starts on the next tap. The reset reads from Mongo, not Redis. | ✅ |
| 7 | Two API replicas serve traffic correctly behind nginx — the same JWT works against either. | ✅ prod runs `replicas: 2` |
| 8 | **Fail-open verified:** with the Redis container stopped, `/score/submit`, `/leaderboard/top`, and `/leaderboard/me` all return correct data; on Redis restart, the cache rehydrates on the next read with no data loss. | ✅ via `cache-failover.test.ts` |
| 9 | Public domain reachable. | ✅ HTTP-only — http://panteon-case-caner-ozus.duckdns.org/. HTTPS path is built (`nginx.https.conf` + `LEADERBOARD_TLS` switch + `certbot-renew.sh`) but not active; reason in README. |
| 10 | Repo on GitHub with README, DESIGN.md, PRD.md, ARCHITECTURE.md, TEST.md, AI_WORKFLOW.md all present. | ✅ |

---

## 5. Why these rules drive specific engineering decisions

A short bridge between this PRD and `DESIGN.md`, so the "why" doesn't get lost across files.

- **"Top-100 in under 200 ms"** → Redis `ZSET` for ranks (O(log N)); 1-second TTL on the materialised top-100 JSON, so the ZSET is touched ~1×/sec per replica regardless of QPS.
- **"3 above + 2 below for outsiders"** → `/leaderboard/me` is a dedicated endpoint that returns rank + 5 neighbours. Per-user, not cacheable, but a tiny payload.
- **"Survives Redis outages"** → `CacheService` is the only file that imports `ioredis`. Every method wraps in `try/catch` and returns `null`. Feature services treat `null` as "fall back to Mongo." Verified by an integration test that kills the Redis container mid-run.
- **"Reset is automatic and idempotent"** → `node-cron` in the worker, fires 30 s after the week boundary; guarded by `pg_try_advisory_lock(weekId)` + `UNIQUE (week_id, user_id)` on `payouts`. Reads from Mongo because Redis is disposable.
- **"Stateless backend"** → JWT only; no sessions; no in-memory caches that diverge across replicas. The worker is the only stateful component (single instance + advisory lock).

The full chain of decisions and their alternatives is in DESIGN.md.
