# Backend Observability (No Caching) — Design Spec

> **Status:** Approved by user 2026-06-07 via brainstorming dialogue.
> **Scope:** `packages/api/src/db/`, `packages/api/src/plugins/health.ts`, `packages/api/src/config.ts`, `docs/observability.md` (new). No business routes / services / repositories touched. No caching introduced.
> **Out of scope:** Caching, Prometheus `/metrics` endpoint, Sentry sample-rate changes, any UI / frontend work.

## 1. Problem

DAM-Link backend is feature-complete (Plans 1–11, 14, 15, 16, 18 all merged) and deployable. The maintainer is worried about "future scale" — specifically **Postgres CPU saturation and connection-pool exhaustion** when concurrent user load grows.

The current state of observability:

| Thing | Status |
|---|---|
| Sentry 5xx error reporting | ✅ already in place (Plan 9) |
| Sentry performance tracing | ✅ already enabled, `tracesSampleRate: 0.1` in prod |
| Pino structured logging | ✅ already in place (Plan 1) |
| `/healthz` pings DB + S3 | ✅ already in place (Plan 1) |
| Slow query logging (app-side) | ❌ not present |
| Slow query logging (DB-side) | ❌ only via Neon control panel; not surfaced anywhere |
| Connection pool sizing | ⚠️ `max: 10` hardcoded in `db/client.ts` |
| Connection pool visibility | ❌ not exposed — no way to see "in-use" or "waiting" |
| Sentry alert rules | ❌ not configured (tracing is on, but no p95/5xx-rate thresholds) |
| Neon-side observability docs | ❌ no project doc links to Neon panels |

The maintainer has **no production load data** — the worry is anticipatory. The right response is **not to add caching** (which would create invalidation complexity for a hypothetical bottleneck) but to **add the minimum observability that turns "the system feels slow someday" into "the Sentry alert fires on transaction X, which runs query Y, which takes 800ms"**.

## 2. Goal

Make future scaling problems **observable and root-causable** from day one, with minimal code change and zero new infrastructure dependencies.

Concretely, when (not if) the first user reports a slow request, an on-call engineer should be able to:

1. Open Sentry, find the slow transaction, see which SQL queries ran, find the slow one.
2. Open `/healthz`, see whether the connection pool is saturated (`inUse` near `max`, `waiting > 0`).
3. Open Neon, see DB CPU + the slow query log.
4. Decide — based on real numbers — whether to add a specific index, raise `DB_POOL_MAX`, or actually add a cache for one specific hot path.

## 3. Design Decisions (confirmed with user)

| Dimension | Choice | Rationale |
|---|---|---|
| Caching now? | **No** | No production load data; YAGNI. Cache invalidation is the most expensive bug class in the system. |
| Where to capture slow queries? | **App-side** (wrap the postgres-js client) | Neon (managed Postgres) doesn't expose `log_min_duration_statement` to us; app-side gets `requestId` context that DB-side can't. |
| Cache technology? | **None** | This plan is not a caching plan. |
| Metrics format? | **JSON on `/healthz` extension** | No Prometheus scraper in stack yet. JSON is enough for human debug + future alerting. |
| Sentry alert config? | **Documented, configured by hand in Sentry UI** | Not code. Doc lists the recommended thresholds. |
| Neon alert config? | **Documented, configured by hand in Neon UI** | Not code. Doc links the relevant panels. |
| `DB_POOL_MAX` configurable? | **Yes, env var** | Currently `max: 10` is hardcoded. Knob not rocket. |

## 4. Architecture

Three new pieces, all small. No new dependencies.

```
                                  ┌─────────────────────┐
                                  │  lib/sentry.ts      │  (existing)
                                  │  Sentry.init(...)   │
                                  └──────────▲──────────┘
                                             │ Sentry.addBreadcrumb
                                             │
┌────────────────────┐  wrap with timer  ┌───┴──────────────────┐
│ db/client.ts       │ ────────────────► │ db/observe.ts       │ (NEW)
│   getDb()          │                   │   observeSql<T>()   │
│   postgres(url,    │                   │   - measure ms      │
│     { max: 10 })   │                   │   - if > threshold  │
└─────────┬──────────┘                   │     log + breadcrumb│
          │                              │   - track inUse /   │
          │ raw sql client               │     waiting counts  │
          ▼                              └─────────┬───────────┘
┌────────────────────┐                             │
│ Drizzle / repos    │ ─── uses wrapped sql ───────┘
│  (unchanged)       │
└────────────────────┘

┌────────────────────┐
│ plugins/health.ts  │ (MODIFIED)
│   GET /healthz     │   response now includes
│   GET /version     │     pool: { max, inUse, waiting }
└─────────┬──────────┘
          │ reads pool counts
          ▼
   db/observe.ts (NEW) — exports getPoolStats()
```

