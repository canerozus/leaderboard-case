# Test Plan & Story — Leaderboard Case

**Author:** Caner Özüş
**Updated:** 2026-05-10

This document describes how the leaderboard system was tested. It is a record of what we actually did, not an aspirational checklist. The story has three layers, each with a different actor, a different feedback loop, and a different goal:

1. **Code tests** — written by a human + AI, run by a developer or CI. Catch regressions in pure logic.
2. **Agent tests** — Claude Code's per-step verification loop while writing code (build, typecheck, vitest, curl). Catch breakage *as code is written*, not after.
3. **Full regression** — a real browser driving the live stack end-to-end via Playwright, orchestrated by Claude Code through the Playwright MCP plugin. Catch what unit tests cannot: actual user flows, animations, polling, optimistic UI, mobile layouts.

Counts as of the last green run:

| Layer | Where | Tests | Runtime |
|---|---|---|---|
| Backend Vitest | `backend/src/**/*.test.ts` (unit) + `backend/tests/integration/*.test.ts` (testcontainers) | **37 across 7 files** | ~100s |
| Frontend Vitest | `frontend/src/**/*.test.{ts,tsx}` | **35 across 8 files** | ~2s |
| Browser regression | Playwright MCP, live stack on Docker Compose | **13 user-flow checks** | ~3 min |

---

## Layer 1 — Code tests (TDD, unit, integration)

### Methodology: TDD where it earns its keep

Not every file needed tests, and we did not write any test we did not believe in. The rule was: **TDD when the contract matters, no test when the code is its own contract**.

- TDD'd: pure helpers (`prizes`, `weekId`, `cn`, `format`), state stores (zustand), data classes (`ApiClient`, `CacheService`), components whose behavior is non-obvious (`AuthForm`, `LeaderboardRow`).
- Skipped tests on: routing tables, page-level composition, scaffold files, anything that's a thin wire-up of already-tested pieces.

This was a deliberate trade. We could have inflated coverage with snapshot tests and DOM assertions, but tests-as-tax-on-changes was not the goal — tests-as-bug-shield-on-load-bearing-code was.

### Backend (Node 24 + TypeScript + Vitest)

```
backend/
├── src/
│   ├── features/payout/prizes.test.ts            # unit — pure prize-distribution math
│   └── shared/
│       ├── cache/cache.service.test.ts           # unit — fail-open contract on every method
│       └── lib/
│           ├── jwt.test.ts                       # unit — JWT sign/verify, expiry
│           └── weekId.test.ts                    # unit — UTC week boundaries, day keys
└── tests/integration/
    ├── score-flow.test.ts                        # integration — submit → Mongo → ZSET
    ├── payout-flow.test.ts                       # integration — cron → Postgres rows
    └── cache-failover.test.ts                    # integration — STOP redis mid-request
```

**Unit tests** (no I/O, pure functions):
- `prizes.test.ts` — golden test: given a known pool, the distribution math sums exactly to the pool, ranks 1/2/3 get 20/15/10 %, ranks 4–100 share 55 % by linear weighting.
- `weekId.test.ts` — Monday 00:00 UTC boundaries. Pinning the epoch (1970-01-05) prevents a class of off-by-one bugs that would only surface in production at week roll-over.
- `cache.service.test.ts` — every public method has a "Redis throws → method returns null and logs warn" path. This is the load-bearing fail-open contract. If a method ever re-throws, the test fails.

