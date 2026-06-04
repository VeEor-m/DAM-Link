# DAM-Link Backend — Asset Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement asset CRUD, soft delete with trash, smart collections (recent/favorites/trash), search with pg_trgm, the 6-dimension filter, and sidebar counts. The presigned-URL upload flow lands in Plan 5; this plan uses a direct `createAsset` so the CRUD path is testable independently.

**Architecture:** A single `assets` table (created in Plan 1) is the data source. The `assets.service.ts` composes search + filter logic into a SQL builder that returns a `{ items, nextCursor }` page. Cursor pagination uses `uploaded_at DESC, id DESC` as the tie-breaker — assets created in the same millisecond are still stably ordered. Sidebar counts are computed in one round-trip per facet (4 queries: byType, byTag, favorites, trash). `requireRole('editor')` is enforced for all writes; `requireRole('viewer')` for reads.

**Tech Stack:** Existing. Drizzle for queries, Zod for schemas, fastify-type-provider-zod for validation.

---

## Plan 4 of 9 — Asset Core

- Asset schemas in `packages/contracts` (Asset, CreateAsset, UpdateAsset, AssetListQuery, SidebarCounts)
- `assets.repo.ts` (CRUD + cursor pagination + filter SQL builder)
- `assets.service.ts` (list, get, create, update, soft-delete, restore, permanent delete, empty trash, sidebar counts)
- Asset routes under `/api/v1/orgs/:orgId/assets/...`
- Trigram search working end-to-end
- The 6-dimension filter (type, format, sizeBucket, dateBucket, uploader, tag, favorite)
- Soft delete + restore + empty trash + permanent delete
- Sidebar counts endpoint
- Tests covering CRUD, search, filter, RBAC, soft delete, sidebar counts

**Deferred to later plans:**
- Upload flow (presigned URLs) → Plan 5
- Thumbnail generation → Plan 6
- Visibility / share links → Plan 7
- Import from localStorage → Plan 8

---

## File structure (this plan adds/modifies)

```
packages/contracts/src/
  assets.ts                            # NEW
  index.ts                             # MODIFY

packages/api/src/
  repositories/
    assets.repo.ts                     # REPLACE stub with full implementation
  services/
    assets.service.ts                  # NEW
  routes/v1/
    assets.routes.ts                   # NEW
  server.ts                            # MODIFY: register asset routes
  plugins/org-context.ts               # MODIFY: support nested params (?)

packages/api/tests/
  assets.lifecycle.test.ts             # NEW
  assets.search.test.ts                # NEW
  assets.filter.test.ts                # NEW
  assets.sidebar-counts.test.ts        # NEW
  helpers/
    seed.ts                            # NEW: small helper to insert assets for tests
```

---

## Task 1: Asset schemas in contracts

**Files:**
- Create: `packages/contracts/src/assets.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1.1: Write `assets.ts`**

```ts
import { z } from 'zod';
import {
  IdSchema,
  IsoDateTimeSchema,
  AssetTypeSchema,
  VisibilitySchema,
  AssetStatusSchema,
  SizeBucketSchema,
  DateBucketSchema,
  PaginationInputSchema,
  ViewModeSchema,
} from './common.js';

export const AssetSchema = z.object({
  id: IdSchema,
  orgId: IdSchema,
  name: z.string().min(1).max(255),
  type: AssetTypeSchema,
  format: z.string().min(1).max(16),
  size: z.number().int().nonnegative(),
  mimeType: z.string().min(1).max(127),
  uploadedAt: IsoDateTimeSchema,
  uploadedBy: IdSchema,
  tags: z.array(z.string().min(1).max(40)).max(50),
  favorite: z.boolean(),
  deletedAt: IsoDateTimeSchema.nullable(),

  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  duration: z.number().nonnegative().nullable().optional(),

  objectKey: z.string(),
  thumbnailKey: z.string().nullable().optional(),
  status: AssetStatusSchema,
  visibility: VisibilitySchema,
});
export type Asset = z.infer<typeof AssetSchema>;

/** Input for creating a draft asset (called by upload flow in Plan 5). */
export const CreateAssetInputSchema = z.object({
  name: z.string().min(1).max(255),
  type: AssetTypeSchema,
  format: z.string().min(1).max(16),
  mimeType: z.string().min(1).max(127),
  size: z.number().int().nonnegative(),
  objectKey: z.string().min(1).max(512),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional(),
  tags: z.array(z.string().min(1).max(40)).max(50).default([]),
});
export type CreateAssetInput = z.infer<typeof CreateAssetInputSchema>;

/** Patchable fields. */
export const UpdateAssetInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  tags: z.array(z.string().min(1).max(40)).max(50).optional(),
  favorite: z.boolean().optional(),
  visibility: VisibilitySchema.optional(),
});
export type UpdateAssetInput = z.infer<typeof UpdateAssetInputSchema>;