### 4.1 New file: `packages/api/src/db/observe.ts`

Exports:

```ts
/**
 * Wrap a query with timing + slow-query logging. The caller passes a
 * closure that performs the query (using whichever sql/db client the
 * caller normally uses); this wrapper measures elapsed time, logs +
 * adds a Sentry breadcrumb if the duration exceeds the threshold.
 *
 * Note: this wrapper is opt-in. Queries that bypass it are not timed
 * and not counted in `inUse`. The implementation plan must wrap every
 * repository call site (or document the exceptions).
 */
export async function observeSql<T>(fn: () => Promise<T>): Promise<T>;

/** Snapshot of current pool state. Exposed for /healthz. */
export function getPoolStats(): { max: number; inUse: number; waiting: number };

/** Test-only — reset counters between tests. */
export function _resetObserveForTests(): void;
```

Implementation outline (~80 lines):

- A module-level `let inUse = 0; let waiting = 0;`.
- `observeSql`:
  - `const start = performance.now(); inUse++;`
  - `try { return await fn(); }`
  - `finally { inUse--; const durationMs = performance.now() - start; if (durationMs > threshold) { ... } }`
  - The slow-query branch logs to `logger.warn({ evt: 'slow_query', durationMs, sql, rowCount, requestId }, 'slow query')` and calls `Sentry.addBreadcrumb({ category: 'db', message: 'slow_query', data: { durationMs, sql, rowCount } })`.
  - The `requestId` comes from `AsyncLocalStorage` populated by the existing `request-id` plugin.
  - **Note**: `inUse` only counts queries that go through `observeSql`. A repository that bypasses the wrapper will not increment this counter. The implementation plan MUST wrap every repository call site or document the exceptions.
- `getPoolStats()`: returns `{ max: poolMax, inUse, waiting }`.
- `poolMax` is read from the `sql.options.max` (set by `db/client.ts` from config).
- For `waiting`: postgres-js fires `onreserve` when a connection is reserved from the pool (no wait) or `onreserve` with a delay when one has to wait. We attach these in `db/client.ts` (not in `observe.ts`) and track `waiting` as a counter. **One-time hook setup, runs on first `getDb()` call.**

### 4.2 Modified: `packages/api/src/db/client.ts`

- Import `observeSql` and the `getPoolStats` requirements.
- Read `DB_POOL_MAX` from `loadConfig()` (new env, default 10).
- Pass `{ max: dbPoolMax, idle_timeout: 30, connect_timeout: 5, onreserve, onrelease }` to `postgres()`.
- The `onreserve` callback increments `waiting` and decrements on actual allocation; the `onrelease` decrements `inUse`. The exact semantics need to be verified against postgres-js's actual event names — see Implementation Note in §7.
- Export a `getPoolStats()` re-export (or have `observe.ts` own the counter and `client.ts` re-export).

### 4.3 Modified: `packages/api/src/plugins/health.ts`

- Add `pool: { type: 'object', properties: { max: { type: 'number' }, inUse: { type: 'number' }, waiting: { type: 'number' } }, required: ['max', 'inUse', 'waiting'] }` to `HealthResponseSchema`.
- In the handler, call `getPoolStats()` and include it in the response.
- The `uptime` field semantics: currently it's `Math.floor((Date.now() - start) / 1000)` where `start` is module-load time. That is "seconds since this module was loaded", which is fine but a bit odd. **Out of scope for this plan** — leave it as-is.

### 4.4 Modified: `packages/api/src/config.ts`

- Add `DB_POOL_MAX: number` (default 10) and `SLOW_QUERY_MS: number` (default 200) to the config interface + parser.
- Documented in the env table.

### 4.5 New file: `docs/observability.md`

- Section 1: `/healthz` response shape (field by field)
- Section 2: Sentry alert rules — recommended thresholds table (5xx rate, p95 latency, slow query frequency)
- Section 3: Neon observability — links to:
  - Neon Query Performance dashboard
  - Neon connection limit docs
  - Neon CPU/quotas panel
- Section 4: Troubleshooting decision tree — "you see X symptom → check Y panel → likely cause is Z"

## 5. Data Flow

### 5.1 Slow query logging (happy path)

1. Request arrives, `request-id` plugin stores `requestId` in `AsyncLocalStorage`.
2. Route handler calls `db.execute(...)` (Drizzle).
3. Drizzle internally calls the wrapped postgres-js `sql` client (which is the same `cachedSql` we wrapped, but the wrap happens at the `observeSql` boundary in the repo layer).
4. `observeSql`:
   - Reads `requestId` from `AsyncLocalStorage`.
   - Increments `inUse`, runs the query, decrements on completion.
   - If `durationMs > SLOW_QUERY_MS`:
     - Pino `warn` log line: `{ evt: 'slow_query', durationMs, sql, rowCount, requestId, level: 'warn' }`.
     - Sentry `addBreadcrumb` with category `db`, message `slow_query`, data `{ durationMs, sql, rowCount }`. (Not an exception — a breadcrumb, so it doesn't create a Sentry issue, just shows up on the current transaction's breadcrumb trail.)
