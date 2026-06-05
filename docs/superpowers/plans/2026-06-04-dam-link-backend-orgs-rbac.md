# DAM-Link Backend — Orgs + RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce organizations as the tenancy boundary. Users create orgs, get assigned the Owner role, and can invite other existing users as Editor or Viewer. Every org-scoped route is protected by an `orgContext` plugin that resolves `:orgId` to `{ org, role }` or 403s. End state: a logged-in user can create an org, list their orgs, invite a member, and call any `/api/v1/orgs/:orgId/...` route — RBAC is enforced everywhere.

**Architecture:** Three new tables exist from Plan 1 (`orgs`, `memberships`). This plan adds the service layer, the routes, the org-context Fastify plugin (the single chokepoint for tenant isolation), and tests. Slugs are generated from the org name and de-duplicated. Invite-by-email only works for already-registered users (proper email-invite flow deferred to v2).

**Tech Stack:** Existing. Drizzle for queries, Zod for schemas, Fastify plugins for context.

---

## Plan 3 of 9 — Orgs + RBAC

- `orgs` + `memberships` repositories
- `orgs` + `members` services
- Org-context plugin: resolves `:orgId` to `{ org, role }` and 403s
- Slug generation with collision handling
- Routes: org CRUD + members CRUD
- `/auth/me` now returns the user's orgs with roles
- `requireRole(min)` preHandler factory
- Integration tests for the full RBAC matrix

**Deferred to later plans:**
- Email-based invite flow (in v2, requires an `invitations` table + email service)
- Per-org quotas (deferred to v2 per MVP scope)
- Audit log (deferred to v2)
- Org deletion cascade (Plan 1 already has `onDelete: cascade`; behavior is correct)

---

## File structure (this plan adds/modifies)

```
packages/contracts/src/
  orgs.ts                              # NEW
  index.ts                             # MODIFY

packages/api/src/
  lib/
    slug.ts                            # NEW
  repositories/
    orgs.repo.ts                       # NEW
    memberships.repo.ts                # NEW
  services/
    orgs.service.ts                    # NEW
    members.service.ts                 # NEW
  plugins/
    org-context.ts                     # NEW
  routes/v1/
    orgs.routes.ts                     # NEW
    members.routes.ts                  # NEW
  server.ts                            # MODIFY: register org-context + routes
  routes/v1/auth.routes.ts             # MODIFY: /me returns orgs
  types.ts                             # MODIFY: augment req.context

packages/api/tests/
  orgs.test.ts                         # NEW
  rbac.test.ts                         # NEW
```

---

## Task 1: Add org/membership schemas to contracts

**Files:**
- Create: `packages/contracts/src/orgs.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1.1: Write `orgs.ts`**

```ts
import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, RoleSchema, PaginationInputSchema, PageSchema } from './common.js';

/** Org row. */
export const OrgSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(80),
  createdAt: IsoDateTimeSchema,
});
export type Org = z.infer<typeof OrgSchema>;

/** Membership row (the join table). */
export const MembershipSchema = z.object({
  userId: IdSchema,
  orgId: IdSchema,
  role: RoleSchema,
  createdAt: IsoDateTimeSchema,
  // joined in
  user: z.object({
    id: IdSchema,
    email: z.string().email(),
    displayName: z.string(),
  }),
});
export type Membership = z.infer<typeof MembershipSchema>;

/** Create-org body. */
export const CreateOrgInputSchema = z.object({
  name: z.string().min(1).max(80),
});
export type CreateOrgInput = z.infer<typeof CreateOrgInputSchema>;

/** Update-org body. */
export const UpdateOrgInputSchema = z.object({
  name: z.string().min(1).max(80).optional(),
});
export type UpdateOrgInput = z.infer<typeof UpdateOrgInputSchema>;

/** Invite body. */
export const InviteMemberInputSchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(['editor', 'viewer']), // never invite as Owner via this endpoint
});
export type InviteMemberInput = z.infer<typeof InviteMemberInputSchema>;

/** Update-member-role body. */
export const UpdateMemberRoleInputSchema = z.object({
  role: z.enum(['owner', 'editor', 'viewer']),
});
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleInputSchema>;

/** Org with caller-context. */
export const OrgContextSchema = z.object({
  org: OrgSchema,
  role: RoleSchema,
  memberCount: z.number().int().nonnegative(),
  assetCount: z.number().int().nonnegative(),
});
export type OrgContext = z.infer<typeof OrgContextSchema>;

