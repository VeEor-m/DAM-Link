import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3, flushTestBucket } from './helpers/s3.js';
import { seedAsset } from './helpers/seed.js';
import { s3 as prodS3, BUCKET } from '../src/lib/s3.js';
import { newToken } from '../src/lib/ids.js';
import { createShareLink } from '../src/repositories/share-links.repo.js';

const COOKIE = 'dam_session_test';

async function login(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/api/v1/auth/register',
    payload: { email, password: 'hunter2pass', displayName: email },
  });
  if (res.statusCode !== 200) throw new Error(`register failed: ${res.body}`);
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie.join(',') : (setCookie ?? '');
  return raw.match(new RegExp(`${COOKIE}=([^;]+)`))![1]!;
}

async function getUserId(app: FastifyInstance, session: string): Promise<string> {
  const res = await app.inject({
    method: 'GET', url: '/api/v1/auth/me',
    headers: { cookie: `${COOKIE}=${session}` },
  });
  if (res.statusCode !== 200) throw new Error(`me failed: ${res.body}`);
  return res.json().data.user.id;
}

async function createOrgViaApi(
  app: FastifyInstance,
  session: string,
  name: string,
): Promise<{ orgId: string; userId: string }> {
  const res = await app.inject({
    method: 'POST', url: '/api/v1/orgs',
    headers: { cookie: `${COOKIE}=${session}` },
    payload: { name },
  });
  if (res.statusCode !== 200) throw new Error(`createOrg failed: ${res.statusCode} ${res.body}`);
  const userId = await getUserId(app, session);
  return { orgId: res.json().data.org.id, userId };
}

async function inviteMemberViaApi(
  app: FastifyInstance,
  ownerSession: string,
  orgId: string,
  email: string,
  role: 'editor' | 'viewer',
): Promise<void> {
  const res = await app.inject({
    method: 'POST', url: `/api/v1/orgs/${orgId}/members`,
    headers: { cookie: `${COOKIE}=${ownerSession}` },
    payload: { email, role },
  });
  if (res.statusCode !== 200) throw new Error(`inviteMember failed: ${res.body}`);
}

describe('share links', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await closeDb(); await closeS3(); });
  beforeEach(async () => {
    await truncateAllTables();
    await flushTestBucket();
  });

  it('creates a link, public GET returns asset info, GET download returns a presigned URL', async () => {
    const session = await login(app, 'o@e.com');
    const { orgId, userId } = await createOrgViaApi(app, session, 'Org');

    // Put a real object so the presign can succeed
    const objectKey = 'originals/x/file.png';
    await prodS3.send(new PutObjectCommand({ Bucket: BUCKET, Key: objectKey, Body: Buffer.from('hi'), ContentType: 'image/png' }));

    const assetId = await seedAsset(orgId, userId, { name: 'file.png' });

    const create = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/assets/${assetId}/share-links`,
      headers: { cookie: `${COOKIE}=${session}` },
      payload: {},
    });
    expect(create.statusCode).toBe(200);
    const link = create.json().data;
    expect(link.token.length).toBeGreaterThan(30);
    expect(link.hasPassword).toBe(false);

    // Public info
    const info = await app.inject({
      method: 'GET', url: `/api/v1/share/${link.token}`,
    });
    expect(info.statusCode).toBe(200);
    expect(info.json().data.asset.name).toBe('file.png');
    expect(info.json().data.hasPassword).toBe(false);

    // Download
    const dl = await app.inject({
      method: 'GET', url: `/api/v1/share/${link.token}/download`,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.json().data.downloadUrl).toMatch(/^http/);
  });

  it('revokes a link: subsequent public GET returns 404', async () => {
    const session = await login(app, 'o@e.com');
    const { orgId, userId } = await createOrgViaApi(app, session, 'Org');
    const assetId = await seedAsset(orgId, userId, { name: 'r.png' });

    const create = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/assets/${assetId}/share-links`,
      headers: { cookie: `${COOKIE}=${session}` },
      payload: {},
    });
    expect(create.statusCode).toBe(200);
    const linkId = create.json().data.id;
    const token = create.json().data.token;

    const revoke = await app.inject({
      method: 'DELETE', url: `/api/v1/orgs/${orgId}/share-links/${linkId}`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(revoke.statusCode).toBe(204);

    const after = await app.inject({
      method: 'GET', url: `/api/v1/share/${token}`,
    });
    expect(after.statusCode).toBe(404);
  });

  it('password-protected link: download requires unlock', async () => {
    const session = await login(app, 'o@e.com');
    const { orgId, userId } = await createOrgViaApi(app, session, 'Org');
    const objectKey = 'originals/x/p.png';
    await prodS3.send(new PutObjectCommand({ Bucket: BUCKET, Key: objectKey, Body: Buffer.from('p'), ContentType: 'image/png' }));
    const assetId = await seedAsset(orgId, userId, { name: 'p.png' });

    const create = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/assets/${assetId}/share-links`,
      headers: { cookie: `${COOKIE}=${session}` },
      payload: { password: 's3cret-pass' },
    });
    expect(create.statusCode).toBe(200);
    const token = create.json().data.token;

    const direct = await app.inject({
      method: 'GET', url: `/api/v1/share/${token}/download`,
    });
    expect(direct.statusCode).toBe(401);
    expect(direct.json().error.code).toBe('PASSWORD_REQUIRED');

    const wrong = await app.inject({
      method: 'POST', url: `/api/v1/share/${token}/unlock`,
      payload: { password: 'wrongpass' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe('INVALID_PASSWORD');

    const right = await app.inject({
      method: 'POST', url: `/api/v1/share/${token}/unlock`,
      payload: { password: 's3cret-pass' },
    });
    expect(right.statusCode).toBe(200);
    expect(right.json().data.downloadUrl).toMatch(/^http/);
  });

  it('expired link returns 404 on public access', async () => {
    const session = await login(app, 'o@e.com');
    const { orgId, userId } = await createOrgViaApi(app, session, 'Org');
    const assetId = await seedAsset(orgId, userId, { name: 'e.png' });
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // We need to create with a past expiry; the API doesn't allow that, so insert directly:
    const link = await createShareLink({
      assetId,
      orgId,
      token: newToken(32),
      createdBy: userId,
      expiresAt: yesterday,
    });

    const r = await app.inject({
      method: 'GET', url: `/api/v1/share/${link.token}`,
    });
    expect(r.statusCode).toBe(404);
  });

  it('Viewer cannot create share links', async () => {
    const ownerSession = await login(app, 'o@e.com');
    const viewerSession = await login(app, 'v@e.com');
    const { orgId, userId } = await createOrgViaApi(app, ownerSession, 'Org');
    await inviteMemberViaApi(app, ownerSession, orgId, 'v@e.com', 'viewer');
    const assetId = await seedAsset(orgId, userId, { name: 'x.png' });

    const create = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/assets/${assetId}/share-links`,
      headers: { cookie: `${COOKIE}=${viewerSession}` },
      payload: {},
    });
    expect(create.statusCode).toBe(403);
    expect(create.json().error.code).toBe('INSUFFICIENT_ROLE');
  });
});
