import type { App } from '../../types.js';
import {
  InviteMemberInputSchema,
  UpdateMemberRoleInputSchema,
} from '@dam-link/contracts';
import {
  inviteMember,
  listMembers,
  changeMemberRole,
  removeMember,
} from '../../services/members.service.js';
import { requireUser } from '../../plugins/auth.js';
import { requireRole } from '../../plugins/org-context.js';

// JSON-schema response objects (Zod fails on Fastify response schema serialisation).
// See memory/gotchas.md.
const RoleEnum = { type: 'string' as const, enum: ['owner', 'editor', 'viewer'] };

const UserJsonSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, format: 'uuid' },
    email: { type: 'string' as const, format: 'email' },
    displayName: { type: 'string' as const },
  },
};

const MembershipJsonSchema = {
  type: 'object' as const,
  properties: {
    userId: { type: 'string' as const, format: 'uuid' },
    orgId: { type: 'string' as const, format: 'uuid' },
    role: RoleEnum,
    createdAt: { type: 'string' as const, format: 'date-time' },
    user: UserJsonSchema,
  },
};

const ListMembersResponseSchema = {
  type: 'object' as const,
  properties: {
    data: {
      type: 'array' as const,
      items: MembershipJsonSchema,
    },
  },
};

const MembershipResponseSchema = {
  type: 'object' as const,
  properties: {
    data: MembershipJsonSchema,
  },
};

const NullResponseSchema = { type: 'null' as const };

export async function registerMembersRoutes(app: App): Promise<void> {
  // GET /api/v1/orgs/:orgId/members — anyone in the org can see
  app.get(
    '/api/v1/orgs/:orgId/members',
    {
      preHandler: [requireUser, requireRole('viewer')],
      schema: {
        response: { 200: ListMembersResponseSchema },
        tags: ['members'],
        summary: 'List members of an org',
      },
    },
    async (req) => {
      const rows = await listMembers(req.orgContext!.org.id);
      return {
        data: rows.map((m) => ({
          userId: m.userId,
          orgId: m.orgId,
          role: m.role,
          createdAt: m.createdAt.toISOString(),
          user: m.user,
        })),
      };
    },
  );

  // POST /api/v1/orgs/:orgId/members — invite by email; Owner only
  app.post(
    '/api/v1/orgs/:orgId/members',
    {
      preHandler: [requireUser, requireRole('owner')],
      schema: {
        body: InviteMemberInputSchema,
        response: { 200: MembershipResponseSchema },
        tags: ['members'],
        summary: 'Invite an existing user (Owner only)',
      },
    },
    async (req) => {
      const body = InviteMemberInputSchema.parse(req.body);
      const m = await inviteMember(req.orgContext!.org.id, body);
      const list = await listMembers(req.orgContext!.org.id);
      const joined = list.find((x) => x.userId === m.userId)!;
      return {
        data: {
          userId: joined.userId,
          orgId: joined.orgId,
          role: joined.role,
          createdAt: joined.createdAt.toISOString(),
          user: joined.user,
        },
      };
    },
  );

  // PATCH /api/v1/orgs/:orgId/members/:userId — change role; Owner only
  app.patch(
    '/api/v1/orgs/:orgId/members/:userId',
    {
      preHandler: [requireUser, requireRole('owner')],
      schema: {
        body: UpdateMemberRoleInputSchema,
        response: { 200: MembershipResponseSchema },
        tags: ['members'],
        summary: 'Change a member’s role (Owner only)',
      },
    },
    async (req) => {
      const { userId } = req.params as { userId: string };
      const body = UpdateMemberRoleInputSchema.parse(req.body);
      const m = await changeMemberRole(req.orgContext!.org.id, userId, body.role);
      return {
        data: {
          userId: m.userId,
          orgId: m.orgId,
          role: m.role,
          createdAt: m.createdAt.toISOString(),
          user: { id: '', email: '', displayName: '' },
        },
      };
    },
  );

  // DELETE /api/v1/orgs/:orgId/members/:userId — remove; Owner only
  app.delete(
    '/api/v1/orgs/:orgId/members/:userId',
    {
      preHandler: [requireUser, requireRole('owner')],
      schema: { response: { 204: NullResponseSchema }, tags: ['members'], summary: 'Remove a member (Owner only)' },
    },
    async (req, reply) => {
      const { userId } = req.params as { userId: string };
      await removeMember(req.orgContext!.org.id, userId);
      return reply.status(204).send();
    },
  );
}
