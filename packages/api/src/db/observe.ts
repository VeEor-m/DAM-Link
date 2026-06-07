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
 * Wrap a query with timing + slow-query logging.
 *
 * @param op   A short, stable operation label identifying the caller
 *             (e.g. `'assets.findById'`, `'orgs.listForUser'`). The
 *             label is included in the slow-query log line and the
 *             Sentry breadcrumb so an on-call engineer can find the
 *             offending repo function. It is NOT raw SQL — it survives
 *             query rewrites and does not require hooking postgres-js.
 *             Use `<repo>.<method>` convention.
 * @param fn   The closure that performs the actual query. The wrapper
 *             only measures elapsed time and emits a log/breadcrumb
 *             if the duration exceeds the threshold.
 */
export async function observeSql<T>(op: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  inUse++;
  // Track the outcome so the finally block can compute rowCount from
  // it for the slow-query log. Drizzle queries return arrays; non-
  // array results (single scalar, insert/update result objects) are
  // reported as rowCount=undefined. A failed slow query is still
  // interesting, so we log it with rowCount=undefined too.
  let outcome: { ok: true; value: T } | { ok: false } = { ok: false };
  try {
    const value = await fn();
    outcome = { ok: true, value };
    return value;
  } finally {
    inUse--;
    const durationMs = performance.now() - start;
    const threshold = loadConfig().SLOW_QUERY_MS;
    if (threshold === 0 || durationMs > threshold) {
      emitSlowQuery(op, durationMs, outcome.ok ? outcome.value : undefined);
    }
  }
}

function emitSlowQuery(op: string, durationMs: number, result: unknown): void {
  const requestId = requestIdStore.getStore();
  // Compute rowCount from the return value: Drizzle queries return
  // arrays. Non-array results (single scalar, insert/update result
  // objects) pass through as undefined. We deliberately do NOT try
  // to count rows inside an object — the calling repo knows the
  // shape better than we do.
  const rowCount = Array.isArray(result) ? result.length : undefined;
  const roundedMs = Math.round(durationMs);
  // Wrap the entire emit body in one try/catch: if either the logger
  // or the Sentry breadcrumb throws (custom transport failure,
  // circular ref in payload, etc.), the throw must NOT propagate out
  // of the finally block and replace the caller's return value. This
  // is the spec's explicit trade-off — observability bugs never
  // break the API.
  try {
    logger.warn(
      { evt: 'slow_query', op, durationMs: roundedMs, rowCount, requestId },
      'slow query',
    );
    addBreadcrumb({
      category: 'db',
      message: 'slow_query',
      data: { op, durationMs: roundedMs, rowCount },
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
