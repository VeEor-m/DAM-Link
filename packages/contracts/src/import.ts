import { z } from 'zod';
import { AssetTypeSchema, IsoDateTimeSchema } from './common.js';

/** One item in the manifest.json. */
export const ImportAssetEntrySchema = z.object({
  /** Client-side id (not used as a server id). */
  clientId: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  type: AssetTypeSchema,
  format: z.string().min(1).max(16),
  /** Original byte size, if known (often unknown for localStorage exports). */
  size: z.number().int().nonnegative().optional(),
  mimeType: z.string().min(1).max(127).optional(),
  /** Optional dimensions if known. */
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional(),
  uploadedAt: IsoDateTimeSchema.optional(),
  tags: z.array(z.string().min(1).max(40)).max(50).default([]),
  favorite: z.boolean().default(false),
  /** Filename in the multipart form for the thumbnail, if any. */
  thumbnailFilename: z.string().optional(),
});
export type ImportAssetEntry = z.infer<typeof ImportAssetEntrySchema>;

export const ImportManifestSchema = z.object({
  /** Schema version of the manifest, e.g. 1. */
  schemaVersion: z.literal(1),
  /** Where the manifest came from. */
  source: z.enum(['dam-link-localstorage']),
  /** When the export was generated. */
  exportedAt: IsoDateTimeSchema,
  /** The user who exported, by email (informational only). */
  exportedBy: z.string().email().optional(),
  /** The assets to import. */
  assets: z.array(ImportAssetEntrySchema).min(1).max(1000),
});
export type ImportManifest = z.infer<typeof ImportManifestSchema>;

/** Response. */
export const ImportResultSchema = z.object({
  imported: z.array(z.object({
    clientId: z.string(),
    serverId: z.string().uuid(),
    name: z.string(),
  })),
  skipped: z.array(z.object({
    clientId: z.string(),
    reason: z.string(),
  })),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;