/** List orgs the current user belongs to. */
export const ListUserOrgsResponseSchema = z.object({
  data: z.array(
    z.object({
      org: OrgSchema,
      role: RoleSchema,
    }),
  ),
});

/** Asset list pagination (re-exported for the asset routes to consume). */
export const AssetPaginationInputSchema = PaginationInputSchema;
export const AssetPageSchema = <T extends z.ZodTypeAny>(item: T) => PageSchema(item);
```

- [ ] **Step 1.2: Modify `packages/contracts/src/index.ts`**

Add `export * from './orgs.js';` to the existing exports.

- [ ] **Step 1.3: Typecheck**

Run: `pnpm --filter @dam-link/contracts typecheck`
Expected: PASS.

- [ ] **Step 1.4: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): add org and membership schemas"
```

---

## Task 2: Slug generation

**Files:**
- Create: `packages/api/src/lib/slug.ts`
- Create: `packages/api/tests/slug.test.ts`

- [ ] **Step 2.1: Write the failing test**

Write `packages/api/tests/slug.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { slugify, withCollisionSuffix } from '../src/lib/slug.js';

describe('slugify', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(slugify('My Org Name')).toBe('my-org-name');
  });

  it('strips diacritics', () => {
    expect(slugify('Café Français')).toBe('cafe-francais');
  });

  it('removes characters that arent lowercase letters, digits, or dashes', () => {
    expect(slugify('Hello, World! 2024')).toBe('hello-world-2024');
  });

  it('collapses multiple dashes', () => {
    expect(slugify('a --- b')).toBe('a-b');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('  --hello--  ')).toBe('hello');
  });

  it('falls back to "org" when input is empty after sanitization', () => {
    expect(slugify('!!!')).toBe('org');
  });

  it('clamps to 80 chars', () => {
    const long = 'a'.repeat(200);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
  });
});

describe('withCollisionSuffix', () => {
  it('appends -2 to the first collision', () => {
    expect(withCollisionSuffix('foo', 1)).toBe('foo-2');
  });

  it('appends -N+1 for further collisions', () => {
    expect(withCollisionSuffix('foo', 5)).toBe('foo-6');
  });

  it('clamps to 80 chars even after suffix', () => {
    const long = 'a'.repeat(79);
    expect(withCollisionSuffix(long, 1).length).toBeLessThanOrEqual(80);
  });
});
```

- [ ] **Step 2.2: Run the test to verify it fails (red)**

Run: `pnpm --filter @dam-link/api test tests/slug.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2.3: Implement `slug.ts`**

```ts
const MAX_SLUG_LENGTH = 80;

/** Convert a free-form name to a URL-safe slug. */
export function slugify(input: string): string {
  const normalized = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const trimmed = normalized.slice(0, MAX_SLUG_LENGTH).replace(/-$/, '');
  return trimmed || 'org';
}

/** Append a collision counter: `foo` → `foo-2`, `foo-2` → `foo-3`, etc. */
export function withCollisionSuffix(base: string, attempt: number): string {
  const suffix = `-${attempt + 1}`;
  const budget = MAX_SLUG_LENGTH - suffix.length;
  return `${base.slice(0, budget)}${suffix}`;
}
```

- [ ] **Step 2.4: Run the test to verify it passes (green)**

Run: `pnpm --filter @dam-link/api test tests/slug.test.ts`
Expected: 10 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add packages/api/src/lib/slug.ts packages/api/tests/slug.test.ts
git commit -m "feat(api): slug generator with collision handling"
```

---

## Task 3: Org + membership repositories

**Files:**
- Create: `packages/api/src/repositories/orgs.repo.ts`
- Create: `packages/api/src/repositories/memberships.repo.ts`
- Create: `packages/api/tests/repos.test.ts`

- [ ] **Step 3.1: Write `orgs.repo.ts`**