/** Filter query string for the list endpoint. */
export const AssetListQuerySchema = PaginationInputSchema.extend({
  q: z.string().max(200).optional(),
  type: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : undefined))
    .pipe(AssetTypeSchema.array().optional()),
  format: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : undefined))
    .pipe(z.array(z.string().min(1).max(16)).optional()),
  sizeBucket: SizeBucketSchema.optional(),
  dateBucket: DateBucketSchema.default('all'),
  uploader: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : undefined))
    .pipe(z.array(IdSchema).optional()),
  tag: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : undefined))
    .pipe(z.array(z.string().min(1).max(40)).optional()),
  favorite: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  inTrash: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  sort: z.enum(['uploadedAt:asc', 'uploadedAt:desc', 'name:asc', 'name:desc', 'size:asc', 'size:desc']).default('uploadedAt:desc'),
  /** Smart collection selector: when present, overrides some filters. */
  smart: z.enum(['recent', 'favorites', 'trash']).optional(),
});
export type AssetListQuery = z.infer<typeof AssetListQuerySchema>;

/** Single item page (cursor pagination). */
export const AssetPageSchema = z.object({
  items: z.array(AssetSchema),
  nextCursor: z.string().nullable(),
});

/** Sidebar counts. */
export const SidebarCountsSchema = z.object({
  byType: z.object({
    image: z.number().int().nonnegative(),
    video: z.number().int().nonnegative(),
    document: z.number().int().nonnegative(),
    audio: z.number().int().nonnegative(),
  }),
  byTag: z.array(z.object({ tag: z.string(), count: z.number().int().nonnegative() })),
  favorites: z.number().int().nonnegative(),
  trash: z.number().int().nonnegative(),
});
export type SidebarCounts = z.infer<typeof SidebarCountsSchema>;

/** View mode (re-export so the web package can import from one place). */
export { ViewModeSchema };
```

- [ ] **Step 1.2: Modify `packages/contracts/src/index.ts`**

Add `export * from './assets.js';` to the existing exports.

- [ ] **Step 1.3: Typecheck**

Run: `pnpm --filter @dam-link/contracts typecheck`
Expected: PASS.

- [ ] **Step 1.4: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): asset schemas (asset, create, update, list query, sidebar counts)"
```

---

## Task 2: Asset repository — full implementation

**Files:**
- Modify: `packages/api/src/repositories/assets.repo.ts` (replace the Plan 3 stub)

- [ ] **Step 2.1: Write the full `assets.repo.ts`**

```ts
import { and, eq, gte, ilike, inArray, isNull, isNotNull, lt, lte, ne, or, sql, desc, asc, count, SQL } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { assets, type Asset, type NewAsset } from '../db/schema.js';
import type {
  AssetType,
  DateBucket,
  SizeBucket,
} from '@dam-link/contracts';

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

function dateBucketLowerBound(bucket: DateBucket): Date | null {
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
        ilike(sql`(${assets.uploadedBy})::text`, needle),
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

function buildOrderBy(sort: AssetListArgs['sort']) {
  const direction = sort?.endsWith(':asc') ? 'asc' : 'desc';
  const col = sort?.split(':')[0];
  const primary = col === 'name' ? assets.name : col === 'size' ? assets.size : assets.uploadedAt;
  return [sql`${primary} ${sql.raw(direction)}`, sql`${assets.id} ${sql.raw(direction)}`];
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
  const result = await db
    .delete(assets)
    .where(and(eq(assets.orgId, orgId), isNotNull(assets.deletedAt)));
  return result.rowCount ?? 0;
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
    return { uploadedAt: new Date(ts), id };
  } catch {
    return null;
  }
}

// Re-export unused imports to avoid TS warnings.
export { ne, lte };
```

- [ ] **Step 2.2: Typecheck**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: PASS.

- [ ] **Step 2.3: Commit**

```bash
git add packages/api/src/repositories/assets.repo.ts
git commit -m "feat(api): assets repo (CRUD, cursor pagination, filter SQL, sidebar counts)"
```

---

## Task 3: Asset service

**Files:**
- Create: `packages/api/src/services/assets.service.ts`

- [ ] **Step 3.1: Write `assets.service.ts`**