5. Test in unit test asserts: when threshold is 0ms, every query logs; when threshold is 1000ms, a 5ms query does not.

### 5.2 Connection pool stats on `/healthz`

1. K8s/load-balancer/Fly health check hits `GET /healthz` every N seconds.
2. Handler:
   - Runs `Promise.all([pingDb(), pingS3()])` (existing).
   - Reads `getPoolStats()` (new).
   - Returns `{ status, db, s3, version, uptime, pool: { max, inUse, waiting } }`.
3. A future alerting job (TBD, out of scope) can scrape `/healthz` and alert on `inUse/max > 0.8` or `waiting > 0`.

### 5.3 Sentry alert (configured in Sentry UI, not in code)

The design doc lists the recommended alert rules. They are NOT applied automatically; the user (or whoever owns the Sentry project) configures them. This is the same pattern the project's `docs/deployment.md` uses for Sentry DSN setup.

## 6. Error Handling

| Failure | Behavior |
|---|---|
| `observeSql` callback throws | Bubbles up unchanged — the timer/cleanup still runs in `finally`, but the exception is not swallowed. |
| `getPoolStats()` called before `getDb()` has been called once | Returns `{ max: 0, inUse: 0, waiting: 0 }` (safe defaults). The first real DB call will initialize the pool. |
| Sentry not initialized (no DSN) | `Sentry.addBreadcrumb` is a no-op (per `@sentry/node` semantics). The Pino log still fires. |
| `AsyncLocalStorage` doesn't have a `requestId` (e.g. background job, not a request) | `requestId` is `undefined` in the log — acceptable, not an error. |
| `onreserve`/`onrelease` events don't exist on this version of postgres-js | Falls back to in-flight counter only (`waiting` stays 0). Documented in §7 Implementation Note. |
| Slow query happens but logger / Sentry fail | Query result is already returned to caller; log/breadcrumb failure is swallowed (wrapped in `try { ... } catch {}` so observability bugs never break the API). |

## 7. Testing

| Test file | Type | Asserts |
|---|---|---|
| `tests/db.observe.test.ts` | unit | `observeSql` returns the wrapped result; a fast query does NOT log; a slow query (> threshold) DOES log `evt: 'slow_query'` with the right fields. |
| `tests/db.observe.threshold.test.ts` | unit | `SLOW_QUERY_MS=0` → every query logs; `SLOW_QUERY_MS=10000` → a 50ms query does not. |
| `tests/db.observe.requestId.test.ts` | unit | With `AsyncLocalStorage` populated, the slow query log includes the same `requestId`. |
| `tests/db.observe.breadcrumb.test.ts` | unit | Slow query calls `Sentry.addBreadcrumb` with `category: 'db'`, `data.durationMs > threshold`. Mocks Sentry. |
| `tests/db.poolStats.test.ts` | unit | Two concurrent `observeSql` calls report `inUse: 2`; after both complete, `inUse: 0`. If postgres-js supports the events, also test `waiting` increments. |
| `tests/health.pool.test.ts` (or extend `tests/health.test.ts`) | integration | `GET /healthz` response JSON has `pool: { max, inUse, waiting }`; `max` matches `DB_POOL_MAX`; values are non-negative integers. |
| `tests/config.dbPoolMax.test.ts` | unit | `DB_POOL_MAX=25` env → `getDb()` creates a pool with `max: 25`. |
| `tests/config.slowQueryMs.test.ts` | unit | `SLOW_QUERY_MS=500` env → `observeSql` threshold is 500. |

**Total**: 7–8 new tests. No changes to existing tests except the one health test extension.

## 8. Implementation Notes (engineer should know)

- **postgres-js event names**: The exact event names (`onreserve`, `onrelease`, or maybe `connect`, `poolconnect`, etc.) need to be verified against the installed version (per `package.json`). If the events don't exist, `waiting` stays 0 forever — that's a known acceptable degradation, documented in §6.
- **Wrap point for Drizzle**: The `observeSql` wrapper goes around individual queries, not around the `sql` client itself. The cleanest seam is to wrap inside the repository layer OR provide a helper that repos call. **Plan must decide**:
  - Option X: Repos call `await observeSql(() => sql\`SELECT ...\`)` — explicit, every repo call site changes.
  - Option Y: Replace the exported `sql` from `db/client.ts` with a Proxy that times every method call. Zero call-site changes, but magic.
  - **Recommendation: Option X.** It's 5–10 minutes of `await observeSql(async (s) => await s\`...\`)` wrapping per repo, and it makes the instrumentation visible to anyone reading the code. Magic proxies tend to be debugged the hard way.
