import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.js';

export const ShareLinkSchema = z.object({
  id: IdSchema,
  assetId: IdSchema,
  orgId: IdSchema,
  token: z.string().min(20).max(64), // 32 bytes base64url = 43 chars
  createdBy: IdSchema,
  createdAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema.nullable(),
  revokedAt: IsoDateTimeSchema.nullable(),
  hasPassword: z.boolean(), // never expose the hash
});
export type ShareLink = z.infer<typeof ShareLinkSchema>;

/** Create-share-link body. */
export const CreateShareLinkInputSchema = z
  .object({
    expiresAt: IsoDateTimeSchema.nullish(),
    password: z.string().min(8).max(128).optional(),
  })
  .refine((v) => v.password === undefined || v.password.length >= 8, {
    message: 'Password must be at least 8 characters',
  });
export type CreateShareLinkInput = z.infer<typeof CreateShareLinkInputSchema>;

/** Public-facing asset info exposed via /api/v1/share/:token. */
export const PublicShareInfoSchema = z.object({
  asset: z.object({
    id: IdSchema,
    name: z.string(),
    type: z.enum(['image', 'video', 'document', 'audio']),
    format: z.string(),
    size: z.number().int().nonnegative(),
  }),
  hasPassword: z.boolean(),
  expiresAt: IsoDateTimeSchema.nullable(),
  thumbnailUrl: z.string().url().nullable(),
});
export type PublicShareInfo = z.infer<typeof PublicShareInfoSchema>;

/** Unlock body. */
export const UnlockShareLinkInputSchema = z.object({
  password: z.string().min(1).max(128),
});
export type UnlockShareLinkInput = z.infer<typeof UnlockShareLinkInputSchema>;
