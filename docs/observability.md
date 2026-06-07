# Observability

This document is the operator runbook for the DAM-Link backend. It describes:

1. What each `/healthz` field means
2. How to read the slow-query logs and Sentry breadcrumbs
3. Recommended Sentry alert rules
4. Recommended Neon alert rules
5. A troubleshooting decision tree

If something is wrong in production, start here.

---

## 1. `/healthz` response

The endpoint returns 200 if the API can reach Postgres and S3, 503 otherwise. The body shape (as of `feat/backend-observability`):

```json
{
  "status": "ok" | "degraded",
  "db":    "ok" | "down",
  "s3":    "ok" | "down",
  "version": "<git sha or '0.0.0'>",
  "uptime": <seconds since the process started>,
  "pool": {
    "max":     <configured DB_POOL_MAX, default 10>,
    "inUse":   <queries currently inside observeSql, integer >= 0>,
    "waiting": <always 0 — see note below>
  }
}
```

### What `inUse` tells you

`inUse` is the number of Drizzle queries currently in flight. **Pool saturation** is `inUse == max` sustained over multiple `/healthz` polls (e.g. > 30 seconds). When saturated, requests will start queuing and p99 latency will rise.

### Why `waiting` is always 0

postgres-js 3.4.5 does not expose pool internals — there are no `onreserve`/`onrelease` events we can hook. So we cannot measure how many requests are *queued* waiting for a connection. We can only measure how many are *running*. Operators should treat `inUse == max` (sustained) as the saturation signal. If postgres-js adds pool events in a future version, this field will start returning real values automatically — the schema is already in place.

### Polling

A reasonable polling cadence is 10 seconds. Don't poll faster than 1 second — the endpoint is cheap but the noise-to-signal ratio drops.

---

## 2. Slow-query logs

When a Drizzle query takes longer than `SLOW_QUERY_MS` (default 200ms, env-tunable), a single warn-level Pino log line is emitted with this shape:

```json
{
  "level": "warn",
  "time": "<ISO 8601>",
  "service": "dam-link-api",
  "evt": "slow_query",
  "op": "<repo>.<methodName>",
  "durationMs": 350,
  "rowCount": 42,
  "requestId": "<id from the request-id plugin, ties to the Sentry transaction>",
  "msg": "slow_query"
}
```

The same query is also recorded as a **Sentry breadcrumb** on the active transaction with `category: "db"`, `message: "slow_query"`, `data: { op, durationMs, rowCount }`.

### What `op` is and isn't

`op` is a stable operation label like `'assets.findAssetById'` or `'orgs.listForUser'` — it's NOT raw SQL. The label survives query rewrites and reads cleanly in alerts. To get the actual SQL text:

1. Note the `op` from the log line (e.g. `'assets.findAssetById'`).
2. Open `packages/api/src/repositories/assets.repo.ts` and find `findAssetById`.
3. Read the SQL the function builds.

For the ground-truth SQL with parameter binding (the actual statement Postgres executed):

1. Open the Neon control panel → Query Performance.
2. Filter by the time window from the log line's `time`.
3. Match the query trace.

### Why no raw SQL in the log

Threading SQL through `observeSql` would require capturing it from a postgres-js debug hook that's not exposed in 3.4.5. The op label + Sentry transaction's other breadcrumbs (route + status) are enough to narrow any slow query to one repo function without leaving the dashboard.

---

## 3. Sentry alert rules (configure in Sentry UI)

These are the recommended alert rules. They are NOT applied automatically — configure them in the Sentry project UI (Settings → Alerts).

| Alert | Condition | Threshold | Why |
|---|---|---|---|
| 5xx error rate | `5xx_count / total_count` | > 1% over 5 min | Pages on real bugs (5xx are server errors, not user errors) |
| Slow transaction p95 | `p95(transaction.duration)` | > 1000ms over 5 min | Catches a sudden DB slowdown before users notice |
| Slow-query breadcrumb frequency | count of breadcrumbs with `category=db, message=slow_query` | > 5 per minute | One slow query from a hot route = the whole endpoint slows down |
| Repeated 5xx | same fingerprint, 5xx events | > 10 per hour | A single bug spamming 5xx — different alert from the rate-based one because it's the same code path |

Configure the **slow-query frequency** alert with:

