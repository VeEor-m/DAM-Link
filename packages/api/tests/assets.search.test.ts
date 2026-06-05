import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3 } from './helpers/s3.js';
import { seedAsset } from './helpers/seed.js';

const COOKIE = 'dam_session_test';

async function setupOwnerAndOrg(
  app: FastifyInstance,
  email: string,
): Promise<{ session: string; orgId: string; ownerId: string }> {
  // 1. Register via API (creates user + session)
  const reg = await app.inject({
    method: 'POST', url: '/api/v1/auth/register',
    payload: { email, password: 'hunter2pass', displayName: email },
  });
  if (reg.statusCode !== 200) throw new Error(`register failed: ${reg.body}`);
  const setCookie = reg.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie.join(',') : (setCookie ?? '');
  const session = raw.match(new RegExp(`${COOKIE}=([^;]+)`))![1]!;
  const ownerId = reg.json().data.user.id;

  // 2. Create the org (caller becomes owner)
  const orgRes = await app.inject({
    method: 'POST', url: '/api/v1/orgs',
    headers: { cookie: `${COOKIE}=${session}` },
    payload: { name: 'Test Org' },
  });
  if (orgRes.statusCode !== 200) throw new Error(`createOrg failed: ${orgRes.body}`);
  const orgId = orgRes.json().data.org.id;

  return { session, orgId, ownerId };
}

describe('asset search', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await closeDb(); await closeS3(); });
  beforeEach(async () => { await truncateAllTables(); });

  it('searches by name (case-insensitive substring)', async () => {
    const { session, orgId, ownerId } = await setupOwnerAndOrg(app, 'owner@e.com');
    await seedAsset(orgId, ownerId, { name: 'cat.png' });
    await seedAsset(orgId, ownerId, { name: 'dog.jpg' });
    await seedAsset(orgId, ownerId, { name: 'CatHero.png' });

    const r1 = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/assets?q=cat`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(r1.json().data.items).toHaveLength(2);

    const r2 = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/assets?q=DOG`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(r2.json().data.items).toHaveLength(1);
  });

  it('searches by uploader', async () => {
    const { session, orgId, ownerId } = await setupOwnerAndOrg(app, 'a@e.com');
    await seedAsset(orgId, ownerId, { name: 'one.png' });
    await seedAsset(orgId, ownerId, { name: 'two.png' });

    const r = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/assets?q=${ownerId.slice(0, 8)}`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(r.json().data.items.length).toBeGreaterThan(0);
  });
});
