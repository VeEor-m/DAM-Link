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

describe('sidebar counts', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await closeDb(); await closeS3(); });
  beforeEach(async () => { await truncateAllTables(); });

  it('aggregates byType, byTag, favorites, and trash', async () => {
    const { session, orgId, ownerId } = await setupOwnerAndOrg(app, 'o@e.com');
    await seedAsset(orgId, ownerId, { name: 'a.png', type: 'image' });
    await seedAsset(orgId, ownerId, { name: 'b.png', type: 'image', favorite: true });
    await seedAsset(orgId, ownerId, { name: 'c.mp4', type: 'video' });
    await seedAsset(orgId, ownerId, { name: 'd.pdf', type: 'document', deletedAt: new Date() });
    await seedAsset(orgId, ownerId, { name: 'e.png', type: 'image', tags: ['design', 'hero'] });
    await seedAsset(orgId, ownerId, { name: 'f.png', type: 'image', tags: ['design'] });

    const r = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/assets/sidebar-counts`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(r.statusCode).toBe(200);
    const c = r.json().data;
    expect(c.byType).toEqual({ image: 4, video: 1, document: 0, audio: 0 });
    expect(c.favorites).toBe(1);
    expect(c.trash).toBe(1);
    const designCount = c.byTag.find((x: { tag: string }) => x.tag === 'design');
    expect(designCount?.count).toBe(2);
  });
});