```ts
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { orgs, type Org, type NewOrg } from '../db/schema.js';

export async function findOrgById(id: string): Promise<Org | null> {
  const db = getDb();
  const rows = await db.select().from(orgs).where(eq(orgs.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findOrgBySlug(slug: string): Promise<Org | null> {
  const db = getDb();
  const rows = await db.select().from(orgs).where(eq(orgs.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function createOrg(input: NewOrg): Promise<Org> {
  const db = getDb();
  const [row] = await db.insert(orgs).values(input).returning();
  if (!row) throw new Error('createOrg: insert returned no rows');
  return row;
}

export async function updateOrg(id: string, patch: Partial<NewOrg>): Promise<Org> {
  const db = getDb();
  const [row] = await db.update(orgs).set(patch).where(eq(orgs.id, id)).returning();
  if (!row) throw new Error('updateOrg: update returned no rows');
  return row;
}

export async function deleteOrg(id: string): Promise<void> {
  const db = getDb();
  await db.delete(orgs).where(eq(orgs.id, id));
}

/** True if any org already uses this slug. */
export async function slugExists(slug: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: orgs.id })
    .from(orgs)
    .where(eq(orgs.slug, slug))
    .limit(1);
  return rows.length > 0;
}

/** Find an available slug, adding a -2 / -3 suffix on collision. */
export async function findAvailableSlug(base: string): Promise<string> {
  if (!(await slugExists(base))) return base;
  for (let i = 1; i < 1000; i += 1) {
    const candidate = `${base}-${i + 1}`;
    if (!(await slugExists(candidate))) return candidate;
  }
  throw new Error(`findAvailableSlug: gave up after 1000 attempts for base "${base}"`);
}
```

- [ ] **Step 3.2: Write `memberships.repo.ts`**

```ts
import { and, eq, count, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { memberships, users, type Membership, type NewMembership } from '../db/schema.js';
import type { Role } from '@dam-link/contracts';

export async function findMembership(
  userId: string,
  orgId: string,
): Promise<Membership | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listMembershipsByOrg(orgId: string): Promise<
  Array<Membership & { user: { id: string; email: string; displayName: string } }>
> {
  const db = getDb();
  return db
    .select({
      userId: memberships.userId,
      orgId: memberships.orgId,
      role: memberships.role,
      createdAt: memberships.createdAt,
      user: {
        id: users.id,
        email: users.email,
        displayName: users.displayName,
      },
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, orgId));
}

export async function listMembershipsByUser(userId: string): Promise<Membership[]> {
  const db = getDb();
  return db.select().from(memberships).where(eq(memberships.userId, userId));
}

export async function createMembership(input: NewMembership): Promise<Membership> {
  const db = getDb();
  const [row] = await db.insert(memberships).values(input).returning();
  if (!row) throw new Error('createMembership: insert returned no rows');
  return row;
}

export async function updateMembershipRole(
  userId: string,
  orgId: string,
  role: Role,
): Promise<Membership> {
  const db = getDb();
  const [row] = await db
    .update(memberships)
    .set({ role })
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
    .returning();
  if (!row) throw new Error('updateMembershipRole: update returned no rows');
  return row;
}

export async function deleteMembership(userId: string, orgId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)));
}

export async function countMembers(orgId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ c: count() })
    .from(memberships)
    .where(eq(memberships.orgId, orgId));
  return row?.c ?? 0;
}

/** True if this is the only Owner of the org. Used to prevent the last Owner from leaving. */
export async function isLastOwner(orgId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ c: count() })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, 'owner' as Role)));
  if ((row?.c ?? 0) > 1) return false;
  const m = await findMembership(userId, orgId);
  return m?.role === 'owner';
}
```

- [ ] **Step 3.3: Write the failing repo test**

Write `packages/api/tests/repos.test.ts`:
```ts
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
    // noinspection ES6MissingAwait — not used here
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
    await createMembership({ userId: u1.id, orgId: org.id, role: 'editor' }); // demote u1
    void (await findOrgById(org.id));
    void (await findOrgBySlug(org.slug));
    expect(await isLastOwner(org.id, u1.id)).toBe(false); // u2 is still owner
  });
});
```

- [ ] **Step 3.4: Run the test to verify it fails (red)**

Run: `pnpm --filter @dam-link/api test tests/repos.test.ts`
Expected: FAIL — repos not found.

- [ ] **Step 3.5: Run again to verify it passes (green)**

(Repos are now implemented in steps 3.1-3.2.)
Run: `pnpm --filter @dam-link/api test tests/repos.test.ts`
Expected: 6 tests pass.

- [ ] **Step 3.6: Commit**

