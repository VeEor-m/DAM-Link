import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Stub: filled in by Task 7 (regenerate-poster handler). For now returns
 * 501 Not Implemented. This is a placeholder route so the route is
 * registered and the path is reachable.
 */
export async function regeneratePosterHandler(
  _req: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  throw Object.assign(new Error('regenerate-poster: not implemented yet (filled in by Plan 17 Task 7)'), {
    statusCode: 501,
    code: 'NOT_IMPLEMENTED',
  });
}
