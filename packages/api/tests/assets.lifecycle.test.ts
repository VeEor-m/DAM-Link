import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3 } from './helpers/s3.js';
import { findAssetById } from '../src/repositories/assets.repo.js';

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

async function createOrg(
  app: FastifyInstance,
  session: string,
  name: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/api/v1/orgs',
    headers: { cookie: `${COOKIE}=${session}` },
    payload: { name },
  });
  if (res.statusCode !== 200) throw new Error(`createOrg failed: ${res.body}`);
  return res.json().data.org.id;
}

async function inviteMember(
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

describe('asset lifecycle', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await closeDb(); await closeS3(); });
  beforeEach(async () => { await truncateAllTables(); });

  it('creates, fetches, renames, soft-deletes, restores, and hard-deletes an asset', async () => {
    const ownerSession = await login(app, 'owner@e.com');
    const orgId = await createOrg(app, ownerSession, 'Org');

    const create = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/assets`,
      headers: { cookie: `${COOKIE}=${ownerSession}` },
      payload: {
        name: 'cat.png',
        type: 'image',
        format: 'PNG',
        mimeType: 'image/png',
        size: 12345,
        objectKey: 'originals/x/cat.png',
        tags: ['cute'],
      },
    });
    expect(create.statusCode).toBe(200);
    const id = create.json().data.id;
    expect(create.json().data.status).toBe('pending');

    const get = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/assets/${id}`,
      headers: { cookie: `${COOKIE}=${ownerSession}` },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.name).toBe('cat.png');

    const rename = await app.inject({
      method: 'PATCH', url: `/api/v1/orgs/${orgId}/assets/${id}`,
      headers: { cookie: `${COOKIE}=${ownerSession}` },
      payload: { name: 'kitten.png', favorite: true, tags: ['cute', 'kitten'] },
    });
    expect(rename.statusCode).toBe(200);
    expect(rename.json().data.name).toBe('kitten.png');
    expect(rename.json().data.favorite).toBe(true);
    expect(rename.json().data.tags).toEqual(['cute', 'kitten']);

    const trash = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/assets/${id}/soft-delete`,
      headers: { cookie: `${COOKIE}=${ownerSession}` },
    });
    expect(trash.statusCode).toBe(200);
    expect(trash.json().data.deletedAt).not.toBeNull();

    // List with default filters excludes trashed
    const listExcl = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/assets`,
      headers: { cookie: `${COOKIE}=${ownerSession}` },
    });
    expect(listExcl.json().data.items).toHaveLength(0);

    // List with inTrash=true includes it
    const listTrash = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/assets?inTrash=true`,
      headers: { cookie: `${COOKIE}=${ownerSession}` },
    });
    expect(listTrash.json().data.items).toHaveLength(1);

    const restore = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/assets/${id}/restore`,
      headers: { cookie: `${COOKIE}=${ownerSession}` },
    });
    expect(restore.json().data.deletedAt).toBeNull();

    const hard = await app.inject({
      method: 'DELETE', url: `/api/v1/orgs/${orgId}/assets/${id}`,
      headers: { cookie: `${COOKIE}=${ownerSession}` },
    });
    expect(hard.statusCode).toBe(204);

    expect(await findAssetById(orgId, id)).toBeNull();
  });

  it('refuses asset access across orgs with 403', async () => {
    const ownerA = await login(app, 'a@e.com');
    const ownerB = await login(app, 'b@e.com');
    const orgAId = await createOrg(app, ownerA, 'OrgA');
    const orgBId = await createOrg(app, ownerB, 'OrgB');

    const create = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgAId}/assets`,
      headers: { cookie: `${COOKIE}=${ownerA}` },
      payload: { name: 'x.png', type: 'image', format: 'PNG', mimeType: 'image/png', size: 1, objectKey: 'k' },
    });
    const id = create.json().data.id;

    // b@e.com is not a member of orgA; org-context should 403
    const cross = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgAId}/assets/${id}`,
      headers: { cookie: `${COOKIE}=${ownerB}` },
    });
    expect(cross.statusCode).toBe(403);
    expect(cross.json().error.code).toBe('ORG_FORBIDDEN');

    // orgB owner can still access their own org
    const own = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgBId}`,
      headers: { cookie: `${COOKIE}=${ownerB}` },
    });
    expect(own.statusCode).toBe(200);
  });

  it('Viewer can read but not write', async () => {
    const owner = await login(app, 'owner@e.com');
    const viewer = await login(app, 'viewer@e.com');
    const orgId = await createOrg(app, owner, 'Org');
    await inviteMember(app, owner, orgId, 'viewer@e.com', 'viewer');

    // Owner creates an asset
    const create = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/assets`,
      headers: { cookie: `${COOKIE}=${owner}` },
      payload: { name: 'x.png', type: 'image', format: 'PNG', mimeType: 'image/png', size: 1, objectKey: 'k' },
    });
    const id = create.json().data.id;

    // Viewer can read
    const read = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}/assets/${id}`,
      headers: { cookie: `${COOKIE}=${viewer}` },
    });
    expect(read.statusCode).toBe(200);

    // Viewer cannot update
    const update = await app.inject({
      method: 'PATCH', url: `/api/v1/orgs/${orgId}/assets/${id}`,
      headers: { cookie: `${COOKIE}=${viewer}` },
      payload: { name: 'y.png' },
    });
    expect(update.statusCode).toBe(403);
    expect(update.json().error.code).toBe('INSUFFICIENT_ROLE');

    // Viewer cannot create
    const create2 = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/assets`,
      headers: { cookie: `${COOKIE}=${viewer}` },
      payload: { name: 'z.png', type: 'image', format: 'PNG', mimeType: 'image/png', size: 1, objectKey: 'k2' },
    });
    expect(create2.statusCode).toBe(403);
    expect(create2.json().error.code).toBe('INSUFFICIENT_ROLE');

    // Viewer cannot delete
    const del = await app.inject({
      method: 'DELETE', url: `/api/v1/orgs/${orgId}/assets/${id}`,
      headers: { cookie: `${COOKIE}=${viewer}` },
    });
    expect(del.statusCode).toBe(403);
  });
});