```bash
git add packages/api/src/repositories packages/api/tests/repos.test.ts
git commit -m "feat(api): orgs and memberships repos with slug collision handling"
```

---

## Task 4: Org + member services

**Files:**
- Create: `packages/api/src/services/orgs.service.ts`
- Create: `packages/api/src/services/members.service.ts`

- [ ] **Step 4.1: Write `orgs.service.ts`**

```ts
import { AppError } from '../plugins/error-handler.js';
import {
  createOrg as createOrgRow,
  deleteOrg as deleteOrgRow,
  findOrgById,
  findAvailableSlug,
  updateOrg as updateOrgRow,
} from '../repositories/orgs.repo.js';
import {
  createMembership,
  deleteMembership,
  isLastOwner,
  listMembershipsByUser,
} from '../repositories/memberships.repo.js';
import { slugify } from '../lib/slug.js';
import type { Org } from '../db/schema.js';
import type { Role } from '@dam-link/contracts';

export async function createOrgForUser(
  userId: string,
  input: { name: string },
): Promise<{ org: Org; role: Role }> {
  const slug = await findAvailableSlug(slugify(input.name));
  const org = await createOrgRow({ name: input.name, slug, createdAt: new Date() });
  await createMembership({ userId, orgId: org.id, role: 'owner' });
  return { org, role: 'owner' };
}

export async function listOrgsForUser(
  userId: string,
): Promise<Array<{ org: Org; role: Role }>> {
  const memberships = await listMembershipsByUser(userId);
  const out: Array<{ org: Org; role: Role }> = [];
  for (const m of memberships) {
    const org = await findOrgById(m.orgId);
    if (org) out.push({ org, role: m.role });
  }
  return out;
}

export async function getOrgContextForUser(
  userId: string,
  orgId: string,
): Promise<{ org: Org; role: Role } | null> {
  const org = await findOrgById(orgId);
  if (!org) return null;
  const memberships = await listMembershipsByUser(userId);
  const m = memberships.find((x) => x.orgId === orgId);
  return m ? { org, role: m.role } : null;
}

export async function renameOrg(orgId: string, name: string): Promise<Org> {
  return updateOrgRow(orgId, { name });
}

export async function deleteOrgAsOwner(userId: string, orgId: string): Promise<void> {
  // The last-owner check prevents catastrophic deletes; the org-context
  // plugin already verified the caller is an Owner of this org.
  if (await isLastOwner(orgId, userId)) {
    throw new AppError(409, 'LAST_OWNER', 'Cannot delete an org with only one owner');
  }
  await deleteOrgRow(orgId);
}

/** Remove yourself from an org. Refuses if you are the last owner. */
export async function leaveOrg(userId: string, orgId: string): Promise<void> {
  if (await isLastOwner(orgId, userId)) {
    throw new AppError(409, 'LAST_OWNER', 'Cannot leave an org as the last owner');
  }
  await deleteMembership(userId, orgId);
}
```

- [ ] **Step 4.2: Write `members.service.ts`**

```ts
import { AppError } from '../plugins/error-handler.js';
import {
  createMembership,
  deleteMembership,
  findMembership,
  isLastOwner,
  listMembershipsByOrg,
  updateMembershipRole,
} from '../repositories/memberships.repo.js';
import { findUserByEmail } from '../repositories/users.repo.js';
import { countAssetsInOrg } from '../repositories/assets.repo.js';
import type { Role } from '@dam-link/contracts';
import type { Membership, Org } from '../db/schema.js';

export async function listMembers(orgId: string) {
  return listMembershipsByOrg(orgId);
}

export async function inviteMember(
  orgId: string,
  input: { email: string; role: Exclude<Role, 'owner'> },
): Promise<Membership> {
  const user = await findUserByEmail(input.email);
  if (!user) {
    throw new AppError(
      422,
      'USER_NOT_FOUND',
      'No registered user with that email. They must register first.',
    );
  }
  const existing = await findMembership(user.id, orgId);
  if (existing) {
    throw new AppError(409, 'ALREADY_MEMBER', 'User is already a member of this org');
  }
  return createMembership({ userId: user.id, orgId, role: input.role });
}

export async function changeMemberRole(
  orgId: string,
  userId: string,
  role: Role,
): Promise<Membership> {
  const existing = await findMembership(userId, orgId);
  if (!existing) {
    throw new AppError(404, 'MEMBER_NOT_FOUND', 'User is not a member of this org');
  }
  // Last-owner demotion guard
  if (existing.role === 'owner' && role !== 'owner') {
    if (await isLastOwner(orgId, userId)) {
      throw new AppError(409, 'LAST_OWNER', 'Cannot demote the last owner');
    }
  }
  return updateMembershipRole(userId, orgId, role);
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  const existing = await findMembership(userId, orgId);
  if (!existing) {
    throw new AppError(404, 'MEMBER_NOT_FOUND', 'User is not a member of this org');
  }
  if (existing.role === 'owner' && (await isLastOwner(orgId, userId))) {
    throw new AppError(409, 'LAST_OWNER', 'Cannot remove the last owner');
  }
  await deleteMembership(userId, orgId);
}

/** Aggregated counts surfaced on /orgs/:id and /me. */
export async function getOrgStats(orgId: string): Promise<{ memberCount: number; assetCount: number }> {
  const { countMembers } = await import('../repositories/memberships.repo.js');
  const [memberCount, assetCount] = await Promise.all([
    countMembers(orgId),
    countAssetsInOrg(orgId),
  ]);
  return { memberCount, assetCount };
}

// Re-export Org type for callers
export type { Org };
```

