import { z } from 'zod';

/** UUID v4 string. */
export const IdSchema = z.string().uuid();
export type Id = z.infer<typeof IdSchema>;

/** ISO 8601 datetime string. */
export const IsoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime());
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/** Coarse asset classification. */
export const AssetTypeSchema = z.enum(['image', 'video', 'document', 'audio']);
export type AssetType = z.infer<typeof AssetTypeSchema>;

/** RBAC role within an org. */
export const RoleSchema = z.enum(['owner', 'editor', 'viewer']);
export type Role = z.infer<typeof RoleSchema>;

/** Asset visibility scope. */
export const VisibilitySchema = z.enum(['private', 'org', 'link']);
export type Visibility = z.infer<typeof VisibilitySchema>;

/** Upload lifecycle state. */
export const AssetStatusSchema = z.enum(['pending', 'ready', 'failed']);
export type AssetStatus = z.infer<typeof AssetStatusSchema>;

/** Cursor-based pagination input. */
export const PaginationInputSchema = z.object({
  cursor: z.string().nullish(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type PaginationInput = z.infer<typeof PaginationInputSchema>;

/** Cursor-based pagination output. */
export const PageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });

/** Standard error envelope returned by every error response. */
export const ErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

/** Standard success wrapper for single-item responses. */
export const OkSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ data: item });

/** Size bucket filter (matches frontend). */
export const SizeBucketSchema = z.enum(['small', 'medium', 'large']);
export type SizeBucket = z.infer<typeof SizeBucketSchema>;

/** Date bucket filter. */
export const DateBucketSchema = z.enum(['7d', '30d', '90d', 'all']);
export type DateBucket = z.infer<typeof DateBucketSchema>;

/** View mode for the browser pane. */
export const ViewModeSchema = z.enum(['grid', 'list']);
export type ViewMode = z.infer<typeof ViewModeSchema>;

/** Smart sidebar collections. */
export const SmartCollectionSchema = z.enum(['recent', 'favorites', 'trash']);
export type SmartCollection = z.infer<typeof SmartCollectionSchema>;

/** Sidebar selection tagged union (mirrors frontend). */
export const SidebarSelectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('type'), type: AssetTypeSchema }),
  z.object({ kind: z.literal('tag'), tag: z.string().min(1) }),
  z.object({ kind: z.literal('smart'), smart: SmartCollectionSchema }),
]);
export type SidebarSelection = z.infer<typeof SidebarSelectionSchema>;
