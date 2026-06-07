import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { App } from '../src/types.js';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { flushTestBucket, closeS3 } from './helpers/s3.js';

describe('GET /healthz — pool saturation signal', () => {
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

  it('reports inUse > 0 when concurrent queries are in flight', async () => {
    // Kick off a long-running query (pg_sleep) and a /healthz call in parallel.
    // The inUse counter should be > 0 for the duration of the pg_sleep.
    // We use the raw Drizzle client so we hit observeSql.
    const { getDb } = await import('../src/db/client.js');
    const db = getDb();
    const { observeSql } = await import('../src/db/observe.js');

    const slowQuery = observeSql('test.health-pool', async () => {
      await db.execute('SELECT pg_sleep(1.0)');
    });

    // Give observeSql a tick to increment inUse. Polling is more
    // robust than a fixed delay: on a busy CI box the query might
    // not be in-flight on the very first setTimeout(0) tick.
    for (let i = 0; i < 50; i++) {
      const { getPoolStats } = await import('../src/db/observe.js');
      if (getPoolStats().inUse >= 1) break;
      await new Promise((r) => setTimeout(r, 20));
    }

    const health = await app.inject({ method: 'GET', url: '/healthz' });
    expect(health.statusCode).toBe(200);
    const body = health.json();
    expect(body.pool.inUse).toBeGreaterThanOrEqual(1);

    await slowQuery;
    const healthAfter = await app.inject({ method: 'GET', url: '/healthz' });
    expect(healthAfter.json().pool.inUse).toBe(0);
  });
});
