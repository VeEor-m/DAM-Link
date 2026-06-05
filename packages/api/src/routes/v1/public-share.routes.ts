import type { App } from '../../types.js';
import { UnlockShareLinkInputSchema } from '@dam-link/contracts';
import {
  getPublicShareInfo,
  unlockShareLink,
  getDownloadUrlForToken,
} from '../../services/share-links.service.js';

const PUBLIC_TIER = { max: 20, timeWindow: '1 minute' };

// JSON-schema response objects (Zod fails on Fastify response schema serialisation).
// See memory/gotchas.md.
const AssetTypeEnum = { type: 'string' as const, enum: ['image', 'video', 'document', 'audio'] };

const PublicShareInfoJsonSchema = {
  type: 'object' as const,
  properties: {
    asset: {
      type: 'object' as const,
      properties: {
        id: { type: 'string' as const, format: 'uuid' },
        name: { type: 'string' as const },
        type: AssetTypeEnum,
        format: { type: 'string' as const },
        size: { type: 'integer' as const, minimum: 0 },
      },
      required: ['id', 'name', 'type', 'format', 'size'],
    },
    hasPassword: { type: 'boolean' as const },
    expiresAt: { type: ['string', 'null'] as const, format: 'date-time' },
    thumbnailUrl: { type: ['string', 'null'] as const, format: 'uri' },
  },
  required: ['asset', 'hasPassword', 'expiresAt', 'thumbnailUrl'],
} as const;

const PublicShareInfoResponseSchema = {
  type: 'object' as const,
  properties: { data: PublicShareInfoJsonSchema },
  required: ['data'],
} as const;

const DownloadUrlJsonSchema = {
  type: 'object' as const,
  properties: {
    downloadUrl: { type: 'string' as const, format: 'uri' },
  },
  required: ['downloadUrl'],
} as const;

const DownloadUrlResponseSchema = {
  type: 'object' as const,
  properties: { data: DownloadUrlJsonSchema },
  required: ['data'],
} as const;

export async function registerPublicShareRoutes(app: App): Promise<void> {
  // GET /api/v1/share/:token
  app.get(
    '/api/v1/share/:token',
    {
      config: { rateLimit: PUBLIC_TIER },
      schema: {
        response: { 200: PublicShareInfoResponseSchema },
        tags: ['public-share'],
        summary: 'Get public info for a share link (no auth)',
      },
    },
    async (req) => {
      const { token } = req.params as { token: string };
      const info = await getPublicShareInfo(token);
      return { data: info };
    },
  );

  // POST /api/v1/share/:token/unlock
  app.post(
    '/api/v1/share/:token/unlock',
    {
      config: { rateLimit: PUBLIC_TIER },
      schema: {
        body: UnlockShareLinkInputSchema,
        response: { 200: DownloadUrlResponseSchema },
        tags: ['public-share'],
        summary: 'Unlock a password-protected share link',
      },
    },
    async (req) => {
      const { token } = req.params as { token: string };
      const { password } = UnlockShareLinkInputSchema.parse(req.body);
      const result = await unlockShareLink(token, password);
      return { data: result };
    },
  );

  // GET /api/v1/share/:token/download
  app.get(
    '/api/v1/share/:token/download',
    {
      config: { rateLimit: PUBLIC_TIER },
      schema: {
        response: {
          200: DownloadUrlResponseSchema,
        },
        tags: ['public-share'],
        summary: 'Get a short-lived download URL (no password)',
      },
    },
    async (req) => {
      const { token } = req.params as { token: string };
      const result = await getDownloadUrlForToken(token);
      return { data: result };
    },
  );
}
