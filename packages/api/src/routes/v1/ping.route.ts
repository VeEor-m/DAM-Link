import type { App } from '../../types.js';

const ReplySchema = {
  type: 'object',
  properties: {
    pong: { type: 'boolean', enum: [true] },
    now: { type: 'string', format: 'date-time' },
  },
  required: ['pong', 'now'],
} as const;

export async function registerPingRoute(app: App): Promise<void> {
  app.get(
    '/api/v1/ping',
    {
      schema: {
        response: { 200: ReplySchema },
        tags: ['ops'],
        summary: 'Sanity ping (removed in Plan 2)',
      },
    },
    async () => ({ pong: true as const, now: new Date().toISOString() }),
  );
}
