import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { App } from '../src/types.js';
import { buildApp } from './helpers/build-app.js';
import { closeDb } from './helpers/db.js';
import { closeS3 } from './helpers/s3.js';

describe('GET /api/v1/ping', () => {
  let app: App;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
    await closeS3();
  });

  it('returns pong and an ISO timestamp', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/ping' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pong).toBe(true);
    expect(() => new Date(body.now).toISOString()).not.toThrow();
  });
});