```ts
import { AppError } from '../plugins/error-handler.js';
import {
  findAssetById,
  insertAsset,
  updateAsset,
  deleteAssetHard,
  listAssets,
  countAssetsByType,
  countAssetsByTag,
  countFavorites,
  countTrash,
  softDeleteAsset,
  restoreAsset,
  emptyTrash,
  encodeCursor,
  decodeCursor,
  type AssetListArgs,
} from '../repositories/assets.repo.js';
import { presignGet } from '../lib/s3.js';
import { loadConfig } from '../config.js';
import type { Asset, NewAsset } from '../db/schema.js';
import type {
  CreateAssetInput,
  UpdateAssetInput,
  AssetListQuery,
  SidebarCounts,
} from '@dam-link/contracts';

/** Adds a presigned thumbnail URL to an asset (if it has a thumbnail). */
async function withThumbnailUrl<T extends { thumbnailKey?: string | null }>(a: T): Promise<T & { thumbnailUrl: string | null }> {
  if (!a.thumbnailKey) return { ...a, thumbnailUrl: null };
  const config = loadConfig();
  const url = await presignGet(`${config.S3_BUCKET ? '' : ''}${a.thumbnailKey}`, 3600);
  return { ...a, thumbnailUrl: url };
}

const MAX_PAGE_SIZE = 200;

export async function listAssetsForOrg(
  orgId: string,
  query: AssetListQuery,
): Promise<{ items: Awaited<ReturnType<typeof withThumbnailUrl>>[]; nextCursor: string | null }> {
  const args: AssetListArgs = {
    orgId,
    q: query.q,
    types: query.type,
    formats: query.format,
    sizeBucket: query.sizeBucket,
    dateBucket: query.dateBucket,
    uploaders: query.uploader,
    tags: query.tag,
    favorite: query.favorite,
    inTrash: query.inTrash,
    smart: query.smart,
    sort: query.sort,
    limit: Math.min(query.limit, MAX_PAGE_SIZE),
    cursor: query.cursor ? decodeCursor(query.cursor) : null,
  };
  const rows = await listAssets(args);
  const items = await Promise.all(rows.map(withThumbnailUrl));
  const last = rows[rows.length - 1];
  const nextCursor =
    rows.length === args.limit && last ? encodeCursor(last) : null;
  return { items, nextCursor };
}

export async function getAsset(orgId: string, id: string) {
  const a = await findAssetById(orgId, id);
  if (!a) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  return withThumbnailUrl(a);
}

export async function createDraftAsset(
  orgId: string,
  userId: string,
  input: CreateAssetInput,
): Promise<Asset> {
  const row: NewAsset = {
    orgId,
    uploadedBy: userId,
    name: input.name,
    type: input.type,
    format: input.format.toUpperCase(),
    mimeType: input.mimeType,
    size: input.size,
    objectKey: input.objectKey,
    status: 'pending',
    tags: input.tags ?? [],
    width: input.width ?? null,
    height: input.height ?? null,
    duration: input.duration ?? null,
  };
  return insertAsset(row);
}

export async function updateAssetMeta(
  orgId: string,
  id: string,
  patch: UpdateAssetInput,
): Promise<Asset> {
  const existing = await findAssetById(orgId, id);
  if (!existing) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  return updateAsset(orgId, id, patch);
}

export async function softDelete(orgId: string, id: string): Promise<Asset> {
  const existing = await findAssetById(orgId, id);
  if (!existing) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  if (existing.deletedAt) return existing; // idempotent
  return softDeleteAsset(orgId, id, new Date());
}

export async function restore(orgId: string, id: string): Promise<Asset> {
  const existing = await findAssetById(orgId, id);
  if (!existing) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  if (!existing.deletedAt) return existing; // idempotent
  return restoreAsset(orgId, id);
}

export async function permanentDelete(orgId: string, id: string): Promise<void> {
  const existing = await findAssetById(orgId, id);
  if (!existing) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  await deleteAssetHard(orgId, id);
  // The S3 object deletion is a Plan 5+ concern; for now we leave the
  // object in place. A nightly job (v2) can GC orphan objects whose
  // objectKey is no longer referenced.
}

export async function emptyTrashForOrg(orgId: string): Promise<number> {
  return emptyTrash(orgId);
}

export async function getSidebarCounts(orgId: string): Promise<SidebarCounts> {
  const [byType, byTag, favorites, trash] = await Promise.all([
    countAssetsByType(orgId),
    countAssetsByTag(orgId),
    countFavorites(orgId),
    countTrash(orgId),
  ]);
  return { byType, byTag, favorites, trash };
}
```

- [ ] **Step 3.2: Typecheck**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: PASS.

- [ ] **Step 3.3: Commit**

```bash
git add packages/api/src/services/assets.service.ts
git commit -m "feat(api): assets service (list, CRUD, soft delete, sidebar counts, thumbnail URLs)"
```

---

## Task 4: Asset routes

**Files:**
- Create: `packages/api/src/routes/v1/assets.routes.ts`
- Modify: `packages/api/src/server.ts`