- **`AsyncLocalStorage` import**: The existing `request-id` plugin (`packages/api/src/plugins/request-id.ts`) likely already uses `AsyncLocalStorage` — confirm and reuse the same instance rather than creating a second one.
- **Test isolation**: `inUse` and `waiting` are module-level state. Test setup must call `_resetObserveForTests()` in `beforeEach` to avoid cross-test bleed. The existing `_closeDbForTests()` + `_resetSentryForTests()` pattern is the model.

## 9. File Structure

| File | Action | Purpose |
|------|--------|---------|
| `packages/api/src/db/observe.ts` | create | `observeSql`, `getPoolStats`, `_resetObserveForTests` |
| `packages/api/src/db/client.ts` | modify | Read `DB_POOL_MAX` from config, attach `onreserve`/`onrelease` to postgres-js options, re-export `getPoolStats` |
| `packages/api/src/config.ts` | modify | Add `DB_POOL_MAX` (default 10) and `SLOW_QUERY_MS` (default 200) to config interface + parser |
| `packages/api/src/plugins/health.ts` | modify | Add `pool: { max, inUse, waiting }` to `/healthz` response schema and handler |
| `docs/observability.md` | create | Operator runbook — `/healthz` field reference, Sentry alert recommendations, Neon panel links, troubleshooting decision tree |
| `packages/api/tests/db.observe.test.ts` | create | Fast query doesn't log; slow query logs |
| `packages/api/tests/db.observe.threshold.test.ts` | create | `SLOW_QUERY_MS` env knob |
| `packages/api/tests/db.observe.requestId.test.ts` | create | requestId in log |
| `packages/api/tests/db.observe.breadcrumb.test.ts` | create | Sentry breadcrumb |
| `packages/api/tests/db.poolStats.test.ts` | create | inUse / waiting counters |
| `packages/api/tests/health.pool.test.ts` | create | `/healthz` response shape |
| `packages/api/tests/config.dbPoolMax.test.ts` | create | `DB_POOL_MAX` env knob |
| `packages/api/tests/config.slowQueryMs.test.ts` | create | `SLOW_QUERY_MS` env knob |
| `packages/api/tests/health.test.ts` | modify | Add `pool` field assertion to existing healthz test (alternative to creating new file) |

No backend business code (routes, services, repos) changes. No contracts. No web frontend. No new dependencies.

## 10. Generalization Rules (for future maintainers)

1. **Don't add caching before you have data.** YAGNI applies doubly to caches: the invalidation code is the most expensive code to write correctly, and it doesn't get tested until something goes wrong. A "no-op plan" (just observability) is a valid plan.
2. **"Future scale" without numbers is a smell.** The right next step is to make the system *measurable* (this plan), not *faster* (caching). Faster comes from a specific slow query, not a vague worry.
3. **Sentry is already a slow-query log if you wire it up.** Performance tracing captures transactions; breadcrumb-level instrumentation on hot operations gives you query-level visibility without a separate logging system.
4. **App-side observability beats DB-side observability when the DB is managed.** You get request context (requestId, userId, route) that the DB log never sees. The DB log is for the DBAs; the app log is for the API maintainers.
5. **Configuration knobs that you can imagine tuning should be env vars, not constants.** `DB_POOL_MAX=10` should be `DB_POOL_MAX=${process.env.DB_POOL_MAX ?? 10}` from day one. The "we don't need to configure this yet" mindset is the same one that produces `max: 10` hardcoded in the first place.

## 11. Out of Scope (explicit)

- Caching of any kind (Redis, in-process, CDN, HTTP).
- Prometheus `/metrics` endpoint.
- Changes to Sentry `tracesSampleRate` or `profilesSampleRate`.
- Changes to business routes / services / repositories.
- Auto-scaling of the connection pool.
- Per-route or per-user connection budgets.
- Read replicas / DB sharding.
- Web frontend changes.
- Any new npm dependencies.

## 12. Success Criteria

This plan is "done" when:

1. All new tests pass; all existing tests still pass.
2. `pnpm typecheck` and `pnpm lint` are clean.
3. `GET /healthz` returns a `pool` field with `max`, `inUse`, `waiting`.
4. A test query that takes longer than `SLOW_QUERY_MS` produces a `warn`-level Pino log line with `evt: 'slow_query'` and a Sentry breadcrumb (visible when the request is captured in a Sentry transaction).
5. `DB_POOL_MAX=25` env actually creates a 25-connection pool.
6. `docs/observability.md` exists, lists the Sentry alert rules, and links the Neon panels.
7. The plan is merged to `main` via a worktree, tagged, and `MEMORY.md` updated.
