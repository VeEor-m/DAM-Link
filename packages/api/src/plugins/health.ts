import type { App } from '../types.js';
import { z } from 'zod';
import { pingS3 } from '../lib/s3.js';
import { pingDb } from '../db/client.js';

const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'down']),
  s3: z.enum(['ok', 'down']),
  version: z.string(),
  uptime: z.number(),
});

export async function registerHealth(app: App): Promise<void> {
  const start = Date.now();

  app.get(
    '/healthz',
    {
      schema: {
        response: { 200: HealthResponseSchema, 503: HealthResponseSchema },
        tags: ['ops'],
        summary: 'Liveness + readiness probe',
      },
    },
    async (_req, reply) => {
      const [dbOk, s3Ok] = await Promise.all([pingDb(), pingS3()]);
      const ok = dbOk && s3Ok;
      const body = {
        status: ok ? ('ok' as const) : ('degraded' as const),
        db: dbOk ? ('ok' as const) : ('down' as const),
        s3: s3Ok ? ('ok' as const) : ('down' as const),
        version: '0.0.0',
        uptime: Math.floor((Date.now() - start) / 1000),
      };
      return reply.status(ok ? 200 : 503).send(body);
    },
  );

  app.get(
    '/version',
    {
      schema: {
        response: {
          200: z.object({
            version: z.string(),
            commit: z.string().nullable(),
            buildTime: z.string().nullable(),
          }),
        },
        tags: ['ops'],
        summary: 'Build version metadata',
      },
    },
    async () => ({
      version: '0.0.0',
      commit: process.env.GIT_COMMIT ?? null,
      buildTime: process.env.BUILD_TIME ?? null,
    }),
  );
}