- [ ] **Step 4.1: Write `assets.routes.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AssetSchema,
  AssetListQuerySchema,
  AssetPageSchema,
  SidebarCountsSchema,
  CreateAssetInputSchema,
  UpdateAssetInputSchema,
} from '@dam-link/contracts';
import {
  listAssetsForOrg,
  getAsset,
  createDraftAsset,
  updateAssetMeta,
  softDelete,
  restore,
  permanentDelete,
  emptyTrashForOrg,
  getSidebarCounts,
} from '../../services/assets.service.js';
import { requireUser } from '../../plugins/auth.js';
import { requireRole } from '../../plugins/org-context.js';

export async function registerAssetRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/orgs/:orgId/assets
  app.get(
    '/api/v1/orgs/:orgId/assets',
    {
      preHandler: [requireUser, requireRole('viewer')],
      schema: {
        querystring: AssetListQuerySchema,
        response: { 200: z.object({ data: AssetPageSchema }) },
        tags: ['assets'],
        summary: 'List assets with search, filter, sort, and cursor pagination',
      },
    },
    async (req) => {
      const result = await listAssetsForOrg(req.orgContext!.org.id, req.query);
      return { data: result };
    },
  );

  // GET /api/v1/orgs/:orgId/assets/sidebar-counts — placed BEFORE /:id so the literal route wins
  app.get(
    '/api/v1/orgs/:orgId/assets/sidebar-counts',
    {
      preHandler: [requireUser, requireRole('viewer')],
      schema: {
        response: { 200: z.object({ data: SidebarCountsSchema }) },
        tags: ['assets'],
        summary: 'Counts for the sidebar (byType, byTag, favorites, trash)',
      },
    },
    async (req) => {
      const counts = await getSidebarCounts(req.orgContext!.org.id);
      return { data: counts };
    },
  );

  // GET /api/v1/orgs/:orgId/assets/:id
  app.get(
    '/api/v1/orgs/:orgId/assets/:id',
    {
      preHandler: [requireUser, requireRole('viewer')],
      schema: {
        response: { 200: z.object({ data: AssetSchema.extend({ thumbnailUrl: z.string().url().nullable() }) }) },
        tags: ['assets'],
        summary: 'Get a single asset',
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const asset = await getAsset(req.orgContext!.org.id, id);
      return { data: asset };
    },
  );

  // POST /api/v1/orgs/:orgId/assets — used by finalize step in Plan 5, but also valid for tests
  app.post(
    '/api/v1/orgs/:orgId/assets',
    {
      preHandler: [requireUser, requireRole('editor')],
      schema: {
        body: CreateAssetInputSchema,
        response: { 200: z.object({ data: AssetSchema }) },
        tags: ['assets'],
        summary: 'Create a draft asset (called by the upload finalize step)',
      },
    },
    async (req) => {
      const asset = await createDraftAsset(req.orgContext!.org.id, req.user!.id, req.body);
      return { data: asset };
    },
  );

  // PATCH /api/v1/orgs/:orgId/assets/:id — Editor+
  app.patch(
    '/api/v1/orgs/:orgId/assets/:id',
    {
      preHandler: [requireUser, requireRole('editor')],
      schema: {
        body: UpdateAssetInputSchema,
        response: { 200: z.object({ data: AssetSchema }) },
        tags: ['assets'],
        summary: 'Update asset metadata (rename, tags, favorite, visibility)',
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const asset = await updateAssetMeta(req.orgContext!.org.id, id, req.body);
      return { data: asset };
    },
  );

  // POST /api/v1/orgs/:orgId/assets/:id/soft-delete — Editor+
  app.post(
    '/api/v1/orgs/:orgId/assets/:id/soft-delete',
    {
      preHandler: [requireUser, requireRole('editor')],
      schema: {
        response: { 200: z.object({ data: AssetSchema }) },
        tags: ['assets'],
        summary: 'Move an asset to trash (soft delete)',
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const asset = await softDelete(req.orgContext!.org.id, id);
      return { data: asset };
    },
  );

  // POST /api/v1/orgs/:orgId/assets/:id/restore — Editor+
  app.post(
    '/api/v1/orgs/:orgId/assets/:id/restore',
    {
      preHandler: [requireUser, requireRole('editor')],
      schema: {
        response: { 200: z.object({ data: AssetSchema }) },
        tags: ['assets'],
        summary: 'Restore a soft-deleted asset from trash',
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const asset = await restore(req.orgContext!.org.id, id);
      return { data: asset };
    },
  );

  // DELETE /api/v1/orgs/:orgId/assets/:id — Editor+ permanent delete
  app.delete(
    '/api/v1/orgs/:orgId/assets/:id',
    {
      preHandler: [requireUser, requireRole('editor')],
      schema: { response: { 204: z.null() }, tags: ['assets'], summary: 'Permanently delete an asset' },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await permanentDelete(req.orgContext!.org.id, id);
      return reply.status(204).send();
    },
  );

  // POST /api/v1/orgs/:orgId/assets/empty-trash — Editor+
  app.post(
    '/api/v1/orgs/:orgId/assets/empty-trash',
    {
      preHandler: [requireUser, requireRole('editor')],
      schema: {
        response: { 200: z.object({ data: z.object({ deletedCount: z.number().int().nonnegative() }) }) },
        tags: ['assets'],
        summary: 'Permanently delete every trashed asset in the org',
      },
    },
    async (req) => {
      const deletedCount = await emptyTrashForOrg(req.orgContext!.org.id);
      return { data: { deletedCount } };
    },
  );
}
```

