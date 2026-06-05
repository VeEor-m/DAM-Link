import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3 } from './helpers/s3.js';

const COOKIE = 'dam_session_test';

async function registerAndLogin(
  app: FastifyInstance,
  email: string,
  password = 'hunter2pass',
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password, displayName: email.split('@')[0]! },
  });
  expect(res.statusCode).toBe(200);
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie.join(',') : (setCookie ?? '');
  const match = raw.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!match) throw new Error('no session cookie');
  return match[1]!;
}

describe('orgs routes', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await closeDb(); await closeS3(); });
  beforeEach(async () => { await truncateAllTables(); });

  it('creates an org, lists it, and the caller is Owner', async () => {
    const session = await registerAndLogin(app, 'alice@example.com');

    const create = await app.inject({
      method: 'POST', url: '/api/v1/orgs',
      headers: { cookie: `${COOKIE}=${session}` },
      payload: { name: 'My Team' },
    });
    expect(create.statusCode).toBe(200);
    const created = create.json().data;
    expect(created.org.name).toBe('My Team');
    expect(created.org.slug).toBe('my-team');
    expect(created.role).toBe('owner');

    const list = await app.inject({
      method: 'GET', url: '/api/v1/orgs',
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(1);

    const detail = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${created.org.id}`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.role).toBe('owner');
    expect(detail.json().data.memberCount).toBe(1);
  });

  it('refuses /me to a non-member with 403', async () => {
    const alice = await registerAndLogin(app, 'alice@example.com');
    const bob = await registerAndLogin(app, 'bob@example.com');

    const create = await app.inject({
      method: 'POST', url: '/api/v1/orgs',
      headers: { cookie: `${COOKIE}=${alice}` },
      payload: { name: 'Alice Team' },
    });
    const orgId = create.json().data.org.id;

    const res = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgId}`,
      headers: { cookie: `${COOKIE}=${bob}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ORG_FORBIDDEN');
  });

  it('invites an existing user as Editor; invitee sees the org on /me', async () => {
    const alice = await registerAndLogin(app, 'alice@example.com');
    const bob = await registerAndLogin(app, 'bob@example.com');

    const create = await app.inject({
      method: 'POST', url: '/api/v1/orgs',
      headers: { cookie: `${COOKIE}=${alice}` },
      payload: { name: 'Alice Team' },
    });
    const orgId = create.json().data.org.id;

    const invite = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/members`,
      headers: { cookie: `${COOKIE}=${alice}` },
      payload: { email: 'bob@example.com', role: 'editor' },
    });
    expect(invite.statusCode).toBe(200);
    expect(invite.json().data.role).toBe('editor');

    const bobMe = await app.inject({
      method: 'GET', url: '/api/v1/auth/me',
      headers: { cookie: `${COOKIE}=${bob}` },
    });
    expect(bobMe.json().data.orgs).toHaveLength(1);
    expect(bobMe.json().data.orgs[0].role).toBe('editor');
  });

  it('rejects invite for an unregistered email with 422', async () => {
    const alice = await registerAndLogin(app, 'alice@example.com');
    const create = await app.inject({
      method: 'POST', url: '/api/v1/orgs',
      headers: { cookie: `${COOKIE}=${alice}` },
      payload: { name: 'Alice Team' },
    });
    const orgId = create.json().data.org.id;

    const invite = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/members`,
      headers: { cookie: `${COOKIE}=${alice}` },
      payload: { email: 'nobody@example.com', role: 'editor' },
    });
    expect(invite.statusCode).toBe(422);
    expect(invite.json().error.code).toBe('USER_NOT_FOUND');
  });

  it('refuses the last owner from deleting the org', async () => {
    const alice = await registerAndLogin(app, 'alice@example.com');
    const create = await app.inject({
      method: 'POST', url: '/api/v1/orgs',
      headers: { cookie: `${COOKIE}=${alice}` },
      payload: { name: 'Solo' },
    });
    const orgId = create.json().data.org.id;

    const del = await app.inject({
      method: 'DELETE', url: `/api/v1/orgs/${orgId}`,
      headers: { cookie: `${COOKIE}=${alice}` },
    });
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe('LAST_OWNER');
  });

  it('handles slug collisions when creating orgs with the same name', async () => {
    const alice = await registerAndLogin(app, 'alice@example.com');
    const a = await app.inject({
      method: 'POST', url: '/api/v1/orgs',
      headers: { cookie: `${COOKIE}=${alice}` },
      payload: { name: 'Same' },
    });
    const b = await app.inject({
      method: 'POST', url: '/api/v1/orgs',
      headers: { cookie: `${COOKIE}=${alice}` },
      payload: { name: 'Same' },
    });
    expect(a.json().data.org.slug).toBe('same');
    expect(b.json().data.org.slug).toBe('same-2');
  });
});
