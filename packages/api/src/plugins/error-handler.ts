import type { App } from '../types.js';
import { ErrorBodySchema } from '@dam-link/contracts';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export async function registerErrorHandler(app: App): Promise<void> {
  app.setNotFoundHandler((_req, reply) => {
    const body = ErrorBodySchema.parse({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
    return reply.status(404).send(body);
  });
}
