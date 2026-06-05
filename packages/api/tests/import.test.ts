import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import FormData from 'form-data';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3, flushTestBucket } from './helpers/s3.js';

const COOKIE = 'dam_session_test';

// API-based test fixture helpers (seedOrgWith is known to create a phantom
// user that is not connected to the API-registered session — see Plan 7
// review notes).
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

async function makeThumbPng(): Promise<Buffer> {
  return sharp({
    create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 255, b: 0 } },
  }).png().toBuffer();
}

describe('import endpoint', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await closeDb(); await closeS3(); });
  beforeEach(async () => {
    await truncateAllTables();
    await flushTestBucket();
  });

  it('imports a manifest with two assets and their thumbnails', async () => {
    const session = await login(app, 'o@e.com');
    const { orgId } = await createOrgViaApi(app, session, 'Org');

    const thumbA = await makeThumbPng();
    const thumbB = await makeThumbPng();

    const manifest = {
      schemaVersion: 1 as const,
      source: 'dam-link-localstorage' as const,
      exportedAt: new Date().toISOString(),
      assets: [
        {
          clientId: 'local-1',
          name: 'a.png',
          type: 'image' as const,
          format: 'PNG',
          tags: ['design'],
          favorite: true,
          thumbnailFilename: 'thumb-a.png',
        },
        {
          clientId: 'local-2',
          name: 'b.png',
          type: 'image' as const,
          format: 'PNG',
          tags: [],
          favorite: false,
          thumbnailFilename: 'thumb-b.png',
        },
      ],
    };

    const form = new FormData();
    // Note: do NOT set `contentType: 'application/json'` on the manifest field.
    // @fastify/multipart 9.x auto-parses JSON content-type fields, which
    // would turn the manifest into a JS object before our handler reads it.
    form.append('manifest', JSON.stringify(manifest));
    form.append('thumb_thumb-a.png', thumbA, { filename: 'thumb-a.png', contentType: 'image/png' });
    form.append('thumb_thumb-b.png', thumbB, { filename: 'thumb-b.png', contentType: 'image/png' });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/import`,
      headers: { ...form.getHeaders(), cookie: `${COOKIE}=${session}` },
      payload: form.getBuffer(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.imported).toHaveLength(2);
    expect(body.skipped).toHaveLength(0);

    // Both assets are now listable
    const list = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/assets`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(list.statusCode).toBe(200);
    const items = list.json().data.items;
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.thumbnailUrl).toBeTruthy();
    }
  });

  it('skips assets whose thumbnail file is missing', async () => {
    const session = await login(app, 'o@e.com');
    const { orgId } = await createOrgViaApi(app, session, 'Org');

    const manifest = {
      schemaVersion: 1 as const,
      source: 'dam-link-localstorage' as const,
      exportedAt: new Date().toISOString(),
      assets: [
        {
          clientId: 'local-1',
          name: 'a.png',
          type: 'image' as const,
          format: 'PNG',
          tags: [],
          favorite: false,
          thumbnailFilename: 'thumb-a.png',
        },
      ],
    };
    const form = new FormData();
    // See comment in test 1: do not set contentType on the manifest field.
    form.append('manifest', JSON.stringify(manifest));
    // no thumbnail file

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/import`,
      headers: { ...form.getHeaders(), cookie: `${COOKIE}=${session}` },
      payload: form.getBuffer(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.imported).toHaveLength(0);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0].clientId).toBe('local-1');
  });

  it('Viewer cannot import (403)', async () => {
    const ownerSession = await login(app, 'o@e.com');
    const viewerSession = await login(app, 'v@e.com');
    const { orgId } = await createOrgViaApi(app, ownerSession, 'Org');
    await inviteMemberViaApi(app, ownerSession, orgId, 'v@e.com', 'viewer');

    const manifest = {
      schemaVersion: 1 as const,
      source: 'dam-link-localstorage' as const,
      exportedAt: new Date().toISOString(),
      assets: [
        {
          clientId: 'local-1',
          name: 'a.png',
          type: 'image' as const,
          format: 'PNG',
          tags: [],
          favorite: false,
        },
      ],
    };
    const form = new FormData();
    // See comment in test 1: do not set contentType on the manifest field.
    form.append('manifest', JSON.stringify(manifest));
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/import`,
      headers: { ...form.getHeaders(), cookie: `${COOKIE}=${viewerSession}` },
      payload: form.getBuffer(),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('INSUFFICIENT_ROLE');
  });
});
