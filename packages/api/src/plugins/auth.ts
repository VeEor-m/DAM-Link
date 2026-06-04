import type { App } from '../types.js';
import type { FastifyRequest } from 'fastify';
import { readSessionCookie } from '../lib/sessions.js';
import {
  findSessionById,
  touchSession,
} from '../repositories/sessions.repo.js';
import { findUserById } from '../repositories/users.repo.js';
import { AppError } from './error-handler.js';

/**
 * Resolves the session cookie to a user. Mutates req.user.
 * Does NOT enforce authentication — routes that require auth should
 * use the `requireUser` preHandler.
 */
export async function registerAuth(app: App): Promise<void> {
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (req) => {
    req.user = null;
    const sessionId = readSessionCookie(req);
    if (!sessionId) return;

    const session = await findSessionById(sessionId);
    if (!session) return;

    const user = await findUserById(session.userId);
    if (!user) return;

    req.user = user;
    void touchSession(sessionId);
  });
}

export function requireUser(this: void, req: FastifyRequest): void {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
}
