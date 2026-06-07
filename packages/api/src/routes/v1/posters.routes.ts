import type { App } from '../../types.js';
import { requireUser } from '../../plugins/auth.js';
import { requireRole } from '../../plugins/org-context.js';
import { regeneratePosterHandler } from './posters.handlers.js';

export async function postersRoutes(app: App): Promise<void> {
  // POST /api/v1/orgs/:orgId/assets/:id/regenerate-poster — Editor+
  // Note: registerOrgContext is registered globally in server.ts and sets
  // req.orgContext via a preHandler hook, so the per-route preHandler chain
  // only needs requireUser + requireRole.
  app.post(
    '/api/v1/orgs/:orgId/assets/:id/regenerate-poster',
    {
      preHandler: [requireUser, requireRole('editor')],
    },
    regeneratePosterHandler,
  );
}
