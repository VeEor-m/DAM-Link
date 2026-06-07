import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { App } from '../src/types.js';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { flushTestBucket, closeS3 } from './helpers/s3.js';

describe('GET /healthz', () => {
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
    await flushTestBucket();
  });

  it('returns 200 with db=ok, s3=ok when services are reachable', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
    expect(body.s3).toBe('ok');
    expect(body.version).toBe('0.0.0');
    expect(typeof body.uptime).toBe('number');
  });

  it('returns 200 and the same shape on subsequent calls (idempotent)', async () => {
    const first = await app.inject({ method: 'GET', url: '/healthz' });
    const second = await app.inject({ method: 'GET', url: '/healthz' });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().status).toBe('ok');
  });

  it('response includes a pool field with max, inUse, waiting (waiting is always 0)', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pool).toBeDefined();
    expect(typeof body.pool.max).toBe('number');
    expect(typeof body.pool.inUse).toBe('number');
    expect(typeof body.pool.waiting).toBe('number');
    expect(body.pool.max).toBeGreaterThan(0);
    expect(body.pool.inUse).toBeGreaterThanOrEqual(0);
    expect(body.pool.waiting).toBe(0); // postgres-js 3.4.5 has no pool events
  });
});

describe('GET /version', () => {
  let app: App;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns version metadata', async () => {
    const res = await app.inject({ method: 'GET', url: '/version' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe('0.0.0');
    expect(body.commit).toBeNull();
    expect(body.buildTime).toBeNull();
  });
});

describe('error envelope', () => {
  let app: App;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the standard error shape on 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/this-does-not-exist' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body).toMatchObject({
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
  });
});