**Integration tests** use [testcontainers](https://testcontainers.com) — they spin up real Postgres, Mongo, and Redis containers per test file. **No mocks of stateful services.** Mocks of stateful services drift from reality, and the failure modes we care about (race conditions, cache outages, transaction boundaries) only happen with real services.

The standout is `cache-failover.test.ts`: it boots the full stack, then `redis.stop()` mid-test and asserts:
- `POST /score/submit` continues to return 204 (writes still land in Mongo).
- `GET /leaderboard/top` and `/leaderboard/me` return correct data via the Mongo aggregation fallback.
- After Redis restarts, the next read repopulates `lb:{weekId}` and the cached path resumes.

The warn-level logs you see in the test output (`cache.acquireRehydrateLock failed`, `cache.warmTopJson failed`, etc.) are *expected output* — the test is verifying that those warnings are emitted instead of exceptions reaching the caller. They are evidence the fail-open path is exercised, not a flake.

### Frontend (React 19 + TypeScript + Vitest + RTL + happy-dom)

```
frontend/src/
├── features/
│   ├── auth/
│   │   ├── components/AuthForm.test.tsx         # RTL — login/register modes, errors
│   │   └── store/authStore.test.ts              # unit — zustand store contract
│   └── leaderboard/
│       ├── components/LeaderboardRow.test.tsx   # RTL — rendering, isMe highlight
│       ├── hooks/useCountdown.test.ts           # unit — fake timers, prop reseed
│       └── store/leaderboardStore.test.ts       # unit — pendingDelta accumulator
└── shared/
    ├── api/client.test.ts                       # unit — JWT injection, 401, 204
    └── lib/
        ├── cn.test.ts                           # unit — clsx + tailwind-merge
        └── format.test.ts                       # unit — score/prize/duration/rank/week
```

The contracts these tests pin:
- `cn`: tailwind conflict resolution (`p-2` + `p-4` → `p-4`). One missed precedence bug here would cascade across every component.
- `format.*`: locale-stable. Switching machines should not change `formatScore(1234)` from `1,234` to `1.234`.
- `ApiClient`: JWT header injection happens, 204 returns null body (avoids "Unexpected end of JSON" runtime errors), 401 fires `onUnauthorized` *before* throwing so the auth store can clear before the React error boundary sees it.
- `authStore` / `leaderboardStore`: round-trips through localStorage, `addPendingDelta` accumulates, `rollbackPending` floors at zero.
- `useCountdown`: reseeds when the input prop changes (i.e., when the `state` query refetches every 5s and gives us a fresh `secondsUntilReset`).
- `AuthForm`: in login mode, only `username` + `password` fields are submitted; in register mode, `displayName` + `country` are present. Server-side error message is rendered. Submit disabled when pending.
- `LeaderboardRow`: rank/name/score/country render; `entry.isMe` adds the gold ring class.

### Why tests run before commits

Both projects use `npm test` (Vitest in run mode) and `npm run typecheck` (`tsc -b --noEmit`) as part of the per-task agent loop (Layer 2). They are not enforced via husky/git hooks today — that's deliberate. The agent re-runs them after every meaningful change, and a test failure halts the agent from committing. CI will be added in the deploy plan; until then, the agent is the gatekeeper.

---

## Layer 2 — Agent tests (Claude Code's per-task verification loop)

This is the layer that does not exist on most projects. While Claude Code was implementing the plans, every task in the plan ended with an explicit verification step. The pattern was:

1. **Write or edit the smallest unit** (one function, one component, one route).
2. **Run a verification appropriate to what changed.**
3. **Only commit if green.**

This gave us a feedback cycle of seconds, not minutes — and crucially, it caught problems on the *exact* commit that introduced them, not three commits later when nothing builds. The verifications used:

| When | Tool | What it caught |
|---|---|---|
| After a TDD task (helper, hook, store) | `npm test -- <name>` | Logic regressions immediately; the failing red → green → refactor cycle |
| After any TS source edit | `npm run build` (frontend) / `npm run typecheck` (both) | TS 6's `erasableSyntaxOnly` rejected parameter-property syntax in `ApiClient` — caught and rewritten before commit. TS rejected `as never` for a discriminated form union — refactored AuthForm to a single `FormValues` type |
| After a backend route or service change | `curl -s http://localhost:3000/api/v1/healthz` and feature endpoints with a real JWT | Verified the wire format matches `api.types.ts` before the frontend depended on it |
| After a containerization step | `docker compose up -d <service>` then `docker compose ps` and `curl` | Caught compose-file shape errors, missing env vars, port collisions |
| After data-layer changes | `psql -c 'SELECT count(*) ...'`, `mongosh --eval`, `redis-cli` | Confirmed migrations ran, seeds populated, ZSETs warmed |
| At each phase boundary | full `npm test` + `npm run build` + `git status` | "Did anything break that I didn't realize was related?" |

### Concrete examples from this build

These are real failures the agent caught on itself, mid-task, before any commit:

1. **TypeScript 6 strict mode rejected `class { constructor(public x) {} }`** in `ApiClient`. The build failed, the agent rewrote the class with explicit fields, build went green, then commit. No human round-trip.
2. **The `useForm<LoginValues | RegisterValues>` discriminated union** broke `register('displayName')` typing in TS 6. Build red. The agent collapsed the union into one `FormValues` interface and validated by the active zod schema instead. Build green, then commit.
3. **The seed had 200 leftover users from prior backend testing.** When the agent ran `npm run seed` from the frontend regression step, Drizzle threw `UNIQUE violation`. The agent paused, ran `TRUNCATE users, weekly_history, payouts CASCADE`, dropped Mongo `scores`, `FLUSHDB` Redis, and re-ran the seed cleanly. The fix took ~30 seconds because the loop is short.
4. **`baseUrl` deprecation in TS 6.** The first `tsconfig.app.json` shape used `baseUrl: "."`. Build emitted a deprecation error — agent removed `baseUrl` and changed `paths` to use the relative `./src/*` form, build went green.

### What this layer is NOT

- It is not a substitute for code tests. The agent runs the code tests; it does not replace them.
- It is not the same as CI. CI runs after push. The agent runs after each tool call.
- It is not "AI judges its own work." The agent runs deterministic commands (`tsc`, `vitest`, `curl`, `docker ps`) and reads the exit code. The judge is the build system, not the model.

The summary mental model: **the agent is a fast, cheap pre-commit hook with a memory of what's wired to what.**

---

## Layer 3 — Full regression (live stack via Playwright MCP)

Code tests verify pieces. Agent tests verify changes. Neither verifies that *the user can sign in, see their rank, tap, and see the prize pool tick*. That is what this layer does.

### What we drove

Tooling: the [Playwright MCP plugin](https://github.com/microsoft/playwright-mcp) for Claude Code. It exposes a real Chromium browser to the agent through tools like `browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot` (accessibility tree), `browser_evaluate` (raw JS in the page), `browser_take_screenshot`, `browser_resize`, and `browser_network_requests`. The agent issues these tool calls; the browser does the work; the page state comes back as an accessibility-tree YAML that the agent reasons about.

This is materially different from a Playwright spec file. There is no `*.spec.ts` to maintain. The "test" is a sequence of tool calls the agent decided to make, given the regression goals. When the contract changes, the next regression run is whatever the agent decides is appropriate — not a frozen script that drifts from reality.

### Stack under test (the canonical demo set-up)

```bash
# 1. Bring up everything (frontend + api + worker + postgres + mongo + redis)
make full-stack-up

# 2. Wipe state + re-seed in one shot (idempotent)
make reset-db

# 3. Background traffic (50 random users, 2s tick) so the board moves
make seed-traffic   # run in another terminal — Ctrl-C to stop

# 5. Open the SPA — frontend on :5173, API on :3000
```

### Regression checklist — what we actually verified

Each row was driven by Claude Code through Playwright MCP. The "Evidence" column is what the agent used to decide pass/fail, not a description of the test.

| # | Check | Evidence |
|---|---|---|
| 1 | Auth-guard: visiting `/` while unauthenticated redirects to `/auth` | `browser_navigate(http://localhost:5173)` → page URL becomes `/auth` |
| 2 | Auth page renders form + demo hint + tab toggle | Accessibility snapshot shows `Sign in`/`Create account` buttons, two textboxes, "Demo: caner / leaderboard" code block |
| 3 | Login with `caner` / `leaderboard` succeeds → `/leaderboard` | `browser_fill_form` + `browser_click("Sign in")`, page URL flips to `/leaderboard` |
| 4 | HeroCard shows non-trivial rank + display name + weekly score + Tap-to-earn | Snapshot: `5171st`, `Mei_5000`, `Weekly score 53`, button `tap to earn` |
| 5 | Header shows live countdown + prize-pool ticker | Snapshot: `Resets in 10:53:40`, `Prize pool 104,316.38`. Re-checked 2 minutes later: `Resets in 10:42:26`, `Prize pool 107,298.14` (moved as expected) |
| 6 | Top-100 list renders with rank/name/country/score; podium row shows top 3 with crown + medals; scores are formatted with `,` separators | Snapshot lists rows 1–18 with formatted scores like `1,000,026`, `435,293`, `267,596`; podium ordering visually shows 2-1-3 (Kai_2 / Kai_1 / Yuki_3) |
| 7 | Self+neighbors view: when caner is outside top 100, list ends at row 100, then a "You and your neighbors" divider, then 3 above + me + 2 below | Scrolled the virtualized list to bottom via `browser_evaluate(scrollTop = scrollHeight)`. Snapshot: `100 Kai_100`, divider `You and your neighbors`, then `5314 Kai_4436`, `5315 Kai_7452`, `5316 Mei_5498`, `5317 Mei_5000` (caner), `5318 Nora_4259`, `5319 Zara_5334`. 3-above + me + 2-below confirmed. |
| 8 | Optimistic Tap-to-earn: score increments by 1 immediately, then reconciles with the server on the next poll cycle | Pre-tap weekly score = 61; after `browser_click("tap to earn")`, score = 62 in the immediate next `browser_evaluate`; after `browser_wait_for(time=8)` the next poll showed score still 62 (server reconciled), and rank moved 5317 → 5219 (rank improved from earned point + neighbouring users shifting) |
| 9 | Rate-limit (1/sec): rapid taps return 429 and the UI does not crash | Fired 5 `POST /api/v1/score/submit` requests in parallel via `browser_evaluate`. Result in 31 ms: `[429, 204, 429, 429, 429]` — exactly one allowed, four blocked. Page remained responsive. |
| 10 | RewardsModal: distribution math sums to 100% of pool | Pool = 107,298.14. Modal showed: #1 → 21,459.63 (20%), #2 → 16,094.72 (15%), #3 → 10,729.81 (10%), #4–#100 → 59,013.98 (55%). 21459.63 + 16094.72 + 10729.81 + 59013.98 = 107,298.14 ✓ |
| 11 | HistoryDrawer: empty state renders since no week has rolled | Modal text: `Your history` heading + body `No completed weeks yet.` |
| 12 | Mobile width (390 × 844 — iPhone 14 viewport): single-column, hero stacks above list, rows are not clipped | `browser_resize(390, 844)`, then `getBoundingClientRect`: hero top=88 width=358, list top=588 width=358, hero above list. |
| 13 | Auth persistence + logout: reload keeps the user on `/leaderboard`; logout returns to `/auth` and clears localStorage | After full-page reload, `localStorage.getItem('leaderboard-auth')` was non-null and the rank still rendered. After clicking Log out, page URL = `/auth` and the persisted state was `{token: null, user: null}` |

All 13 passed. The only console error was a `404` on `/favicon.ico` (we deliberately did not ship one), which is harmless and not regression-relevant.

### Artifacts (kept in repo root, gitignored)

- `regression-01-leaderboard.png` — first paint of the leaderboard for caner.
- `regression-02-neighbors-view.png` — the divider + 3-above + me + 2-below band.
- `regression-03-mobile-iphone14.png` — single-column mobile layout.
- `.playwright-mcp/page-*.yml` — accessibility snapshots, one per significant interaction.
- `.playwright-mcp/console-*.log` — captured browser console output.

### How to re-run

The test "script" is this document. To re-run:

1. Bring up the stack (block above).
2. Seed + start demo traffic.
3. In Claude Code, ask: *"Run the regression in `docs/testplan.md` against the live stack."*

The agent will pick up the checklist and drive Playwright MCP through it. There is no separate file to keep in sync — the test plan **is** the test.

---

## What this approach gets us

- **Density of coverage where it matters.** 35 frontend + 37 backend Vitest tests cover load-bearing units. The browser regression covers user flows. We do not have 500 snapshot tests pretending to cover the same thing twice.
- **Speed of feedback.** Agent verification runs in seconds. Vitest runs in 2–100 seconds. Regression runs in minutes. The expensive layer is exercised last and only after the cheap layers are green.
- **Tests survive refactoring.** Because tests pin contracts (input shape, output shape, side effects), and not implementations, large refactors did not require rewriting tests — see the AuthForm union-type collapse, which kept all 4 of its tests green.
- **Documentation by construction.** This document was written *after* the work, by the agent that did the work, against artifacts the agent produced. The mismatch between "claimed test plan" and "actual test plan" is structurally hard to introduce.

## What this approach does NOT cover

To be honest about limits:

- No load test. We did not pound the API at 2M-DAU equivalent. The DESIGN spec acknowledges the production path moves to Atlas + ElastiCache + Fargate; that is where the next round of testing belongs.
- No multi-browser. The Playwright MCP plugin runs Chromium. Safari/Firefox-specific bugs would not be caught.
- No A/B network conditions. We did not throttle the network and watch the optimistic UI degrade. The 7-second poll-interval design assumption is intuited, not measured.
- No accessibility audit. We rely on accessibility *snapshots* for assertion, but we did not run axe-core or a screen reader.
- No visual regression. The screenshots are evidence, not baseline-compared assertions. A future iteration would diff against a stored set.

These are the obvious "if this case became a real product, here's what gets added next" items.