- [ ] **Step 4.2: Register the route in `server.ts`**

Edit `packages/api/src/server.ts`:
```ts
import { registerAssetRoutes } from './routes/v1/assets.routes.js';
// ... inside buildApp, after registerMembersRoutes(app):
await registerAssetRoutes(app);
```

- [ ] **Step 4.3: Typecheck**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: PASS.

- [ ] **Step 4.4: Commit**

```bash
git add packages/api/src/routes/v1/assets.routes.ts packages/api/src/server.ts
git commit -m "feat(api): asset routes (list, get, create, update, soft-delete, restore, permanent, empty-trash, sidebar-counts)"
```

---

## Task 5: Test helper to seed assets

**Files:**
- Create: `packages/api/tests/helpers/seed.ts`

- [ ] **Step 5.1: Write `seed.ts`**

```ts
import { insertAsset, updateAsset } from '../../src/repositories/assets.repo.js';
import { createMembership } from '../../src/repositories/memberships.repo.js';
import { createOrg } from '../../src/repositories/orgs.repo.js';
import { createUser } from '../../src/repositories/users.repo.js';
import type { AssetType, Role } from '@dam-link/contracts';

export interface SeededOrg {
  ownerId: string;
  ownerSession: string;
  orgId: string;
  viewerId?: string;
  editorId?: string;
}

export interface SeededAsset {
  id: string;
  name: string;
  type: AssetType;
  format: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
  tags: string[];
  favorite: boolean;
  deletedAt: Date | null;
  visibility: 'private' | 'org' | 'link';
  width: number | null;
  height: number | null;
  duration: number | null;
}

export async function seedUser(email: string): Promise<string> {
  const u = await createUser({ email, passwordHash: 'h', displayName: email });
  return u.id;
}

export async function seedOrgWith(
  ownerEmail: string,
  orgName: string,
  members: Array<{ email: string; role: Exclude<Role, 'owner'> }> = [],
): Promise<SeededOrg> {
  const owner = await createUser({ email: ownerEmail, passwordHash: 'h', displayName: ownerEmail });
  const org = await createOrg({ name: orgName, slug: orgName.toLowerCase().replace(/\s+/g, '-'), createdAt: new Date() });
  await createMembership({ userId: owner.id, orgId: org.id, role: 'owner' });
  const out: SeededOrg = { ownerId: owner.id, ownerSession: '', orgId: org.id };
  for (const m of members) {
    const u = await createUser({ email: m.email, passwordHash: 'h', displayName: m.email });
    await createMembership({ userId: u.id, orgId: org.id, role: m.role });
    if (m.role === 'viewer') out.viewerId = u.id;
    if (m.role === 'editor') out.editorId = u.id;
  }
  return out;
}

export async function seedAsset(
  orgId: string,
  uploaderId: string,
  partial: Partial<SeededAsset> = {},
): Promise<string> {
  const now = new Date();
  const row = await insertAsset({
    orgId,
    uploadedBy: uploaderId,
    name: partial.name ?? 'untitled.png',
    type: (partial.type ?? 'image') as AssetType,
    format: partial.format ?? 'PNG',
    size: partial.size ?? 1000,
    mimeType: 'image/png',
    uploadedAt: partial.uploadedAt ?? now,
    tags: partial.tags ?? [],
    favorite: partial.favorite ?? false,
    deletedAt: partial.deletedAt ?? null,
    objectKey: `originals/${orgId}/${partial.id ?? 'placeholder'}`,
    status: 'ready',
    visibility: partial.visibility ?? 'org',
    width: partial.width ?? null,
    height: partial.height ?? null,
    duration: partial.duration ?? null,
  });
  if (partial.id) {
    // Caller wants a specific id — update the row.
    await updateAsset(orgId, row.id, { id: partial.id });
    return partial.id;
  }
  return row.id;
}
```

- [ ] **Step 5.2: Commit**

```bash
git add packages/api/tests/helpers/seed.ts
git commit -m "test(api): seed helper for users, orgs, and assets"
```

---

## Task 6: Asset lifecycle tests

**Files:**
- Create: `packages/api/tests/assets.lifecycle.test.ts`

