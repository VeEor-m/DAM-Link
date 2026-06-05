import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { App } from '../src/types.js';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3 } from './helpers/s3.js';

const COOKIE = 'dam_session_test';

function extractSessionCookie(setCookieHeader: string | string[] | undefined): string | null {
  if (!setCookieHeader) return null;
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader.join(',') : setCookieHeader;
  const match = raw.match(new RegExp(`${COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}

describe('auth flow', () => {
  let app: App;

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
  });

  it('registers a new user, sets a session cookie, and /me returns them', async () => {
    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'alice@example.com',
        password: 'hunter2pass',
        displayName: 'Alice',
      },
    });
    expect(registerRes.statusCode).toBe(200);
    const registerBody = registerRes.json();
    expect(registerBody.data.user.email).toBe('alice@example.com');

    const sessionId = extractSessionCookie(registerRes.headers['set-cookie']);
    expect(sessionId).toBeTruthy();

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: `${COOKIE}=${sessionId}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().data.user.email).toBe('alice@example.com');
  });

  it('rejects registration with an invalid email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'not-an-email', password: 'hunter2pass', displayName: 'Alice' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects registration with a weak password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'a@b.com', password: 'short', displayName: 'A' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('rejects duplicate email with 409', async () => {
    const payload = { email: 'dup@example.com', password: 'hunter2pass', displayName: 'A' };
    const first = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('EMAIL_IN_USE');
  });

  it('logs in with correct credentials', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'bob@example.com', password: 'hunter2pass', displayName: 'Bob' },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'bob@example.com', password: 'hunter2pass' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().data.user.email).toBe('bob@example.com');
  });

  it('rejects login with wrong password', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'bob@example.com', password: 'hunter2pass', displayName: 'Bob' },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'bob@example.com', password: 'wrong-password' },
    });
    expect(login.statusCode).toBe(401);
    expect(login.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('logout invalidates the session', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'c@example.com', password: 'hunter2pass', displayName: 'C' },
    });
    const sessionId = extractSessionCookie(reg.headers['set-cookie'])!;

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: `${COOKIE}=${sessionId}` },
    });
    expect(logout.statusCode).toBe(204);

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: `${COOKIE}=${sessionId}` },
    });
    expect(me.statusCode).toBe(401);
  });

  it('rejects /me without a session cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects /me with an invalid session cookie', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: `${COOKIE}=garbage` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects cross-origin POSTs to auth (CSRF)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: 'http://evil.example.com' },
      payload: { email: 'a@b.com', password: 'hunter2pass', displayName: 'A' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_FORBIDDEN');
  });
});
