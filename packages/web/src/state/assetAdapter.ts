import type { Asset as ApiAsset } from '@dam-link/contracts';
import type { Asset as LocalAsset } from './types.js';

/**
 * Map the API's `Asset` shape to the UI's `Asset` shape.
 *
 * Two adjustments:
 *  - `width ?? null` / `height ?? null` / `duration ?? null` → `undefined`
 *    so optional-chaining (`a.width?.toFixed(0)`) is type-safe.
 *  - `thumbnailUrl` (presigned, expires) is renamed to `_thumbnailUrl`
 *    (leading underscore = runtime-only, never persisted). The `previewDataUrl`
 *    legacy field stays undefined.
 *
 * Single source of truth for the API↔UI shape mapping. Don't bypass this
 * by passing API responses directly into reducer actions.
 */
export function apiAssetToLocal(a: ApiAsset): LocalAsset {
  return {
    id: a.id,
    orgId: a.orgId,
    name: a.name,
    type: a.type,
    format: a.format,
    size: a.size,
    uploadedAt: a.uploadedAt,
    uploadedBy: a.uploadedBy,
    tags: a.tags,
    favorite: a.favorite,
    deletedAt: a.deletedAt,
    width: a.width ?? undefined,
    height: a.height ?? undefined,
    duration: a.duration ?? undefined,
    _thumbnailUrl: a.thumbnailUrl ?? null,
  };
}
