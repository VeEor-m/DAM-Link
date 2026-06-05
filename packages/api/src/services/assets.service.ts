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
import type { Asset, NewAsset } from '../db/schema.js';
import type {
  CreateAssetInput,
  UpdateAssetInput,
  AssetListQuery,
  SidebarCounts,
} from '@dam-link/contracts';

/** Adds a presigned thumbnail URL to an asset (if it has a thumbnail). */
async function withThumbnailUrl<T extends { thumbnailKey?: string | null }>(
  a: T,
): Promise<T & { thumbnailUrl: string | null }> {
  if (!a.thumbnailKey) return { ...a, thumbnailUrl: null };
  // presignGet takes a bare S3 object key; the bucket is prefixed internally.
  const url = await presignGet(a.thumbnailKey, 3600);
  return { ...a, thumbnailUrl: url };
}

/** Asset with a presigned thumbnail URL. Returned by all read paths. */
export type AssetWithThumbnail = Awaited<ReturnType<typeof withThumbnailUrl>>;

const MAX_PAGE_SIZE = 200;

export async function listAssetsForOrg(
  orgId: string,
  query: AssetListQuery,
): Promise<{ items: AssetWithThumbnail[]; nextCursor: string | null }> {
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

export async function getAsset(
  orgId: string,
  id: string,
): Promise<Asset & { thumbnailUrl: string | null }> {
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
