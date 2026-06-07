import { AsyncLocalStorage } from 'node:async_hooks';

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
