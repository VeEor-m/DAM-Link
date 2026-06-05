import type { App } from '../../types.js';
import { z } from 'zod';
import { ShareLinkSchema, CreateShareLinkInputSchema } from '@dam-link/contracts';
import {
  createShareLinkForAsset,
  listShareLinks,
  revokeLinkAsOwner,
  toPublicShareLink,
} from '../../services/share-links.service.js';
import { requireUser } from '../../plugins/auth.js';
import { requireRole } from '../../plugins/org-context.js';

export async function registerShareLinkRoutes(app: App): Promise<void> {
  // POST /api/v1/orgs/:orgId/assets/:id/share-links — Editor+
  app.post(
    '/api/v1/orgs/:orgId/assets/:id/share-links',
    {
      preHandler: [requireUser, requireRole('editor')],
      schema: {
        body: CreateShareLinkInputSchema,
        response: { 200: z.object({ data: ShareLinkSchema }) },
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
        response: { 200: z.object({ data: z.array(ShareLinkSchema) }) },
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
      schema: { response: { 204: z.null() }, tags: ['share-links'], summary: 'Revoke a share link' },
    },
    async (req, reply) => {
      const { linkId } = req.params as { linkId: string };
      await revokeLinkAsOwner(req.orgContext!.org.id, linkId);
      return reply.status(204).send();
    },
  );
}