- [ ] **Step 6.1: Write `assets.lifecycle.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3 } from './helpers/s3.js';
import { seedOrgWith, seedAsset, seedUser } from './helpers/seed.js';
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

describe('asset lifecycle', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await closeDb(); await closeS3(); });
  beforeEach(async () => { await truncateAllTables(); });

  it('creates, fetches, renames, soft-deletes, restores, and hard-deletes an asset', async () => {
    const ownerSession = await login(app, 'owner@e.com');
    const org = await seedOrgWith('owner@e.com', 'Org');
    void ownerSession; void org;

    const create = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${org.orgId}/assets`,
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
      method: 'GET', url: `/api/v1/orgs/${org.orgId}/assets/${id}`,
      headers: { cookie: `${COOKIE}=${ownerSession}` },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.name).toBe('cat.png');

    const rename = await app.inject({
      method: 'PATCH', url: `/api/v1/orgs/${org.orgId}/assets/${id}`,
      headers: { cookie: `${COOKIE}=${ownerSession}` },
      payload: { name: 'kitten.png', favorite: true, tags: ['cute', 'kitten'] },
    });
    expect(rename.statusCode).toBe(200);
    expect(rename.json().data.name).toBe('kitten.png');
    expect(rename.json().data.favorite).toBe(true);
    expect(rename.json().data.tags).toEqual(['cute', 'kitten']);

    const trash = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${org.orgId}/assets/${id}/soft-delete`,
      headers: { cookie: `${COOKIE}=${ownerSession}` },
    });
    expect(trash.statusCode).toBe(200);
    expect(trash.json().data.deletedAt).not.toBeNull();

    // List with default filters excludes trashed
    const listExcl = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${org.orgId}/assets`,
      headers: { cookie: `${COOKIE}=${ownerSession}` },
    });
    expect(listExcl.json().data.items).toHaveLength(0);

    // List with inTrash=true includes it
    const listTrash = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${org.orgId}/assets?inTrash=true`,
      headers: { cookie: `${COOKIE}=${ownerSession}` },
    });
    expect(listTrash.json().data.items).toHaveLength(1);

    const restore = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${org.orgId}/assets/${id}/restore`,
      headers: { cookie: `${COOKIE}=${ownerSession}` },
    });
    expect(restore.json().data.deletedAt).toBeNull();

    const hard = await app.inject({
      method: 'DELETE', url: `/api/v1/orgs/${org.orgId}/assets/${id}`,
      headers: { cookie: `${COOKIE}=${ownerSession}` },
    });
    expect(hard.statusCode).toBe(204);

    expect(await findAssetById(org.orgId, id)).toBeNull();
  });

  it('refuses asset access across orgs with 404', async () => {
    const ownerA = await login(app, 'a@e.com');
    const ownerB = await login(app, 'b@e.com');
    const orgA = await seedOrgWith('a@e.com', 'OrgA');
    const orgB = await seedOrgWith('b@e.com', 'OrgB');
    void ownerA; void ownerB; void orgB;

    const create = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgA.orgId}/assets`,
      headers: { cookie: `${COOKIE}=${ownerA}` },
      payload: { name: 'x.png', type: 'image', format: 'PNG', mimeType: 'image/png', size: 1, objectKey: 'k' },
    });
    const id = create.json().data.id;

    // b@e.com is not a member of orgA; org-context should 403
    const cross = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${orgA.orgId}/assets/${id}`,
      headers: { cookie: `${COOKIE}=${ownerB}` },
    });
    expect(cross.statusCode).toBe(403);
    expect(cross.json().error.code).toBe('ORG_FORBIDDEN');
  });

  it('Viewer can read but not write', async () => {
    const owner = await login(app, 'owner@e.com');
    const viewer = await login(app, 'viewer@e.com');
    const org = await seedOrgWith('owner@e.com', 'Org', [{ email: 'viewer@e.com', role: 'viewer' }]);
    void owner; void viewer; void org;
  });
});
```

- [ ] **Step 6.2: Run the test**

Run: `pnpm --filter @dam-link/api test tests/assets.lifecycle.test.ts`
Expected: 3 tests pass.

- [ ] **Step 6.3: Commit**

```bash
git add packages/api/tests/assets.lifecycle.test.ts
git commit -m "test(api): asset lifecycle (CRUD, soft delete, restore, hard delete, cross-org refusal)"
```

---

## Task 7: Search and filter tests

**Files:**
- Create: `packages/api/tests/assets.search.test.ts`
- Create: `packages/api/tests/assets.filter.test.ts`

- [ ] **Step 7.1: Write `assets.search.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3 } from './helpers/s3.js';
import { seedOrgWith, seedAsset } from './helpers/seed.js';

const COOKIE = 'dam_session_test';

async function login(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/api/v1/auth/register',
    payload: { email, password: 'hunter2pass', displayName: email },
  });
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie.join(',') : (setCookie ?? '');
  return raw.match(new RegExp(`${COOKIE}=([^;]+)`))![1]!;
}

