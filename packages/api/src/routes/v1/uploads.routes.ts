import type { App } from '../../types.js';
import { InitiateUploadInputSchema } from '@dam-link/contracts';
import { initiateUpload } from '../../services/uploads.service.js';
import { requireUser } from '../../plugins/auth.js';
import { requireRole } from '../../plugins/org-context.js';
import { RATE_TIERS } from '../../plugins/rate-limit.js';

// JSON-schema response objects (Zod fails on Fastify response schema serialisation).
// See memory/gotchas.md.
const InitiateUploadResponseJsonSchema = {
  type: 'object' as const,
  properties: {
    assetId: { type: 'string' as const, format: 'uuid' },
    uploadUrl: { type: 'string' as const, format: 'uri' },
    objectKey: { type: 'string' as const },
    expiresInSec: { type: 'integer' as const, minimum: 1 },
  },
  required: ['assetId', 'uploadUrl', 'objectKey', 'expiresInSec'],
} as const;

const InitiateUploadEnvelopeJsonSchema = {
  type: 'object' as const,
  properties: { data: InitiateUploadResponseJsonSchema },
  required: ['data'],
} as const;

export async function registerUploadRoutes(app: App): Promise<void> {
  // POST /api/v1/orgs/:orgId/uploads
  app.post(
    '/api/v1/orgs/:orgId/uploads',
    {
      preHandler: [requireUser, requireRole('editor')],
      config: { rateLimit: RATE_TIERS.upload },
      schema: {
        body: InitiateUploadInputSchema,
        response: { 200: InitiateUploadEnvelopeJsonSchema },
        tags: ['uploads'],
        summary: 'Initiate an upload. Returns a presigned PUT URL and a draft assetId.',
      },
    },
    async (req) => {
      const body = InitiateUploadInputSchema.parse(req.body);
      const result = await initiateUpload(req.orgContext!.org.id, req.user!.id, body);
      return { data: result };
    },
  );
}
