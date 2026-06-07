import { and, eq, count } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { observeSql } from '../db/observe.js';
import { memberships, users, type Membership, type NewMembership } from '../db/schema.js';
import type { Role } from '@dam-link/contracts';

export async function findMembership(
  userId: string,
  orgId: string,
): Promise<Membership | null> {
  return await observeSql('memberships.findMembership', async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
      .limit(1);
    return rows[0] ?? null;
  });
}

export async function listMembershipsByOrg(orgId: string): Promise<
  Array<Membership & { user: { id: string; email: string; displayName: string } }>
> {
  return await observeSql('memberships.listMembershipsByOrg', async () => {
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
  });
}

export async function listMembershipsByUser(userId: string): Promise<Membership[]> {
  return await observeSql('memberships.listMembershipsByUser', async () => {
    const db = getDb();
    return db.select().from(memberships).where(eq(memberships.userId, userId));
  });
}

export async function createMembership(input: NewMembership): Promise<Membership> {
  return await observeSql('memberships.createMembership', async () => {
    const db = getDb();
    const [row] = await db.insert(memberships).values(input).returning();
    if (!row) throw new Error('createMembership: insert returned no rows');
    return row;
  });
}

export async function updateMembershipRole(
  userId: string,
  orgId: string,
  role: Role,
): Promise<Membership> {
  return await observeSql('memberships.updateMembershipRole', async () => {
    const db = getDb();
    const [row] = await db
      .update(memberships)
      .set({ role })
      .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
      .returning();
    if (!row) throw new Error('updateMembershipRole: update returned no rows');
    return row;
  });
}

export async function deleteMembership(userId: string, orgId: string): Promise<void> {
  return await observeSql('memberships.deleteMembership', async () => {
    const db = getDb();
    await db
      .delete(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)));
  });
}

export async function countMembers(orgId: string): Promise<number> {
  return await observeSql('memberships.countMembers', async () => {
    const db = getDb();
    const [row] = await db
      .select({ c: count() })
      .from(memberships)
      .where(eq(memberships.orgId, orgId));
    return row?.c ?? 0;
  });
}

/** True if this is the only Owner of the org. Used to prevent the last Owner from leaving. */
export async function isLastOwner(orgId: string, userId: string): Promise<boolean> {
  return await observeSql('memberships.isLastOwner', async () => {
    const db = getDb();
    const [row] = await db
      .select({ c: count() })
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.role, 'owner' as Role)));
    if ((row?.c ?? 0) > 1) return false;
    const m = await findMembership(userId, orgId);
    return m?.role === 'owner';
  });
}
