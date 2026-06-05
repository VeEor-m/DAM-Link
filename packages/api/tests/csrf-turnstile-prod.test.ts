import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3, flushTestBucket } from './helpers/s3.js';

describe('CSRF and Turnstile production rules', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
    await closeDb();
    await closeS3();
  });
  beforeEach(async () => {
    await truncateAllTables();
    await flushTestBucket();
  });

  it('rejects a POST with a cross-origin Origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
      },
      payload: { email: 'a@b.com', password: 'longenough', displayName: 'A' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_FORBIDDEN');
  });

  it('accepts a POST with the configured WEB_ORIGIN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:5173',
      },
      payload: { email: 'ok@b.com', password: 'longenough', displayName: 'OK' },
    });
    // 200 (registered) or 400 (Turnstile missing in test) — both are
    // better than 403, which is the CSRF rejection we're testing for.
    expect(res.statusCode).not.toBe(403);
  });

  it('accepts a POST with no Origin header (server-to-server)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'noorigin@b.com', password: 'longenough', displayName: 'NoO' },
    });
    expect(res.statusCode).not.toBe(403);
  });

  it('Turnstile is enforced when TURNSTILE_SECRET_KEY is set', async () => {
    // Spec deviation: the spec test name says "when TURNSTILE_SECRET_KEY is set"
    // but the body did not set it, so verifyTurnstile would short-circuit to true
    // (dev-mode skip). Set the env before the re-import so the test exercises
    // the actual Cloudflare siteverify path.
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    vi.resetModules();
    // Re-import config to pick up a modified env, then rebuild the helper.
    const { verifyTurnstile } = await import('../src/lib/turnstile.js');
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
        status: 200,
      }),
    ) as unknown as typeof fetch;
    try {
      const ok = await verifyTurnstile('clearly-bogus-token', '127.0.0.1');
      expect(ok).toBe(false);
    } finally {
      globalThis.fetch = origFetch;
      delete process.env.TURNSTILE_SECRET_KEY;
    }
  });
});