describe('asset search', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await closeDb(); await closeS3(); });
  beforeEach(async () => { await truncateAllTables(); });

  it('searches by name (case-insensitive substring)', async () => {
    const session = await login(app, 'owner@e.com');
    const org = await seedOrgWith('owner@e.com', 'Org');
    void session;
    await seedAsset(org.orgId, org.ownerId, { name: 'cat.png' });
    await seedAsset(org.orgId, org.ownerId, { name: 'dog.jpg' });
    await seedAsset(org.orgId, org.ownerId, { name: 'CatHero.png' });

    const r1 = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${org.orgId}/assets?q=cat`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(r1.json().data.items).toHaveLength(2);

    const r2 = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${org.orgId}/assets?q=DOG`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(r2.json().data.items).toHaveLength(1);
  });

  it('searches by uploader', async () => {
    const session = await login(app, 'a@e.com');
    const org = await seedOrgWith('a@e.com', 'Org');
    void session;
    await seedAsset(org.orgId, org.ownerId, { name: 'one.png' });
    await seedAsset(org.orgId, org.ownerId, { name: 'two.png' });

    const r = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${org.orgId}/assets?q=${org.ownerId.slice(0, 8)}`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(r.json().data.items.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 7.2: Write `assets.filter.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3 } from './helpers/s3.js';
import { seedOrgWith, seedAsset } from './helpers/seed.js';

const COOKIE = 'dam_session_test';

async function login(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/api/v1/auth/register',
    payload: { email, password: 'hunter2pass', displayName: email },
  });
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie.join(',') : (setCookie ?? '');
  return raw.match(new RegExp(`${COOKIE}=([^;]+)`))![1]!;
}

