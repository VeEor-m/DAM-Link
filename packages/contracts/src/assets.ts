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
  // Presigned URL to the thumbnail, attached by the list/detail responses
  // (server-side enrichment). Signature expires (default 1h); clients must
  // re-fetch when stale. `null` when no thumbnail has been generated yet;
  // field omitted when the asset type doesn't support thumbnails.
  thumbnailUrl: z.string().url().nullable().optional(),
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
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  inTrash: z
    .enum(['true', 'false'])
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
export type AssetPage = z.infer<typeof AssetPageSchema>;

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

/** Response for GET /api/v1/orgs/:orgId/assets/:id/download-url — presigned GET URL. */
export const DownloadUrlResponseSchema = z.object({
  data: z.object({
    downloadUrl: z.string().url(),
  }),
});
export type DownloadUrlResponse = z.infer<typeof DownloadUrlResponseSchema>;
