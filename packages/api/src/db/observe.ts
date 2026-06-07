import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import { loadConfig } from '../config.js';
import { logger } from '../lib/logger.js';
import { addBreadcrumb } from '../lib/sentry.js';

/**
 * Module-level AsyncLocalStorage that stores the current request's
 * id, set by the request-id plugin when a request starts. The
 * observeSql wrapper reads from this store when it emits a slow-
 * query log, so the log line includes the requestId that ties it
 * to the active Sentry transaction / Pino request logger.
 *
 * Why a separate ALS (and not the one inside the request-id plugin):
 * the request-id plugin's only job is to enrich req.log. observeSql
 * is called deep in the repo layer with no access to `req`, so it
 * needs a global lookup. Putting the ALS in db/observe.ts keeps the
 * dependency arrow pointed at the consumer (request-id imports
 * observe's store, not the other way around).
 */
export const requestIdStore = new AsyncLocalStorage<string>();

// ---------------------------------------------------------------------------
// In-process counters
// ---------------------------------------------------------------------------
//
// `inUse` is the count of queries currently inside an observeSql call
// (i.e. running against a connection). It is opt-in: only queries that go
// through observeSql are counted. If a repo function forgets to wrap its
// call, that query is invisible to inUse — see Task 8 for the sweep that
// ensures every repo is wrapped.
//
// `waiting` is the count of queries that have entered observeSql but
// are blocked waiting for a connection. We do NOT have a reliable way to
// measure this with postgres-js 3.4.5 (no onreserve/onrelease events, no
// exposed pool internals). It is always 0 in the response. Pool
// saturation is detected via `inUse == max` sustained over time.

let inUse = 0;
let waiting = 0;

/**
 * Wrap a query with timing + slow-query logging. The closure runs the
 * actual query (using whatever `sql`/`db` the caller normally uses);
 * this wrapper only measures elapsed time and emits a log/breadcrumb
 * if the duration exceeds the threshold.
 */
export async function observeSql<T>(fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  inUse++;
  try {
    return await fn();
  } finally {
    inUse--;
    const durationMs = performance.now() - start;
    const threshold = loadConfig().SLOW_QUERY_MS;
    if (threshold === 0 || durationMs > threshold) {
      emitSlowQuery(durationMs);
    }
  }
}

function emitSlowQuery(durationMs: number): void {
  const requestId = requestIdStore.getStore();
  // Note: we don't capture the SQL text in this layer — the caller is
  // the repo function, and threading the SQL string through would
  // require changing every call site to pass it in. The Sentry
  // transaction already has the route + status, which is enough to
  // find the offending query in Neon. If we later want SQL text in
  // the breadcrumb, we'd add an optional `sql` arg to observeSql.
  const payload = {
    evt: 'slow_query' as const,
    durationMs: Math.round(durationMs),
    requestId,
  };
  logger.warn(payload, 'slow query');

  try {
    addBreadcrumb({
      category: 'db',
      message: 'slow_query',
      data: { durationMs: Math.round(durationMs) },
      level: 'warning',
    });
  } catch {
    // Never let an observability bug break the API.
  }
}

/** Snapshot of current pool state. Exposed for /healthz. */
export function getPoolStats(): { max: number; inUse: number; waiting: number } {
  // `max` is read on every call (config is cached, so this is cheap).
  // If config is not yet loaded (early startup), max is 0 — safe default.
  let max = 0;
  try {
    max = loadConfig().DB_POOL_MAX;
  } catch {
    max = 0;
  }
  return { max, inUse, waiting };
}

/** Test-only — reset counters between tests. */
export function _resetObserveForTests(): void {
  inUse = 0;
  waiting = 0;
}