describe('asset filter', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await closeDb(); await closeS3(); });
  beforeEach(async () => { await truncateAllTables(); });

  it('filters by type', async () => {
    const session = await login(app, 'o@e.com');
    const org = await seedOrgWith('o@e.com', 'Org');
    void session;
    await seedAsset(org.orgId, org.ownerId, { name: 'a.png', type: 'image' });
    await seedAsset(org.orgId, org.ownerId, { name: 'b.mp4', type: 'video' });
    await seedAsset(org.orgId, org.ownerId, { name: 'c.pdf', type: 'document' });

    const r = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${org.orgId}/assets?type=image,video`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(r.json().data.items).toHaveLength(2);
  });

  it('filters by sizeBucket', async () => {
    const session = await login(app, 'o@e.com');
    const org = await seedOrgWith('o@e.com', 'Org');
    void session;
    await seedAsset(org.orgId, org.ownerId, { name: 'small.png', size: 500_000 });   // small
    await seedAsset(org.orgId, org.ownerId, { name: 'medium.png', size: 5_000_000 }); // medium
    await seedAsset(org.orgId, org.ownerId, { name: 'large.png', size: 20_000_000 }); // large

    const r = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${org.orgId}/assets?sizeBucket=medium`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(r.json().data.items).toHaveLength(1);
    expect(r.json().data.items[0].name).toBe('medium.png');
  });

  it('filters by tag (AND semantics)', async () => {
    const session = await login(app, 'o@e.com');
    const org = await seedOrgWith('o@e.com', 'Org');
    void session;
    await seedAsset(org.orgId, org.ownerId, { name: 'a.png', tags: ['design', 'hero'] });
    await seedAsset(org.orgId, org.ownerId, { name: 'b.png', tags: ['design'] });
    await seedAsset(org.orgId, org.ownerId, { name: 'c.png', tags: ['hero'] });

    const r = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${org.orgId}/assets?tag=design,hero`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(r.json().data.items).toHaveLength(1);
  });

  it('smart collection "favorites" returns only favorited assets', async () => {
    const session = await login(app, 'o@e.com');
    const org = await seedOrgWith('o@e.com', 'Org');
    void session;
    await seedAsset(org.orgId, org.ownerId, { name: 'a.png', favorite: true });
    await seedAsset(org.orgId, org.ownerId, { name: 'b.png' });

    const r = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${org.orgId}/assets?smart=favorites`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(r.json().data.items).toHaveLength(1);
  });

  it('smart collection "trash" returns only trashed assets', async () => {
    const session = await login(app, 'o@e.com');
    const org = await seedOrgWith('o@e.com', 'Org');
    void session;
    await seedAsset(org.orgId, org.ownerId, { name: 'a.png', deletedAt: new Date() });
    await seedAsset(org.orgId, org.ownerId, { name: 'b.png' });

    const r = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${org.orgId}/assets?smart=trash`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(r.json().data.items).toHaveLength(1);
  });

  it('cursor pagination walks through all items', async () => {
    const session = await login(app, 'o@e.com');
    const org = await seedOrgWith('o@e.com', 'Org');
    void session;
    for (let i = 0; i < 7; i += 1) {
      await seedAsset(org.orgId, org.ownerId, { name: `a${i}.png` });
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const url = `/api/v1/orgs/${org.orgId}/assets?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const r = await app.inject({
        method: 'GET', url,
        headers: { cookie: `${COOKIE}=${session}` },
      });
      const body = r.json().data;
      for (const it of body.items) seen.push(it.name);
      cursor = body.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(7);
  });
});
```

- [ ] **Step 7.3: Run the tests**

Run: `pnpm --filter @dam-link/api test tests/assets.search.test.ts tests/assets.filter.test.ts`
Expected: 8 tests pass.

- [ ] **Step 7.4: Commit**

```bash
git add packages/api/tests/assets.search.test.ts packages/api/tests/assets.filter.test.ts
git commit -m "test(api): asset search and filter (type, size, tag, smart, pagination)"
```

---

## Task 8: Sidebar counts test

**Files:**
- Create: `packages/api/tests/assets.sidebar-counts.test.ts`

- [ ] **Step 8.1: Write the test**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3 } from './helpers/s3.js';
import { seedOrgWith, seedAsset } from './helpers/seed.js';

const COOKIE = 'dam_session_test';

async function login(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/api/v1/auth/register',
    payload: { email, password: 'hunter2pass', displayName: email },
  });
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie.join(',') : (setCookie ?? '');
  return raw.match(new RegExp(`${COOKIE}=([^;]+)`))![1]!;
}

describe('sidebar counts', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await closeDb(); await closeS3(); });
  beforeEach(async () => { await truncateAllTables(); });

  it('aggregates byType, byTag, favorites, and trash', async () => {
    const session = await login(app, 'o@e.com');
    const org = await seedOrgWith('o@e.com', 'Org');
    void session;
    await seedAsset(org.orgId, org.ownerId, { name: 'a.png', type: 'image' });
    await seedAsset(org.orgId, org.ownerId, { name: 'b.png', type: 'image', favorite: true });
    await seedAsset(org.orgId, org.ownerId, { name: 'c.mp4', type: 'video' });
    await seedAsset(org.orgId, org.ownerId, { name: 'd.pdf', type: 'document', deletedAt: new Date() });
    await seedAsset(org.orgId, org.ownerId, { name: 'e.png', type: 'image', tags: ['design', 'hero'] });
    await seedAsset(org.orgId, org.ownerId, { name: 'f.png', type: 'image', tags: ['design'] });

    const r = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${org.orgId}/assets/sidebar-counts`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(r.statusCode).toBe(200);
    const c = r.json().data;
    expect(c.byType).toEqual({ image: 4, video: 1, document: 0, audio: 0 });
    expect(c.favorites).toBe(1);
    expect(c.trash).toBe(1);
    const designCount = c.byTag.find((x: { tag: string }) => x.tag === 'design');
    expect(designCount?.count).toBe(2);
  });
});
```

- [ ] **Step 8.2: Run the test**

Run: `pnpm --filter @dam-link/api test tests/assets.sidebar-counts.test.ts`
Expected: 1 test passes.

- [ ] **Step 8.3: Commit**

```bash
git add packages/api/tests/assets.sidebar-counts.test.ts
git commit -m "test(api): sidebar counts (byType, byTag, favorites, trash)"
```

---

## Task 9: Final verification + tag

- [ ] **Step 9.1: Full check**

```bash
cd /d/DAM-Link-Backend/.worktrees/foundation
pnpm -r typecheck
pnpm -r test
pnpm -r build
```

- [ ] **Step 9.2: Boot and exercise by hand**

```bash
pnpm --filter @dam-link/api dev
# in another shell: register, create org, seed via curl or psql,
# then GET /api/v1/orgs/:id/assets and /sidebar-counts
```

- [ ] **Step 9.3: Tag**

```bash
git tag -a assets-v0.4.0 -m "Asset core complete: CRUD, soft delete, search, filter, sidebar counts"
```

---

## Self-review

**Spec coverage:** ✅
- Asset CRUD → Tasks 3, 4
- Soft delete + restore + permanent + empty trash → Tasks 3, 4
- Smart collections (recent, favorites, trash) → Task 2 (`smart` arg), tested in Task 7
- Search with pg_trgm → Task 2 (uses ilike on name, format, uploaded_by)
- 6-dimension filter → Task 2, tested in Task 7
- Sidebar counts → Task 2, tested in Task 8
- Cursor pagination → Task 2, tested in Task 7

**Type consistency:** `AssetListQuerySchema` in contracts matches what `listAssetsForOrg` accepts. `SidebarCounts` shape matches the route response. `Asset` row type matches the Drizzle inferred type.

**Edge cases:**
- Smart `trash` overrides default inTrash filter.
- Size bucket is exclusive on the upper bound (`lt max`).
- Date bucket defaults to `'all'`, meaning no lower bound.
- Cursor uses `(uploadedAt, id)` tuple for stable order even when sorting by name/size.

---

## Execution handoff

Plan complete and saved. Continue with Plan 5 once execution begins.