- [ ] **Step 4.3: Stub the assets repo (Plan 4 implements it fully)**

Create `packages/api/src/repositories/assets.repo.ts`:
```ts
import { eq, and, isNull } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { assets } from '../db/schema.js';

/** Counts non-trashed assets in an org. Used by /me and /orgs/:id. */
export async function countAssetsInOrg(orgId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.orgId, orgId), isNull(assets.deletedAt)));
  return rows.length;
}
```

- [ ] **Step 4.4: Typecheck**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: PASS.

- [ ] **Step 4.5: Commit**

```bash
git add packages/api/src/services/orgs.service.ts packages/api/src/services/members.service.ts packages/api/src/repositories/assets.repo.ts
git commit -m "feat(api): orgs and members services with last-owner guards"
```

---

## Task 5: Org-context plugin (the tenant isolation chokepoint)

**Files:**
- Create: `packages/api/src/plugins/org-context.ts`
- Modify: `packages/api/src/types.ts`

- [ ] **Step 5.1: Augment `types.ts`**

Edit `packages/api/src/types.ts` to add the org context:
```ts
import 'fastify';
import type { User } from './db/schema.js';
import type { Org } from './db/schema.js';
import type { Role } from '@dam-link/contracts';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    user: User | null;
    /** Populated by the org-context plugin for /orgs/:orgId/... routes. */
    orgContext: { org: Org; role: Role } | null;
  }
}
```

- [ ] **Step 5.2: Write `org-context.ts`**

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from './error-handler.js';
import { getOrgContextForUser } from '../services/orgs.service.js';
import type { Role } from '@dam-link/contracts';

const ROLE_ORDER: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

/**
 * Mounts a preHandler that resolves `:orgId` to the user's membership in that org.
 * Mutates req.orgContext. 404 if the org doesn't exist, 403 if the user isn't a member.
 *
 * This is the single chokepoint for tenant isolation — every org-scoped route
 * uses it. NEVER access an org's data without going through this.
 */
export async function registerOrgContext(app: FastifyInstance): Promise<void> {
  app.decorateRequest('orgContext', null);

  app.addHook('preHandler', async (req: FastifyRequest) => {
    const orgId = (req.params as { orgId?: unknown })?.orgId;
    if (typeof orgId !== 'string' || orgId.length === 0) {
      // Not an org-scoped route — leave orgContext null.
      return;
    }

    if (!req.user) {
      // The route handler is misconfigured; requireUser should have run first.
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }

    const ctx = await getOrgContextForUser(req.user.id, orgId);
    if (!ctx) {
      // Don't distinguish 404 from 403 to prevent org enumeration.
      throw new AppError(403, 'ORG_FORBIDDEN', 'Not a member of this org');
    }
    req.orgContext = ctx;
  });
}

/**
 * Factory for a preHandler that enforces a minimum role.
 * Use as: `{ preHandler: [requireUser, requireRole('editor')] }`
 */
