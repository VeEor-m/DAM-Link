import type { App } from '../types.js';
import { ZodError } from 'zod';
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
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      const body = ErrorBodySchema.parse({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return reply.status(err.statusCode).send(body);
    }

    if (err instanceof ZodError) {
      const body = ErrorBodySchema.parse({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: err.issues,
        },
      });
      return reply.status(422).send(body);
    }

    if ((err as { statusCode?: number }).statusCode && (err as { statusCode?: number }).statusCode! < 500) {
      const status = (err as { statusCode: number }).statusCode;
      const body = ErrorBodySchema.parse({
        error: { code: err.code ?? 'CLIENT_ERROR', message: err.message },
      });
      return reply.status(status).send(body);
    }

    req.log.error({ err }, 'unhandled error');
    const body = ErrorBodySchema.parse({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    return reply.status(500).send(body);
  });

  app.setNotFoundHandler((_req, reply) => {
    const body = ErrorBodySchema.parse({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
    return reply.status(404).send(body);
  });
}
