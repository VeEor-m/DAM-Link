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