export function requireRole(min: Role) {
  return async (req: FastifyRequest) => {
    if (!req.orgContext) {
      throw new AppError(500, 'ORG_CONTEXT_MISSING', 'orgContext not set');
    }
    if (ROLE_ORDER[req.orgContext.role] < ROLE_ORDER[min]) {
      throw new AppError(403, 'INSUFFICIENT_ROLE', `Requires ${min} or higher`);
    }
  };
}
```

- [ ] **Step 5.3: Commit**

```bash
git add packages/api/src/plugins/org-context.ts packages/api/src/types.ts
git commit -m "feat(api): org-context plugin (single chokepoint for tenant isolation)"
```

---

## Task 6: Org + members routes

**Files:**
- Create: `packages/api/src/routes/v1/orgs.routes.ts`
- Create: `packages/api/src/routes/v1/members.routes.ts`
- Modify: `packages/api/src/routes/v1/auth.routes.ts` (update /me)
- Modify: `packages/api/src/server.ts` (register routes)

- [ ] **Step 6.1: Write `orgs.routes.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CreateOrgInputSchema,
  UpdateOrgInputSchema,
  OrgSchema,
  ListUserOrgsResponseSchema,
} from '@dam-link/contracts';
import {
  createOrgForUser,
  listOrgsForUser,
  renameOrg,
  deleteOrgAsOwner,
  getOrgContextForUser,
} from '../../services/orgs.service.js';
import { getOrgStats } from '../../services/members.service.js';
import { requireUser } from '../../plugins/auth.js';
import { requireRole } from '../../plugins/org-context.js';
import { AppError } from '../../plugins/error-handler.js';

function toOrg(o: { id: string; name: string; slug: string; createdAt: Date }) {
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    createdAt: o.createdAt.toISOString(),
  };
}

export async function registerOrgsRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/orgs — create new org; caller becomes Owner
  app.post(
    '/api/v1/orgs',
    {
      preHandler: [requireUser],
      schema: {
        body: CreateOrgInputSchema,
        response: { 200: z.object({ data: z.object({ org: OrgSchema, role: z.enum(['owner', 'editor', 'viewer']) }) }) },
        tags: ['orgs'],
        summary: 'Create a new org. The caller becomes the Owner.',
      },
    },
    async (req) => {
      const { org, role } = await createOrgForUser(req.user!.id, req.body);
      return { data: { org: toOrg(org), role } };
    },
  );

  // GET /api/v1/orgs — list orgs the caller belongs to
  app.get(
    '/api/v1/orgs',
    {
      preHandler: [requireUser],
      schema: {
        response: { 200: ListUserOrgsResponseSchema },
        tags: ['orgs'],
        summary: 'List orgs the current user belongs to',
      },
    },
    async (req) => {
      const items = await listOrgsForUser(req.user!.id);
      return { data: items.map(({ org, role }) => ({ org: toOrg(org), role })) };
    },
  );

  // GET /api/v1/orgs/:orgId — org detail with member/asset counts
  app.get(
    '/api/v1/orgs/:orgId',
    {
      preHandler: [requireUser, requireRole('viewer')],
      schema: {
        response: {
          200: z.object({
            data: z.object({
              org: OrgSchema,
              role: z.enum(['owner', 'editor', 'viewer']),
              memberCount: z.number().int().nonnegative(),
              assetCount: z.number().int().nonnegative(),
            }),
          }),
        },
        tags: ['orgs'],
        summary: 'Get org detail with counts',
      },
    },
    async (req) => {
      const ctx = req.orgContext!;
      const { memberCount, assetCount } = await getOrgStats(ctx.org.id);
      return { data: { org: toOrg(ctx.org), role: ctx.role, memberCount, assetCount } };
    },
  );

  // PATCH /api/v1/orgs/:orgId — Owner only
  app.patch(
    '/api/v1/orgs/:orgId',
    {
      preHandler: [requireUser, requireRole('owner')],
      schema: {
        body: UpdateOrgInputSchema,
        response: { 200: z.object({ data: z.object({ org: OrgSchema }) }) },
        tags: ['orgs'],
        summary: 'Rename an org (Owner only)',
      },
    },
    async (req) => {
      const org = await renameOrg(req.orgContext!.org.id, req.body.name!);
      return { data: { org: toOrg(org) } };
    },
  );

  // DELETE /api/v1/orgs/:orgId — Owner only; refuses if last owner
  app.delete(
    '/api/v1/orgs/:orgId',
    {
      preHandler: [requireUser, requireRole('owner')],
      schema: { response: { 204: z.null() }, tags: ['orgs'], summary: 'Delete an org' },
    },
    async (req, reply) => {
      await deleteOrgAsOwner(req.user!.id, req.orgContext!.org.id);
      return reply.status(204).send();
    },
  );
}
```

- [ ] **Step 6.2: Write `members.routes.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  InviteMemberInputSchema,
  UpdateMemberRoleInputSchema,
  MembershipSchema,
} from '@dam-link/contracts';
import {
  inviteMember,
  listMembers,
  changeMemberRole,
  removeMember,
} from '../../services/members.service.js';
import { requireUser } from '../../plugins/auth.js';
import { requireRole } from '../../plugins/org-context.js';

