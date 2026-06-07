import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3, getTestS3Client } from './helpers/s3.js';
import { BUCKET } from '../src/lib/s3.js';
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

describe('GET /api/v1/orgs/:orgId/assets/:id/download-url', () => {
  let app: FastifyInstance;
  const s3 = getTestS3Client();

  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await closeDb(); await closeS3(); });
  beforeEach(async () => { await truncateAllTables(); });

  it('returns a presigned download URL for an existing asset (Viewer+)', async () => {
    const owner = await setupOwnerAndOrg(app, 'dl-owner@e.com');
    // Use a known id so we can predict the objectKey the seedAsset helper sets.
    const knownId = '44444444-4444-4444-8444-444444444444';
    const assetId = await seedAsset(owner.orgId, owner.ownerId, { id: knownId, name: 'dl-test.png' });
    const expectedKey = `originals/${owner.orgId}/${knownId}`;

    // Put a real object so the presign is meaningful.
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: expectedKey,
      Body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    }));

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${owner.orgId}/assets/${assetId}/download-url`,
      headers: { cookie: `${COOKIE}=${owner.session}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.downloadUrl).toMatch(/^https?:\/\//);
    expect(body.data.downloadUrl).toContain(encodeURIComponent(expectedKey).replace(/%2F/g, '/'));
  });

  it('returns 404 for a missing asset id', async () => {
    const owner = await setupOwnerAndOrg(app, 'dl-missing@e.com');
    const fakeId = '00000000-0000-4000-8000-000000000000';
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${owner.orgId}/assets/${fakeId}/download-url`,
      headers: { cookie: `${COOKIE}=${owner.session}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('ASSET_NOT_FOUND');
  });

  it('returns 401 without a session', async () => {
    const owner = await setupOwnerAndOrg(app, 'dl-nosession@e.com');
    const assetId = await seedAsset(owner.orgId, owner.ownerId, { name: 'noauth.png' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${owner.orgId}/assets/${assetId}/download-url`,
    });
    expect(res.statusCode).toBe(401);
  });
});
