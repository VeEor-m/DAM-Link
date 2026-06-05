import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3, flushTestBucket } from './helpers/s3.js';

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

async function createOrgViaApi(app: FastifyInstance, session: string, name: string): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/api/v1/orgs',
    headers: { cookie: `${COOKIE}=${session}` },
    payload: { name },
  });
  if (res.statusCode !== 200) throw new Error(`createOrg failed: ${res.body}`);
  return res.json().data.org.id;
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

async function directPut(url: string, body: Buffer, contentType: string, contentLength: number): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
    headers: { 'content-type': contentType, 'content-length': String(contentLength) },
  });
  if (!res.ok) {
    throw new Error(`directPut failed: ${res.status} ${await res.text()}`);
  }
}

describe('upload flow', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await closeDb(); await closeS3(); });
  beforeEach(async () => {
    await truncateAllTables();
    await flushTestBucket();
  });

  // Test 1: Happy path — initiate, browser PUT to S3, finalize transitions to ready
  it('initiates an upload, the browser PUTs to S3, finalize transitions to ready', async () => {
    const session = await login(app, 'o@e.com');
    const orgId = await createOrgViaApi(app, session, 'Org');

    // 1. Initiate
    const init = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/uploads`,
      headers: { cookie: `${COOKIE}=${session}` },
      payload: {
        filename: 'cat.png',
        mimeType: 'image/png',
        size: 11,
        type: 'image',
        format: 'PNG',
      },
    });
    expect(init.statusCode).toBe(200);
    const { assetId, uploadUrl, objectKey } = init.json().data;
    expect(assetId).toBeTruthy();
    expect(uploadUrl).toMatch(/^http/);
    expect(objectKey).toMatch(new RegExp(`^originals/${orgId}/${assetId}/cat\\.png$`));

    // 2. PUT to S3
    const body = Buffer.from('hello world');
    await directPut(uploadUrl, body, 'image/png', body.length);

    // 3. Finalize
    const fin = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/assets/${assetId}/finalize`,
      headers: { cookie: `${COOKIE}=${session}` },
      payload: {},
    });
    expect(fin.statusCode).toBe(200);
    expect(fin.json().data.status).toBe('ready');

    // 4. The asset is fetchable and in 'ready'
    const get = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/assets/${assetId}`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(get.json().data.status).toBe('ready');
  });

  // Test 2: finalize without an S3 object returns 409 UPLOAD_NOT_FOUND
  it('finalize without an S3 object returns 409 UPLOAD_NOT_FOUND', async () => {
    const session = await login(app, 'o@e.com');
    const orgId = await createOrgViaApi(app, session, 'Org');

    // Create a draft (pending) asset via the assets.create endpoint, with a unique object key
    // — that simulates a user who started an upload but never PUT the file to S3.
    const create = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/assets`,
      headers: { cookie: `${COOKIE}=${session}` },
      payload: {
        name: 'no-upload.png',
        type: 'image',
        format: 'PNG',
        mimeType: 'image/png',
        size: 100,
        objectKey: `originals/${orgId}/no-such-key/no-upload.png`,
        tags: [],
      },
    });
    expect(create.statusCode).toBe(200);
    const id = create.json().data.id;
    expect(create.json().data.status).toBe('pending');

    const fin = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/assets/${id}/finalize`,
      headers: { cookie: `${COOKIE}=${session}` },
      payload: {},
    });
    expect(fin.statusCode).toBe(409);
    expect(fin.json().error.code).toBe('UPLOAD_NOT_FOUND');
  });

  // Test 3: refuses mime types outside the allow-list with 422
  it('refuses mime types outside the allow-list with 422', async () => {
    const session = await login(app, 'o@e.com');
    const orgId = await createOrgViaApi(app, session, 'Org');

    const init = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/uploads`,
      headers: { cookie: `${COOKIE}=${session}` },
      payload: {
        filename: 'evil.exe',
        mimeType: 'application/x-msdownload',
        size: 100,
        type: 'document',
        format: 'EXE',
      },
    });
    expect(init.statusCode).toBe(422);
  });

  // Test 4: refuses files larger than the 5GB cap with 422
  it('refuses files larger than the 5GB cap with 422', async () => {
    const session = await login(app, 'o@e.com');
    const orgId = await createOrgViaApi(app, session, 'Org');

    const init = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/uploads`,
      headers: { cookie: `${COOKIE}=${session}` },
      payload: {
        filename: 'big.bin',
        mimeType: 'application/zip',
        size: 6 * 1024 * 1024 * 1024,
        type: 'document',
        format: 'ZIP',
      },
    });
    expect(init.statusCode).toBe(422);
  });

  // Test 5: Viewer cannot initiate uploads (403)
  it('Viewer cannot initiate uploads (403)', async () => {
    const ownerSession = await login(app, 'o@e.com');
    const viewerSession = await login(app, 'v@e.com');
    const orgId = await createOrgViaApi(app, ownerSession, 'Org');
    await inviteMemberViaApi(app, ownerSession, orgId, 'v@e.com', 'viewer');

    const init = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/uploads`,
      headers: { cookie: `${COOKIE}=${viewerSession}` },
      payload: { filename: 'a.png', mimeType: 'image/png', size: 1, type: 'image', format: 'PNG' },
    });
    expect(init.statusCode).toBe(403);
    expect(init.json().error.code).toBe('INSUFFICIENT_ROLE');
  });
});
