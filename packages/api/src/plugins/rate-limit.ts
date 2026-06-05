import type { App } from '../types.js';
import rateLimit from '@fastify/rate-limit';
import { loadConfig } from '../config.js';

const TIER_AUTH = { max: 5, timeWindow: '1 minute' };
const TIER_UPLOAD = { max: 60, timeWindow: '1 minute' };
const TIER_GENERAL = { max: 300, timeWindow: '1 minute' };

/**
 * Default global rate limit + tier overrides.
 * Apply tier overrides per-route via `config.rateLimit`.
 *
 * When RATE_LIMIT_DISABLED=true (e.g. in tests), the plugin is not registered
 * and per-route `config.rateLimit` is ignored. This lets integration tests
 * issue many auth requests in quick succession without hitting the 5/min cap.
 */
export async function registerRateLimit(app: App): Promise<void> {
  const config = loadConfig();
  if (config.RATE_LIMIT_DISABLED) return;

  await app.register(rateLimit, {
    global: true,
    ...TIER_GENERAL,
    keyGenerator: (req) => req.ip,
    addHeadersOnExceeding: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true },
    addHeaders: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'retry-after': true },
  });
}

export const RATE_TIERS = {
  auth: TIER_AUTH,
  upload: TIER_UPLOAD,
  general: TIER_GENERAL,
};
