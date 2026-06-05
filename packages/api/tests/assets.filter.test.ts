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

describe('asset filter', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await closeDb(); await closeS3(); });
  beforeEach(async () => { await truncateAllTables(); });

  it('filters by type', async () => {
    const { session, orgId, ownerId } = await setupOwnerAndOrg(app, 'o@e.com');
    await seedAsset(orgId, ownerId, { name: 'a.png', type: 'image' });
    await seedAsset(orgId, ownerId, { name: 'b.mp4', type: 'video' });
    await seedAsset(orgId, ownerId, { name: 'c.pdf', type: 'document' });

    const r = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/assets?type=image,video`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(r.json().data.items).toHaveLength(2);
  });

  it('filters by sizeBucket', async () => {
    const { session, orgId, ownerId } = await setupOwnerAndOrg(app, 'o@e.com');
    await seedAsset(orgId, ownerId, { name: 'small.png', size: 500_000 });   // small (< 1MB)
    await seedAsset(orgId, ownerId, { name: 'medium.png', size: 5_000_000 }); // medium (1MB-10MB)
    await seedAsset(orgId, ownerId, { name: 'large.png', size: 20_000_000 }); // large (>= 10MB)

    const r = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/assets?sizeBucket=medium`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(r.json().data.items).toHaveLength(1);
    expect(r.json().data.items[0].name).toBe('medium.png');
  });

  it('filters by tag (AND semantics)', async () => {
    const { session, orgId, ownerId } = await setupOwnerAndOrg(app, 'o@e.com');
    await seedAsset(orgId, ownerId, { name: 'a.png', tags: ['design', 'hero'] });
    await seedAsset(orgId, ownerId, { name: 'b.png', tags: ['design'] });
    await seedAsset(orgId, ownerId, { name: 'c.png', tags: ['hero'] });

    const r = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/assets?tag=design,hero`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(r.json().data.items).toHaveLength(1);
  });

  it('smart collection "favorites" returns only favorited assets', async () => {
    const { session, orgId, ownerId } = await setupOwnerAndOrg(app, 'o@e.com');
    await seedAsset(orgId, ownerId, { name: 'a.png', favorite: true });
    await seedAsset(orgId, ownerId, { name: 'b.png' });

    const r = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/assets?smart=favorites`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(r.json().data.items).toHaveLength(1);
  });

  it('smart collection "trash" returns only trashed assets', async () => {
    const { session, orgId, ownerId } = await setupOwnerAndOrg(app, 'o@e.com');
    await seedAsset(orgId, ownerId, { name: 'a.png', deletedAt: new Date() });
    await seedAsset(orgId, ownerId, { name: 'b.png' });

    const r = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/assets?smart=trash`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(r.json().data.items).toHaveLength(1);
  });

  it('cursor pagination walks through all items', async () => {
    const { session, orgId, ownerId } = await setupOwnerAndOrg(app, 'o@e.com');
    for (let i = 0; i < 7; i += 1) {
      await seedAsset(orgId, ownerId, { name: `a${i}.png` });
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const url = `/api/v1/orgs/${orgId}/assets?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const r = await app.inject({
        method: 'GET', url,
        headers: { cookie: `${COOKIE}=${session}` },
      });
      const body = r.json().data;
      for (const it of body.items) seen.push(it.name);
      cursor = body.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(7);
  });
});
