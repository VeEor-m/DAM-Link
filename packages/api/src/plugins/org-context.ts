import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from './error-handler.js';
import { getOrgContextForUser } from '../services/orgs.service.js';
import type { Role } from '@dam-link/contracts';

const ROLE_ORDER: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

/**
 * Mounts a preHandler that resolves `:orgId` to the user's membership in that org.
 * Mutates req.orgContext. 404 if the org doesn't exist, 403 if the user isn't a member.
 *
 * This is the single chokepoint for tenant isolation — every org-scoped route
 * uses it. NEVER access an org's data without going through this.
 */
export async function registerOrgContext(app: FastifyInstance): Promise<void> {
  app.decorateRequest('orgContext', null);

  app.addHook('preHandler', async (req: FastifyRequest) => {
    const orgId = (req.params as { orgId?: unknown })?.orgId;
    if (typeof orgId !== 'string' || orgId.length === 0) {
      // Not an org-scoped route — leave orgContext null.
      return;
    }

    if (!req.user) {
      // The route handler is misconfigured; requireUser should have run first.
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }

    const ctx = await getOrgContextForUser(req.user.id, orgId);
    if (!ctx) {
      // Don't distinguish 404 from 403 to prevent org enumeration.
      throw new AppError(403, 'ORG_FORBIDDEN', 'Not a member of this org');
    }
    req.orgContext = ctx;
  });
}

/**
 * Factory for a preHandler that enforces a minimum role.
 * Use as: `{ preHandler: [requireUser, requireRole('editor')] }`
 */
export function requireRole(min: Role) {
  return async (req: FastifyRequest) => {
    if (!req.orgContext) {
      throw new AppError(500, 'ORG_CONTEXT_MISSING', 'orgContext not set');
    }
    if (ROLE_ORDER[req.orgContext.role] < ROLE_ORDER[min]) {
      throw new AppError(403, 'INSUFFICIENT_ROLE', `Requires ${min} or higher`);
    }
  };
}
