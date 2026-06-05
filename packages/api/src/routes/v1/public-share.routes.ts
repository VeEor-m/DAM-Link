import type { App } from '../../types.js';
import { z } from 'zod';
import {
  PublicShareInfoSchema,
  UnlockShareLinkInputSchema,
} from '@dam-link/contracts';
import {
  getPublicShareInfo,
  unlockShareLink,
  getDownloadUrlForToken,
} from '../../services/share-links.service.js';

const PUBLIC_TIER = { max: 20, timeWindow: '1 minute' };

export async function registerPublicShareRoutes(app: App): Promise<void> {
  // GET /api/v1/share/:token
  app.get(
    '/api/v1/share/:token',
    {
      config: { rateLimit: PUBLIC_TIER },
      schema: {
        response: { 200: z.object({ data: PublicShareInfoSchema }) },
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
        response: { 200: z.object({ data: z.object({ downloadUrl: z.string().url() }) }) },
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
          200: z.object({ data: z.object({ downloadUrl: z.string().url() }) }),
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
