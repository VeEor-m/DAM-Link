import * as Sentry from '@sentry/node';
import type { nodeProfilingIntegration as NodeProfilingIntegrationFn } from '@sentry/profiling-node';
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

export async function initSentry(opts: SentryOptions): Promise<void> {
  if (initialised) return;
  // The profiling integration ships a native binary per Node ABI. On
  // Windows + Node 24 (ABI 137) the prebuilt @sentry/profiling-node@8.42.0
  // binary is missing (max ABI 127), so we load it lazily and skip
  // gracefully. CI (Linux) and production (Linux) still get profiling.
  let nodeProfilingIntegration: typeof NodeProfilingIntegrationFn | undefined;
  try {
    const mod = await import('@sentry/profiling-node');
    nodeProfilingIntegration = mod.nodeProfilingIntegration;
  } catch (err) {
    logger.warn({ err }, 'sentry: profiling integration unavailable, continuing without');
  }
  Sentry.init({
    dsn: opts.dsn,
    environment: opts.environment,
    release: opts.release,
    tracesSampleRate: opts.tracesSampleRate,
    profilesSampleRate: opts.profilesSampleRate,
    integrations: nodeProfilingIntegration ? [nodeProfilingIntegration()] : [],
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
export async function initSentryFromEnv(): Promise<boolean> {
  const config = loadConfig();
  if (!config.SENTRY_DSN) {
    logger.info('sentry: SENTRY_DSN not set, skipping init');
    return false;
  }
  await initSentry({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    release: process.env.GIT_COMMIT ?? 'dev',
    tracesSampleRate: config.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: config.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
  logger.info({ environment: config.NODE_ENV }, 'sentry: initialised');
  return true;
}
