import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyTurnstile } from '../src/lib/turnstile.js';
import { _resetConfigForTests } from '../src/config.js';

describe('verifyTurnstile', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    _resetConfigForTests();
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.TURNSTILE_SECRET_KEY;
    _resetConfigForTests();
  });

  it('returns true when Turnstile responds success=true', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    ) as unknown as typeof fetch;
    expect(await verifyTurnstile('token', '127.0.0.1')).toBe(true);
  });

  it('returns false when Turnstile responds success=false', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input'] }), {
        status: 200,
      }),
    ) as unknown as typeof fetch;
    expect(await verifyTurnstile('token', '127.0.0.1')).toBe(false);
  });

  it('returns false and logs when fetch throws', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile('token', '127.0.0.1')).toBe(false);
  });

  it('skips verification when TURNSTILE_SECRET_KEY is unset (dev mode)', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    expect(await verifyTurnstile('token', '127.0.0.1')).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
