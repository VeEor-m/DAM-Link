import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { loadConfig } from '../config.js';
import { logger } from './logger.js';

let initialised = false;

export interface SentryOptions {
  dsn: string;
  environment: string;
  release: string;
  tracesSampleRate: number;
  profilesSampleRate: number;
}

export function initSentry(opts: SentryOptions): void {
  if (initialised) return;
  Sentry.init({
    dsn: opts.dsn,
    environment: opts.environment,
    release: opts.release,
    tracesSampleRate: opts.tracesSampleRate,
    profilesSampleRate: opts.profilesSampleRate,
    integrations: [nodeProfilingIntegration()],
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip cookies and auth headers from breadcrumbs.
      if (event.request?.cookies) delete event.request.cookies;
      if (event.request?.headers) {
        delete event.request.headers.cookie;
        delete event.request.headers.authorization;
      }
      return event;
    },
  });
  initialised = true;
}

/** Capture an exception with extra context. Safe to call before init (no-op). */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!initialised) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

/** Test-only — reset the singleton so tests can re-init with a different DSN. */
export function _resetSentryForTests(): void {
  initialised = false;
  Sentry.getClient()?.close();
}

/** Boot-time init driven by env. Logs and skips if DSN is absent. */
export function initSentryFromEnv(): boolean {
  const config = loadConfig();
  if (!config.SENTRY_DSN) {
    logger.info('sentry: SENTRY_DSN not set, skipping init');
    return false;
  }
  initSentry({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    release: process.env.GIT_COMMIT ?? 'dev',
    tracesSampleRate: config.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: config.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
  logger.info({ environment: config.NODE_ENV }, 'sentry: initialised');
  return true;
}
