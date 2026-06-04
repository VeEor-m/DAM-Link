import { loadConfig } from '../config.js';
import { logger } from './logger.js';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Verifies a Turnstile token with Cloudflare's siteverify endpoint.
 * Returns false on any error (network, parse, missing key) — never throws.
 *
 * If TURNSTILE_SECRET_KEY is not configured (dev / test), verification is
 * skipped and the function returns true. This lets developers run locally
 * without setting up a Turnstile widget.
 */
export async function verifyTurnstile(
  token: string,
  remoteIp: string | null,
): Promise<boolean> {
  const config = loadConfig();
  if (!config.TURNSTILE_SECRET_KEY) {
    return true;
  }

  try {
    const body = new URLSearchParams();
    body.set('secret', config.TURNSTILE_SECRET_KEY);
    body.set('response', token);
    if (remoteIp) body.set('remoteip', remoteIp);

    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, 'turnstile: non-200 response');
      return false;
    }

    const json = (await res.json()) as TurnstileResponse;
    if (!json.success) {
      logger.warn({ errors: json['error-codes'] }, 'turnstile: rejected');
    }
    return json.success;
  } catch (err) {
    logger.error({ err }, 'turnstile: verification threw');
    return false;
  }
}
