import { eq } from 'drizzle-orm';
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
