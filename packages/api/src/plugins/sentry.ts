import type { App } from '../types.js';
import { loadConfig } from '../config.js';

/**
 * Sentry is wired in Plan 9. For now this is a no-op plugin that
 * reserves the place and warns if SENTRY_DSN is set but unused.
 */
export async function registerSentry(_app: App): Promise<void> {
  const config = loadConfig();
  if (config.SENTRY_DSN && config.NODE_ENV === 'production') {
    _app.log.warn(
      { dsn: '[REDACTED]' },
      'SENTRY_DSN is set but Sentry is not yet wired up. See Plan 9.',
    );
  }
}
