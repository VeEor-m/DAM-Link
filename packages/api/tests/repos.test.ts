import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3 } from './helpers/s3.js';
import { buildApp } from './helpers/build-app.js';
import { createUser } from '../src/repositories/users.repo.js';
import {
  findOrgById,
  findOrgBySlug,
  createOrg,
  findAvailableSlug,
  slugExists,
} from '../src/repositories/orgs.repo.js';
import {
  createMembership,
  findMembership,
  listMembershipsByOrg,
  isLastOwner,
  updateMembershipRole,
} from '../src/repositories/memberships.repo.js';

describe('orgs + memberships repos', () => {
  beforeAll(async () => {
    await buildApp();
  });
  afterAll(async () => {
    await closeDb();
    await closeS3();
  });
  beforeEach(async () => {
    await truncateAllTables();
  });

  it('finds an available slug with no collision', async () => {
    expect(await findAvailableSlug('foo')).toBe('foo');
  });

  it('finds an available slug with collisions', async () => {
    const owner = await createUser({ email: 'o@e.com', passwordHash: 'h', displayName: 'O' });
    await createOrg({ name: 'Foo', slug: 'foo', createdAt: new Date() });
    void owner;
    expect(await slugExists('foo')).toBe(true);
    expect(await findAvailableSlug('foo')).toBe('foo-2');
  });

  it('finds an available slug with multiple collisions', async () => {
    await createOrg({ name: 'Foo', slug: 'foo', createdAt: new Date() });
    await createOrg({ name: 'Foo 2', slug: 'foo-2', createdAt: new Date() });
    expect(await findAvailableSlug('foo')).toBe('foo-3');
  });

  it('creates and finds a membership', async () => {
    const user = await createUser({ email: 'a@e.com', passwordHash: 'h', displayName: 'A' });
    const org = await createOrg({ name: 'Org', slug: 'org', createdAt: new Date() });
    const m = await createMembership({ userId: user.id, orgId: org.id, role: 'owner' });
    expect(m.userId).toBe(user.id);
    const found = await findMembership(user.id, org.id);
    expect(found?.role).toBe('owner');
  });

  it('lists memberships with joined user fields', async () => {
    const u1 = await createUser({ email: 'a@e.com', passwordHash: 'h', displayName: 'Alice' });
    const u2 = await createUser({ email: 'b@e.com', passwordHash: 'h', displayName: 'Bob' });
    const org = await createOrg({ name: 'Org', slug: 'org', createdAt: new Date() });
    await createMembership({ userId: u1.id, orgId: org.id, role: 'owner' });
    await createMembership({ userId: u2.id, orgId: org.id, role: 'viewer' });
    const list = await listMembershipsByOrg(org.id);
    expect(list).toHaveLength(2);
    const bob = list.find((m) => m.user.email === 'b@e.com');
    expect(bob?.role).toBe('viewer');
    expect(bob?.user.displayName).toBe('Bob');
  });

  it('detects the last owner', async () => {
    const u1 = await createUser({ email: 'a@e.com', passwordHash: 'h', displayName: 'A' });
    const u2 = await createUser({ email: 'b@e.com', passwordHash: 'h', displayName: 'B' });
    const org = await createOrg({ name: 'Org', slug: 'org', createdAt: new Date() });
    await createMembership({ userId: u1.id, orgId: org.id, role: 'owner' });
    await createMembership({ userId: u2.id, orgId: org.id, role: 'owner' });
    expect(await isLastOwner(org.id, u1.id)).toBe(false);
    await updateMembershipRole(u1.id, org.id, 'editor');
    void (await findOrgById(org.id));
    void (await findOrgBySlug(org.slug));
    expect(await isLastOwner(org.id, u1.id)).toBe(false);
  });
});
