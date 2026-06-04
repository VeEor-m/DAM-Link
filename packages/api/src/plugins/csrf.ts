import type { App } from '../types.js';
import { loadConfig } from '../config.js';
import { AppError } from './error-handler.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Simple CSRF defence: reject non-safe cross-origin requests.
 * The browser sends Origin on POST/PATCH/DELETE; we compare it against
 * WEB_ORIGIN. Requests with no Origin header (e.g. server-to-server)
 * are allowed but should be combined with token-based auth (Plan 9).
 */
export async function registerCsrf(app: App): Promise<void> {
  const config = loadConfig();
  const expected = new URL(config.WEB_ORIGIN).origin;

  app.addHook('onRequest', async (req) => {
    if (SAFE_METHODS.has(req.method)) return;
    const origin = req.headers.origin;
    if (!origin) return; // no Origin header (e.g. native clients) — allow
    if (origin !== expected) {
      throw new AppError(403, 'CSRF_FORBIDDEN', 'Cross-origin request rejected');
    }
  });
}
