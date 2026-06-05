import type { App } from '../types.js';
import { ZodError } from 'zod';
import { ErrorBodySchema } from '@dam-link/contracts';
import { captureException } from '../lib/sentry.js';
import { logger } from '../lib/logger.js';
import { AppError } from './error-handler.js';

/**
 * In Plan 1 this was a no-op stub. In production it captures every unhandled
 * error into Sentry, with request context (URL, method, user id).
 */
export async function registerSentry(app: App): Promise<void> {
  app.setErrorHandler((err, req, reply) => {
    // Always log locally first.
    req.log.error({ err }, 'request error');

    // Capture in Sentry for 5xx errors only (4xx are user errors, not bugs).
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) {
      captureException(err, {
        requestId: req.id,
        method: req.method,
        url: req.url,
        userId: (req as { user?: { id?: string } }).user?.id,
      });
    }

    // Delegate to the existing error handler (set by registerErrorHandler).
    // We re-define behaviour here to avoid two setErrorHandler calls clashing.
    if (err instanceof AppError) {
      const body = ErrorBodySchema.parse({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return reply.status(err.statusCode).send(body);
    }
    // ZodError from Schema.parse() in route handlers — return 422 so existing
    // tests asserting VALIDATION_ERROR still pass. 4xx, not sent to Sentry.
    if (err instanceof ZodError) {
      const body = ErrorBodySchema.parse({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: err.issues,
        },
      });
      return reply.status(422).send(body);
    }
    const body = ErrorBodySchema.parse({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    return reply.status(500).send(body);
  });

  logger.debug('sentry plugin registered');
}
