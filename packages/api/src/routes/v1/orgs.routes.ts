import type { App } from '../../types.js';
import {
  CreateOrgInputSchema,
  UpdateOrgInputSchema,
} from '@dam-link/contracts';
import {
  createOrgForUser,
  listOrgsForUser,
  renameOrg,
  deleteOrgAsOwner,
} from '../../services/orgs.service.js';
import { getOrgStats } from '../../services/members.service.js';
import { requireUser } from '../../plugins/auth.js';
import { requireRole } from '../../plugins/org-context.js';

function toOrg(o: { id: string; name: string; slug: string; createdAt: Date }) {
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    createdAt: o.createdAt.toISOString(),
  };
}

// JSON-schema response objects (Zod fails on Fastify response schema serialisation).
// See memory/gotchas.md.
const OrgJsonSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, format: 'uuid' },
    name: { type: 'string' as const },
    slug: { type: 'string' as const },
    createdAt: { type: 'string' as const, format: 'date-time' },
  },
};

const RoleEnum = { type: 'string' as const, enum: ['owner', 'editor', 'viewer'] };

const CreateOrgResponseSchema = {
  type: 'object' as const,
  properties: {
    data: {
      type: 'object' as const,
      properties: { org: OrgJsonSchema, role: RoleEnum },
    },
  },
};

const ListOrgsResponseSchema = {
  type: 'object' as const,
  properties: {
    data: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: { org: OrgJsonSchema, role: RoleEnum },
      },
    },
  },
};

const GetOrgResponseSchema = {
  type: 'object' as const,
  properties: {
    data: {
      type: 'object' as const,
      properties: {
        org: OrgJsonSchema,
        role: RoleEnum,
        memberCount: { type: 'number' as const },
        assetCount: { type: 'number' as const },
      },
    },
  },
};

const UpdateOrgResponseSchema = {
  type: 'object' as const,
  properties: {
    data: {
      type: 'object' as const,
      properties: { org: OrgJsonSchema },
    },
  },
};

const NullResponseSchema = { type: 'null' as const };

export async function registerOrgsRoutes(app: App): Promise<void> {
  // POST /api/v1/orgs — create new org; caller becomes Owner
  app.post(
    '/api/v1/orgs',
    {
      preHandler: [requireUser],
      schema: {
        body: CreateOrgInputSchema,
        response: { 200: CreateOrgResponseSchema },
        tags: ['orgs'],
        summary: 'Create a new org. The caller becomes the Owner.',
      },
    },
    async (req) => {
      const body = CreateOrgInputSchema.parse(req.body);
      const { org, role } = await createOrgForUser(req.user!.id, body);
      return { data: { org: toOrg(org), role } };
    },
  );

  // GET /api/v1/orgs — list orgs the caller belongs to
  app.get(
    '/api/v1/orgs',
    {
      preHandler: [requireUser],
      schema: {
        response: { 200: ListOrgsResponseSchema },
        tags: ['orgs'],
        summary: 'List orgs the current user belongs to',
      },
    },
    async (req) => {
      const items = await listOrgsForUser(req.user!.id);
      return { data: items.map(({ org, role }) => ({ org: toOrg(org), role })) };
    },
  );

  // GET /api/v1/orgs/:orgId — org detail with member/asset counts
  app.get(
    '/api/v1/orgs/:orgId',
    {
      preHandler: [requireUser, requireRole('viewer')],
      schema: {
        response: { 200: GetOrgResponseSchema },
        tags: ['orgs'],
        summary: 'Get org detail with counts',
      },
    },
    async (req) => {
      const ctx = req.orgContext!;
      const { memberCount, assetCount } = await getOrgStats(ctx.org.id);
      return { data: { org: toOrg(ctx.org), role: ctx.role, memberCount, assetCount } };
    },
  );

  // PATCH /api/v1/orgs/:orgId — Owner only
  app.patch(
    '/api/v1/orgs/:orgId',
    {
      preHandler: [requireUser, requireRole('owner')],
      schema: {
        body: UpdateOrgInputSchema,
        response: { 200: UpdateOrgResponseSchema },
        tags: ['orgs'],
        summary: 'Rename an org (Owner only)',
      },
    },
    async (req) => {
      const body = UpdateOrgInputSchema.parse(req.body);
      const org = await renameOrg(req.orgContext!.org.id, body.name!);
      return { data: { org: toOrg(org) } };
    },
  );

  // DELETE /api/v1/orgs/:orgId — Owner only; refuses if last owner
  app.delete(
    '/api/v1/orgs/:orgId',
    {
      preHandler: [requireUser, requireRole('owner')],
      schema: { response: { 204: NullResponseSchema }, tags: ['orgs'], summary: 'Delete an org' },
    },
    async (req, reply) => {
      await deleteOrgAsOwner(req.user!.id, req.orgContext!.org.id);
      return reply.status(204).send();
    },
  );
}
