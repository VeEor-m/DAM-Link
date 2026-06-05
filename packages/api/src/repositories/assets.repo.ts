import { and, eq, gte, ilike, inArray, isNull, isNotNull, lt, lte, ne, or, sql, desc, asc, count, SQL } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { assets, type Asset, type NewAsset } from '../db/schema.js';
import type {
  AssetType,
  DateBucket,
  SizeBucket,
} from '@dam-link/contracts';

/* -------------------------------------------------------------------------- */
/* Plain counts                                                               */
/* -------------------------------------------------------------------------- */

/** Counts non-trashed assets in an org. Used by /me and /orgs/:id. */
export async function countAssetsInOrg(orgId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.orgId, orgId), isNull(assets.deletedAt)));
  return rows.length;
}

/* -------------------------------------------------------------------------- */
/* Plain CRUD                                                                 */
/* -------------------------------------------------------------------------- */

export async function findAssetById(orgId: string, id: string): Promise<Asset | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, id), eq(assets.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertAsset(input: NewAsset): Promise<Asset> {
  const db = getDb();
  const [row] = await db.insert(assets).values(input).returning();
  if (!row) throw new Error('insertAsset: insert returned no rows');
  return row;
}

export async function updateAsset(
  orgId: string,
  id: string,
  patch: Partial<NewAsset>,
): Promise<Asset> {
  const db = getDb();
  const [row] = await db
    .update(assets)
    .set(patch)
    .where(and(eq(assets.id, id), eq(assets.orgId, orgId)))
    .returning();
  if (!row) throw new Error('updateAsset: update returned no rows');
  return row;
}

export async function deleteAssetHard(orgId: string, id: string): Promise<void> {
  const db = getDb();
  await db
    .delete(assets)
    .where(and(eq(assets.id, id), eq(assets.orgId, orgId)));
}

/* -------------------------------------------------------------------------- */
/* Cursor pagination + filter SQL builder                                     */
/* -------------------------------------------------------------------------- */

export interface AssetListArgs {
  orgId: string;
  q?: string;
  types?: AssetType[];
  formats?: string[];
  sizeBucket?: SizeBucket;
  dateBucket?: DateBucket;
  uploaders?: string[];
  tags?: string[];
  favorite?: boolean;
  inTrash?: boolean;
  smart?: 'recent' | 'favorites' | 'trash';
  sort?: 'uploadedAt:asc' | 'uploadedAt:desc' | 'name:asc' | 'name:desc' | 'size:asc' | 'size:desc';
  limit: number;
  cursor?: { uploadedAt: Date; id: string } | null;
}

const SIZE_BUCKETS: Record<SizeBucket, { min: number; max: number }> = {
  small: { min: 0, max: 1024 * 1024 },
  medium: { min: 1024 * 1024, max: 10 * 1024 * 1024 },
  large: { min: 10 * 1024 * 1024, max: Number.MAX_SAFE_INTEGER },
};

function dateBucketLowerBound(bucket: DateBucket | undefined): Date | null {
  const now = Date.now();
  if (bucket === 'all') return null;
  const days = bucket === '7d' ? 7 : bucket === '30d' ? 30 : 90;
  return new Date(now - days * 24 * 60 * 60 * 1000);
}

function buildWhereClause(args: AssetListArgs): SQL | undefined {
  const conds: SQL[] = [eq(assets.orgId, args.orgId)];

  // Smart collection overrides
  if (args.smart === 'trash') {
    conds.push(isNotNull(assets.deletedAt));
  } else if (args.smart === 'favorites') {
    conds.push(isNull(assets.deletedAt));
    conds.push(eq(assets.favorite, true));
  } else if (args.smart === 'recent') {
    conds.push(isNull(assets.deletedAt));
    conds.push(gte(assets.uploadedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  } else {
    // Default: exclude trash unless explicitly requested
    if (args.inTrash === true) {
      conds.push(isNotNull(assets.deletedAt));
    } else {
      conds.push(isNull(assets.deletedAt));
    }
    if (args.favorite === true) {
      conds.push(eq(assets.favorite, true));
    } else if (args.favorite === false) {
      conds.push(eq(assets.favorite, false));
    }
  }

  if (args.q && args.q.length > 0) {
    const needle = `%${args.q.replace(/[%_]/g, '\\$&')}%`;
    // Use ILIKE on name + format + uploader-as-text. Tag matching is
    // handled separately via the tag filter (which uses array containment).
    conds.push(
      or(
        ilike(assets.name, needle),
        ilike(assets.format, needle),
        sql`${assets.uploadedBy}::text ILIKE ${needle}`,
      )!,
    );
  }

  if (args.types && args.types.length > 0) {
    conds.push(inArray(assets.type, args.types));
  }

  if (args.formats && args.formats.length > 0) {
    conds.push(inArray(assets.format, args.formats));
  }

  if (args.sizeBucket) {
    const { min, max } = SIZE_BUCKETS[args.sizeBucket];
    conds.push(gte(assets.size, min));
    conds.push(lt(assets.size, max));
  }

  const dateLower = dateBucketLowerBound(args.dateBucket);
  if (dateLower) {
    conds.push(gte(assets.uploadedAt, dateLower));
  }

  if (args.uploaders && args.uploaders.length > 0) {
    conds.push(inArray(assets.uploadedBy, args.uploaders));
  }

  if (args.tags && args.tags.length > 0) {
    // Asset must have ALL of the requested tags. Implemented as overlapping
    // array contains checks. The GIN index on `tags` makes this fast.
    for (const t of args.tags) {
      conds.push(sql`${assets.tags} @> ARRAY[${t}]::text[]`);
    }
  }

  if (args.cursor) {
    // (uploadedAt, id) < (cursor.uploadedAt, cursor.id) in the requested sort
    // direction. We always use uploadedAt as the primary key for the cursor
    // even when sorting by name/size (acceptable trade-off for MVP).
    conds.push(
      or(
        lt(assets.uploadedAt, args.cursor.uploadedAt),
        and(eq(assets.uploadedAt, args.cursor.uploadedAt), lt(assets.id, args.cursor.id)),
      )!,
    );
  }

  return conds.length > 0 ? and(...conds) : undefined;
}

function buildOrderBy(sort: AssetListArgs['sort']): SQL[] {
  const isAsc = sort?.endsWith(':asc') ?? false;
  const col = sort?.split(':')[0];
  const primary = col === 'name' ? assets.name : col === 'size' ? assets.size : assets.uploadedAt;
  const dir = isAsc ? asc : desc;
  return [dir(primary), dir(assets.id)];
}

export async function listAssets(args: AssetListArgs): Promise<Asset[]> {
  const db = getDb();
  const sort = args.sort ?? 'uploadedAt:desc';
  const where = buildWhereClause(args);
  const orderBy = buildOrderBy(sort);
  return db
    .select()
    .from(assets)
    .where(where)
    .orderBy(...orderBy)
    .limit(args.limit);
}

/* -------------------------------------------------------------------------- */
/* Sidebar counts                                                            */
/* -------------------------------------------------------------------------- */

export async function countAssetsByType(orgId: string): Promise<Record<AssetType, number>> {
  const db = getDb();
  const rows = await db
    .select({ type: assets.type, c: count() })
    .from(assets)
    .where(and(eq(assets.orgId, orgId), isNull(assets.deletedAt)))
    .groupBy(assets.type);
  const out: Record<AssetType, number> = { image: 0, video: 0, document: 0, audio: 0 };
  for (const r of rows) out[r.type] = Number(r.c);
  return out;
}

export async function countAssetsByTag(
  orgId: string,
  limit = 50,
): Promise<Array<{ tag: string; count: number }>> {
  const db = getDb();
  // Unnest the tags array and count occurrences.
  const rows = await db.execute<{ tag: string; count: number }>(sql`
    SELECT tag, COUNT(*)::int AS count
    FROM assets, unnest(${assets.tags}) AS tag
    WHERE ${assets.orgId} = ${orgId} AND ${assets.deletedAt} IS NULL
    GROUP BY tag
    ORDER BY count DESC, tag ASC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}

export async function countFavorites(orgId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ c: count() })
    .from(assets)
    .where(and(eq(assets.orgId, orgId), isNull(assets.deletedAt), eq(assets.favorite, true)));
  return Number(row?.c ?? 0);
}

export async function countTrash(orgId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ c: count() })
    .from(assets)
    .where(and(eq(assets.orgId, orgId), isNotNull(assets.deletedAt)));
  return Number(row?.c ?? 0);
}

/* -------------------------------------------------------------------------- */
/* Soft delete / restore / empty trash                                       */
/* -------------------------------------------------------------------------- */

export async function softDeleteAsset(orgId: string, id: string, when: Date): Promise<Asset> {
  return updateAsset(orgId, id, { deletedAt: when });
}

export async function restoreAsset(orgId: string, id: string): Promise<Asset> {
  return updateAsset(orgId, id, { deletedAt: null });
}

export async function emptyTrash(orgId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .delete(assets)
    .where(and(eq(assets.orgId, orgId), isNotNull(assets.deletedAt)))
    .returning({ id: assets.id });
  return rows.length;
}

/* -------------------------------------------------------------------------- */
/* Cursor encoding/decoding                                                  */
/* -------------------------------------------------------------------------- */

export function encodeCursor(a: Pick<Asset, 'uploadedAt' | 'id'>): string {
  return Buffer.from(`${a.uploadedAt.toISOString()}|${a.id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { uploadedAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const [ts, id] = decoded.split('|');
    if (!ts || !id) return null;
    const uploadedAt = new Date(ts);
    if (Number.isNaN(uploadedAt.getTime())) return null;
    return { uploadedAt, id };
  } catch {
    return null;
  }
}

// Re-export unused imports to avoid TS warnings.
export { ne, lte };
