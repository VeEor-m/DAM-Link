import { z } from 'zod';
import { IdSchema, AssetTypeSchema } from './common.js';

/** Hard upper bound on a single file. ~5GB. */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 * 1024;

/** Mime types we accept. */
export const ALLOWED_MIME_TYPES = [
  // images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
  // video
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/x-msvideo',
  // audio
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/x-m4a', 'audio/flac',
  // documents
  'application/pdf', 'application/zip', 'application/x-zip-compressed',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'text/plain', 'text/markdown',
] as const;

export const MimeTypeSchema = z.string().refine(
  (m) => (ALLOWED_MIME_TYPES as readonly string[]).includes(m),
  { message: 'Mime type not allowed' },
);

/** Initiate upload body. */
export const InitiateUploadInputSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: MimeTypeSchema,
  size: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
  type: AssetTypeSchema,
  format: z.string().min(1).max(16),
});
export type InitiateUploadInput = z.infer<typeof InitiateUploadInputSchema>;

/** Initiate upload response. */
export const InitiateUploadResponseSchema = z.object({
  assetId: IdSchema,
  uploadUrl: z.string().url(),
  objectKey: z.string(),
  expiresInSec: z.number().int().positive(),
});
export type InitiateUploadResponse = z.infer<typeof InitiateUploadResponseSchema>;

/** Finalize upload body. Plan 6 will add width/height/duration. */
export const FinalizeUploadInputSchema = z.object({
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional(),
});
export type FinalizeUploadInput = z.infer<typeof FinalizeUploadInputSchema>;
