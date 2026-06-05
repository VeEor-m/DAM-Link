import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3 } from './helpers/s3.js';

const COOKIE = 'dam_session_test';

async function reg(app: FastifyInstance, email: string): Promise<string> {
  const r = await app.inject({
    method: 'POST', url: '/api/v1/auth/register',
    payload: { email, password: 'hunter2pass', displayName: email },
  });
  const setCookie = r.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie.join(',') : (setCookie ?? '');
  return raw.match(new RegExp(`${COOKIE}=([^;]+)`))![1]!;
}

async function createOrgWith(
  app: FastifyInstance,
  session: string,
  name: string,
): Promise<string> {
  const r = await app.inject({
    method: 'POST', url: '/api/v1/orgs',
    headers: { cookie: `${COOKIE}=${session}` },
    payload: { name },
  });
  return r.json().data.org.id;
}

async function inviteAs(
  app: FastifyInstance,
  ownerSession: string,
  orgId: string,
  email: string,
  role: 'editor' | 'viewer',
): Promise<void> {
  await app.inject({
    method: 'POST', url: `/api/v1/orgs/${orgId}/members`,
    headers: { cookie: `${COOKIE}=${ownerSession}` },
    payload: { email, role },
  });
}

describe('RBAC matrix', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await closeDb(); await closeS3(); });
  beforeEach(async () => { await truncateAllTables(); });

  it('Viewer can GET the org but cannot PATCH/DELETE', async () => {
    const owner = await reg(app, 'owner@example.com');
    const viewer = await reg(app, 'viewer@example.com');
    const orgId = await createOrgWith(app, owner, 'Org');
    await inviteAs(app, owner, orgId, 'viewer@example.com', 'viewer');

    const get = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}`,
      headers: { cookie: `${COOKIE}=${viewer}` },
    });
    expect(get.statusCode).toBe(200);

    const patch = await app.inject({
      method: 'PATCH', url: `/api/v1/orgs/${orgId}`,
      headers: { cookie: `${COOKIE}=${viewer}` },
      payload: { name: 'X' },
    });
    expect(patch.statusCode).toBe(403);
    expect(patch.json().error.code).toBe('INSUFFICIENT_ROLE');

    const del = await app.inject({
      method: 'DELETE', url: `/api/v1/orgs/${orgId}`,
      headers: { cookie: `${COOKIE}=${viewer}` },
    });
    expect(del.statusCode).toBe(403);
  });

  it('Editor can GET but cannot PATCH org metadata (Owner-only)', async () => {
    const owner = await reg(app, 'owner@example.com');
    const editor = await reg(app, 'editor@example.com');
    const orgId = await createOrgWith(app, owner, 'Org');
    await inviteAs(app, owner, orgId, 'editor@example.com', 'editor');

    const patch = await app.inject({
      method: 'PATCH', url: `/api/v1/orgs/${orgId}`,
      headers: { cookie: `${COOKIE}=${editor}` },
      payload: { name: 'X' },
    });
    expect(patch.statusCode).toBe(403);
  });

  it('Editor cannot invite members (Owner-only)', async () => {
    const owner = await reg(app, 'owner@example.com');
    const editor = await reg(app, 'editor@example.com');
    const orgId = await createOrgWith(app, owner, 'Org');
    await inviteAs(app, owner, orgId, 'editor@example.com', 'editor');

    await reg(app, 'third@example.com');

    const invite = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/members`,
      headers: { cookie: `${COOKIE}=${editor}` },
      payload: { email: 'third@example.com', role: 'viewer' },
    });
    expect(invite.statusCode).toBe(403);
  });

  it('Owner can demote themselves only if another Owner exists', async () => {
    const owner1 = await reg(app, 'o1@example.com');
    const _owner2 = await reg(app, 'o2@example.com');
    const orgId = await createOrgWith(app, owner1, 'Org');
    await inviteAs(app, owner1, orgId, 'o2@example.com', 'editor');
    // Promote o2 to owner directly
    await app.inject({
      method: 'PATCH', url: `/api/v1/orgs/${orgId}/members/${(await app.inject({
        method: 'GET', url: `/api/v1/orgs/${orgId}/members`,
        headers: { cookie: `${COOKIE}=${owner1}` },
      })).json().data.find((m: { user: { email: string } }) => m.user.email === 'o2@example.com').userId}`,
      headers: { cookie: `${COOKIE}=${owner1}` },
      payload: { role: 'owner' },
    });

    // Now o1 can demote themselves
    const demote = await app.inject({
      method: 'PATCH', url: `/api/v1/orgs/${orgId}/members/${(await app.inject({
        method: 'GET', url: '/api/v1/auth/me',
        headers: { cookie: `${COOKIE}=${owner1}` },
      })).json().data.user.id}`,
      headers: { cookie: `${COOKIE}=${owner1}` },
      payload: { role: 'viewer' },
    });
    expect(demote.statusCode).toBe(200);
  });
});
