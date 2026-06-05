import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.js';

/** Password rules: 8-128 chars, at least one letter and one digit. */
export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((s) => /[A-Za-z]/.test(s), 'Password must contain a letter')
  .refine((s) => /\d/.test(s), 'Password must contain a digit');
export type Password = z.infer<typeof PasswordSchema>;

/** Public user shape (no password hash, no internal fields). */
export const PublicUserSchema = z.object({
  id: IdSchema,
  email: z.string().email(),
  displayName: z.string(),
  createdAt: IsoDateTimeSchema,
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

/** Public session shape. */
export const PublicSessionSchema = z.object({
  id: z.string(), // session token
  userId: IdSchema,
  createdAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  lastSeenAt: IsoDateTimeSchema,
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
});
export type PublicSession = z.infer<typeof PublicSessionSchema>;

/** Register body. */
export const RegisterInputSchema = z.object({
  email: z.string().email().max(254),
  password: PasswordSchema,
  displayName: z.string().min(1).max(80),
  turnstileToken: z.string().min(1).optional(),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

/** Login body. */
export const LoginInputSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
  turnstileToken: z.string().min(1).optional(),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

/** Register/Login response: returns the session token (caller sets cookie) and user. */
export const AuthSuccessSchema = z.object({
  user: PublicUserSchema,
  session: PublicSessionSchema,
});
export type AuthSuccess = z.infer<typeof AuthSuccessSchema>;

/** /me response: user plus the list of orgs the user belongs to (Plan 3 fills this in). */
export const MeResponseSchema = z.object({
  user: PublicUserSchema,
  orgs: z.array(
    z.object({
      id: IdSchema,
      name: z.string(),
      slug: z.string(),
      role: z.enum(['owner', 'editor', 'viewer']),
    }),
  ),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
