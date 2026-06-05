import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, RoleSchema, PageSchema } from './common.js';

/** Org row. */
export const OrgSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(80),
  createdAt: IsoDateTimeSchema,
});
export type Org = z.infer<typeof OrgSchema>;

/** Membership row (the join table). */
export const MembershipSchema = z.object({
  userId: IdSchema,
  orgId: IdSchema,
  role: RoleSchema,
  createdAt: IsoDateTimeSchema,
  // joined in
  user: z.object({
    id: IdSchema,
    email: z.string().email(),
    displayName: z.string(),
  }),
});
export type Membership = z.infer<typeof MembershipSchema>;

/** Create-org body. */
export const CreateOrgInputSchema = z.object({
  name: z.string().min(1).max(80),
});
export type CreateOrgInput = z.infer<typeof CreateOrgInputSchema>;

/** Update-org body. */
export const UpdateOrgInputSchema = z.object({
  name: z.string().min(1).max(80).optional(),
});
export type UpdateOrgInput = z.infer<typeof UpdateOrgInputSchema>;

/** Invite body. */
export const InviteMemberInputSchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(['editor', 'viewer']), // never invite as Owner via this endpoint
});
export type InviteMemberInput = z.infer<typeof InviteMemberInputSchema>;

/** Update-member-role body. */
export const UpdateMemberRoleInputSchema = z.object({
  role: z.enum(['owner', 'editor', 'viewer']),
});
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleInputSchema>;

/** Org with caller-context. */
export const OrgContextSchema = z.object({
  org: OrgSchema,
  role: RoleSchema,
  memberCount: z.number().int().nonnegative(),
  assetCount: z.number().int().nonnegative(),
});
export type OrgContext = z.infer<typeof OrgContextSchema>;

/** List orgs the current user belongs to. */
export const ListUserOrgsResponseSchema = z.object({
  data: z.array(
    z.object({
      org: OrgSchema,
      role: RoleSchema,
    }),
  ),
});

/** Generic asset list page factory (re-exported for the asset routes to consume). */
export const AssetPageSchema = <T extends z.ZodTypeAny>(item: T) => PageSchema(item);
