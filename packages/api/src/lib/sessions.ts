import '@fastify/cookie';
import { loadConfig } from '../config.js';
import { newToken } from './ids.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Session } from '../db/schema.js';

const config = loadConfig();

/** Generate a new session ID (32 random bytes, base64url). */
export const newSessionId = (): string => newToken(32);

/** Compute the expiry timestamp for a new session. */
export function newSessionExpiry(): Date {
  const days = config.SESSION_TTL_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** Cookie options used when setting/clearing the session cookie. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.NODE_ENV === 'production',
    path: '/',
    maxAge: config.SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}

export function setSessionCookie(reply: FastifyReply, sessionId: string): void {
  reply.setCookie(config.SESSION_COOKIE_NAME, sessionId, sessionCookieOptions());
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(config.SESSION_COOKIE_NAME, sessionCookieOptions());
}

export function readSessionCookie(req: FastifyRequest): string | null {
  const raw = req.cookies[config.SESSION_COOKIE_NAME];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/** Map a DB session row to the public-facing shape (no internal fields). */
export function toPublicSession(s: Session) {
  return {
    id: s.id,
    userId: s.userId,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    userAgent: s.userAgent ?? null,
    ip: s.ip ?? null,
  };
}
