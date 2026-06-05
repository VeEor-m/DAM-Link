import type { App } from '../../types.js';
import { CreateShareLinkInputSchema } from '@dam-link/contracts';
import {
  createShareLinkForAsset,
  listShareLinks,
  revokeLinkAsOwner,
  toPublicShareLink,
} from '../../services/share-links.service.js';
import { requireUser } from '../../plugins/auth.js';
import { requireRole } from '../../plugins/org-context.js';

// JSON-schema response objects (Zod fails on Fastify response schema serialisation).
// See memory/gotchas.md.
const ShareLinkJsonSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, format: 'uuid' },
    assetId: { type: 'string' as const, format: 'uuid' },
    orgId: { type: 'string' as const, format: 'uuid' },
    token: { type: 'string' as const, minLength: 20, maxLength: 64 },
    createdBy: { type: 'string' as const, format: 'uuid' },
    createdAt: { type: 'string' as const, format: 'date-time' },
    expiresAt: { type: ['string', 'null'] as const, format: 'date-time' },
    revokedAt: { type: ['string', 'null'] as const, format: 'date-time' },
    hasPassword: { type: 'boolean' as const },
  },
  required: [
    'id',
    'assetId',
    'orgId',
    'token',
    'createdBy',
    'createdAt',
    'expiresAt',
    'revokedAt',
    'hasPassword',
  ],
} as const;

const ShareLinkResponseSchema = {
  type: 'object' as const,
  properties: { data: ShareLinkJsonSchema },
  required: ['data'],
} as const;

const ShareLinkListResponseSchema = {
  type: 'object' as const,
  properties: { data: { type: 'array' as const, items: ShareLinkJsonSchema } },
  required: ['data'],
} as const;

const NullResponseSchema = { type: 'null' as const };

export async function registerShareLinkRoutes(app: App): Promise<void> {
  // POST /api/v1/orgs/:orgId/assets/:id/share-links — Editor+
  app.post(
    '/api/v1/orgs/:orgId/assets/:id/share-links',
    {
      preHandler: [requireUser, requireRole('editor')],
      schema: {
        body: CreateShareLinkInputSchema,
        response: { 200: ShareLinkResponseSchema },
        tags: ['share-links'],
        summary: 'Create a share link for an asset',
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const body = CreateShareLinkInputSchema.parse(req.body);
      const link = await createShareLinkForAsset(
        req.orgContext!.org.id,
        req.user!.id,
        id,
        body,
      );
      return { data: toPublicShareLink(link) };
    },
  );

  // GET /api/v1/orgs/:orgId/assets/:id/share-links — Viewer+
  app.get(
    '/api/v1/orgs/:orgId/assets/:id/share-links',
    {
      preHandler: [requireUser, requireRole('viewer')],
      schema: {
        response: { 200: ShareLinkListResponseSchema },
        tags: ['share-links'],
        summary: 'List share links for an asset',
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const links = await listShareLinks(req.orgContext!.org.id, id);
      return { data: links.map(toPublicShareLink) };
    },
  );

  // DELETE /api/v1/orgs/:orgId/share-links/:linkId — Owner only
  app.delete(
    '/api/v1/orgs/:orgId/share-links/:linkId',
    {
      preHandler: [requireUser, requireRole('owner')],
      schema: { response: { 204: NullResponseSchema }, tags: ['share-links'], summary: 'Revoke a share link' },
    },
    async (req, reply) => {
      const { linkId } = req.params as { linkId: string };
      await revokeLinkAsOwner(req.orgContext!.org.id, linkId);
      return reply.status(204).send();
    },
  );
}