- **Filter**: `category = "db" AND message = "slow_query"`
- **Aggregate**: `count()`
- **Time window**: `1 minute`
- **Threshold**: `> 5`

(Implementation note for whoever sets this up: Sentry alert conditions on breadcrumb frequency are configured under "Number of events" with a custom filter — not under "Users affected" or "Crash rate".)

---

## 4. Neon alert rules (configure in Neon UI)

These are configured in the Neon project dashboard, not in code.

| Alert | Where | Threshold |
|---|---|---|
| Connection limit approaching | Settings → Compute → Connection limit | > 80% of limit |
| CPU sustained high | Monitoring → CPU | > 70% for 5 min |
| Storage | Settings → Storage | > 80% of quota |
| Slow query log | Query Performance | review weekly |

Useful Neon links (replace `<project>` with the actual project slug):

- Query Performance: `https://console.neon.tech/app/projects/<project>/query-performance`
- Monitoring: `https://console.neon.tech/app/projects/<project>/monitoring`
- Settings (compute, storage, connection limits): `https://console.neon.tech/app/projects/<project>/settings`

---

## 5. Troubleshooting decision tree

Start with the symptom. Follow the branch.

### "API is slow"

1. Open Sentry → Issues → sort by events. Are there recent 5xx issues? If yes, fix those first.
2. Open Sentry → Performance → filter to p95 > 1s. What route is the slow one?
3. Click into the slow transaction. Look at the breadcrumb trail. Is there a `slow_query` breadcrumb? If yes:
   - The breadcrumb's `data.op` is the repo function (e.g. `'assets.listAssets'`).
   - The breadcrumb's `data.durationMs` is the query duration.
   - Open the repo file for that op. Read the SQL.
   - Run the same query manually in Neon SQL Editor with `EXPLAIN ANALYZE` to see the plan.
   - Common fixes: add a missing index, rewrite the query, paginate harder.
4. If no slow-query breadcrumb but the transaction is still slow: the latency is outside the DB. Check:
   - `req.log` for the request — are there gaps between breadcrumbs? That's where the time went.
   - External services (S3, Turnstile) — check their status pages.

### "Postgres CPU is high"

1. Open Neon → Monitoring → CPU. When did it start?
2. Open Neon → Query Performance. Sort by total time. The top query is the offender.
3. Cross-reference with the slow-query logs: does the same query appear in `evt: slow_query`?
4. Fix: add an index, optimize the query, or (if it's the hot read path) consider caching that one specific query. **Do not pre-emptively add a cache for the whole table.**

### "Postgres connection limit is hit"

1. Open Neon → Settings → Compute. What is the connection limit for this compute size?
2. Open `/healthz` repeatedly. Is `inUse` pinned to `max`? If yes, the pool is saturated — see "API is slow" above.
3. If `inUse` is well below `max`, something else is holding connections (likely a connection leak in a third-party library). Restart the Fly.io app, then re-monitor.

### "Sentry is full of errors"

1. Sort by frequency. The top fingerprint is almost always the bug.
2. If the top error is a 4xx (user error, not a bug), exclude it from the alert filter. 4xx should not page.
3. If the top error is a 5xx, click in. The stack trace and breadcrumbs tell the story.

### "I don't know what's wrong"

1. Open `/healthz`. Is the API up at all? If `status: degraded`, the problem is DB or S3 — see those branches.
2. If `/healthz` is fine but users complain: it's probably one slow route, not the whole system. Follow "API is slow" with the slow route from a user report.

---

## 6. How this was built

- `observeSql` wrapper: `packages/api/src/db/observe.ts`
- `/healthz` extension: `packages/api/src/plugins/health.ts`
- Config: `DB_POOL_MAX` and `SLOW_QUERY_MS` in `packages/api/src/config.ts`
- requestId propagation: `packages/api/src/plugins/request-id.ts` (AsyncLocalStorage)
- Every repo function wrapped: `packages/api/src/repositories/*.repo.ts` + `packages/api/src/db/repositories/health.repo.ts` (43 functions total across 7 files, invariant guarded by `tests/repos.observe.test.ts`)

**No caching was added.** The maintainer's concern was "future scale"; the response was "make it measurable first, optimize later". This document is the "later" entry point.