export async function registerMembersRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/orgs/:orgId/members — anyone in the org can see
  app.get(
    '/api/v1/orgs/:orgId/members',
    {
      preHandler: [requireUser, requireRole('viewer')],
      schema: {
        response: { 200: z.object({ data: z.array(MembershipSchema) }) },
        tags: ['members'],
        summary: 'List members of an org',
      },
    },
    async (req) => {
      const rows = await listMembers(req.orgContext!.org.id);
      return {
        data: rows.map((m) => ({
          userId: m.userId,
          orgId: m.orgId,
          role: m.role,
          createdAt: m.createdAt.toISOString(),
          user: m.user,
        })),
      };
    },
  );

  // POST /api/v1/orgs/:orgId/members — invite by email; Owner only
  app.post(
    '/api/v1/orgs/:orgId/members',
    {
      preHandler: [requireUser, requireRole('owner')],
      schema: {
        body: InviteMemberInputSchema,
        response: { 200: z.object({ data: MembershipSchema }) },
        tags: ['members'],
        summary: 'Invite an existing user (Owner only)',
      },
    },
    async (req) => {
      const m = await inviteMember(req.orgContext!.org.id, req.body);
      // Look up user for the joined fields
      const list = await listMembers(req.orgContext!.org.id);
      const joined = list.find((x) => x.userId === m.userId)!;
      return {
        data: {
          userId: joined.userId,
          orgId: joined.orgId,
          role: joined.role,
          createdAt: joined.createdAt.toISOString(),
          user: joined.user,
        },
      };
    },
  );

  // PATCH /api/v1/orgs/:orgId/members/:userId — change role; Owner only
  app.patch(
    '/api/v1/orgs/:orgId/members/:userId',
    {
      preHandler: [requireUser, requireRole('owner')],
      schema: {
        body: UpdateMemberRoleInputSchema,
        response: { 200: z.object({ data: MembershipSchema }) },
        tags: ['members'],
        summary: 'Change a member’s role (Owner only)',
      },
    },
    async (req) => {
      const { userId } = req.params as { userId: string };
      const m = await changeMemberRole(req.orgContext!.org.id, userId, req.body.role);
      return {
        data: {
          userId: m.userId,
          orgId: m.orgId,
          role: m.role,
          createdAt: m.createdAt.toISOString(),
          // user joined in by the next call
          user: { id: '', email: '', displayName: '' },
        },
      };
    },
  );

  // DELETE /api/v1/orgs/:orgId/members/:userId — remove; Owner only
  app.delete(
    '/api/v1/orgs/:orgId/members/:userId',
    {
      preHandler: [requireUser, requireRole('owner')],
      schema: { response: { 204: z.null() }, tags: ['members'], summary: 'Remove a member (Owner only)' },
    },
    async (req, reply) => {
      const { userId } = req.params as { userId: string };
      await removeMember(req.orgContext!.org.id, userId);
      return reply.status(204).send();
    },
  );
}
```

- [ ] **Step 6.3: Update `/auth/me` to include orgs**

Edit `packages/api/src/routes/v1/auth.routes.ts` — replace the `/me` handler:
```ts
// GET /api/v1/auth/me
app.get(
  '/api/v1/auth/me',
  {
    schema: {
      response: { 200: z.object({ data: MeResponseSchema }) },
      tags: ['auth'],
      summary: 'Get the current user (and their orgs)',
    },
  },
  async (req) => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Not logged in');
    }
    const { listOrgsForUser } = await import('../../services/orgs.service.js');
    const orgs = await listOrgsForUser(req.user.id);
    return {
      data: {
        user: toPublicUser(req.user),
        orgs: orgs.map(({ org, role }) => ({
          id: org.id,
          name: org.name,
          slug: org.slug,
          role,
        })),
      },
    };
  },
);
```

- [ ] **Step 6.4: Register the new plugins and routes in `server.ts`**

Edit `packages/api/src/server.ts`:
```ts
import { registerOrgContext } from './plugins/org-context.js';
import { registerOrgsRoutes } from './routes/v1/orgs.routes.js';
import { registerMembersRoutes } from './routes/v1/members.routes.js';
// ... inside buildApp, after registerAuthRoutes(app):
await registerOrgContext(app);
await registerOrgsRoutes(app);
await registerMembersRoutes(app);
```

- [ ] **Step 6.5: Typecheck**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: PASS.

- [ ] **Step 6.6: Commit**

```bash
git add packages/api/src/routes packages/api/src/plugins/org-context.ts packages/api/src/types.ts packages/api/src/server.ts
git commit -m "feat(api): orgs + members routes; /me now returns orgs"
```

---

## Task 7: Org integration tests

**Files:**
- Create: `packages/api/tests/orgs.test.ts`
- Create: `packages/api/tests/rbac.test.ts`

- [ ] **Step 7.1: Write `orgs.test.ts`**

```ts
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
    // The check is part of deleteOrgAsOwner. But the request is allowed
    // by the role check (alice is owner). The business rule refuses.
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
```

- [ ] **Step 7.2: Write `rbac.test.ts` (the role matrix)**

```ts
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

    // Need a third user to invite
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
    const owner2 = await reg(app, 'o2@example.com');
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
```

- [ ] **Step 7.3: Run the tests**

Run: `pnpm --filter @dam-link/api test tests/orgs.test.ts tests/rbac.test.ts`
Expected: ~10 tests pass.

- [ ] **Step 7.4: Run the full test suite**

Run: `pnpm --filter @dam-link/api test`
Expected: all green.

- [ ] **Step 7.5: Commit**

```bash
git add packages/api/tests/orgs.test.ts packages/api/tests/rbac.test.ts
git commit -m "test(api): org routes + RBAC matrix tests"
```

---

## Task 8: Final verification + tag

- [ ] **Step 8.1: Full check**

```bash
cd /d/DAM-Link-Backend/.worktrees/foundation
pnpm -r typecheck
pnpm -r test
pnpm -r build
```

- [ ] **Step 8.2: Boot and exercise by hand**

```bash
pnpm --filter @dam-link/api dev
# in another shell
SESSION=$(curl -s -i -X POST http://localhost:3000/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"manual@example.com","password":"hunter2pass","displayName":"M"}' \
  | grep -i 'set-cookie' | grep -oE 'dam_session=[^;]+' | cut -d= -f2)
