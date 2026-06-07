import type { App } from '../types.js';
import { pingS3 } from '../lib/s3.js';
import { pingDb } from '../db/client.js';
import { getPoolStats } from '../db/observe.js';

// Plain JSON schema (avoids zod-to-json-schema quirks with Fastify's
// response serializer). We validate the body shape with Zod in tests.
const HealthResponseSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'degraded'] },
    db: { type: 'string', enum: ['ok', 'down'] },
    s3: { type: 'string', enum: ['ok', 'down'] },
    version: { type: 'string' },
    uptime: { type: 'number' },
    pool: {
      type: 'object',
      properties: {
        max: { type: 'number' },
        inUse: { type: 'number' },
        waiting: { type: 'number' },
      },
      required: ['max', 'inUse', 'waiting'],
    },
  },
  required: ['status', 'db', 's3', 'version', 'uptime', 'pool'],
} as const;

const VersionResponseSchema = {
  type: 'object',
  properties: {
    version: { type: 'string' },
    commit: { type: ['string', 'null'] },
    buildTime: { type: ['string', 'null'] },
  },
  required: ['version', 'commit', 'buildTime'],
} as const;

export async function registerHealth(app: App): Promise<void> {
  const start = Date.now();

  app.get(
    '/healthz',
    {
      schema: {
        response: {
          200: HealthResponseSchema,
          503: HealthResponseSchema,
        },
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
        pool: getPoolStats(),
      };
      return reply.status(ok ? 200 : 503).send(body);
    },
  );

  app.get(
    '/version',
    {
      schema: {
        response: {
          200: VersionResponseSchema,
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