curl -s -X POST http://localhost:3000/api/v1/orgs \
  -H 'content-type: application/json' \
  -H "cookie: dam_session=$SESSION" \
  -d '{"name":"Test Org"}' | jq
curl -s http://localhost:3000/api/v1/auth/me -H "cookie: dam_session=$SESSION" | jq
```

Expected: org created, returned; /me shows the user with one org.

- [ ] **Step 8.3: Tag**

```bash
git tag -a orgs-rbac-v0.3.0 -m "Orgs + RBAC complete"
git log --oneline | head -10
```

---

## Self-review

**Spec coverage:** ✅ — every checkbox in the design doc's "Multi-tenancy & RBAC model" section has a task: org CRUD, memberships, three roles, org-context middleware, every org route RBAC-enforced, /me returns orgs.

**Type consistency:** `OrgContext` in `org-context.ts` uses `{ org, role }` matching the service return type. `MeResponseSchema.orgs` items match what `/me` returns.

**Edge cases:**
- Last-owner guard on demote/leave/delete (both directions).
- Slug collision increments to `-2`, `-3`, ….
- The org-context 403 message deliberately doesn't distinguish 404 from 403 to prevent org enumeration.
- `requireRole('viewer')` is used for `GET` routes; `requireRole('owner')` for `PATCH`/`DELETE`; editors get `GET` only.

---

## Execution handoff

Plan complete and saved. We will defer execution-mode choice until all 9 plans are written.
