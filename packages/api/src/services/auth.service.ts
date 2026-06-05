import { AppError } from '../plugins/error-handler.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import {
  createSession,
  deleteSession,
  findSessionById,
} from '../repositories/sessions.repo.js';
import {
  createUser,
  findUserByEmail,
  findUserById,
} from '../repositories/users.repo.js';
import {
  newSessionId,
  newSessionExpiry,
} from '../lib/sessions.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { logger } from '../lib/logger.js';
import type { User, Session } from '../db/schema.js';

const EMAIL_IN_USE_MESSAGE = 'Email already registered';

export async function registerUser(input: {
  email: string;
  password: string;
  displayName: string;
  turnstileToken?: string;
  remoteIp: string | null;
  userAgent: string | null;
}): Promise<{ user: User; session: Session }> {
  const email = input.email.toLowerCase();

  if (input.turnstileToken) {
    const ok = await verifyTurnstile(input.turnstileToken, input.remoteIp);
    if (!ok) throw new AppError(400, 'TURNSTILE_FAILED', 'Bot check failed');
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    // Constant message to prevent user enumeration.
    throw new AppError(409, 'EMAIL_IN_USE', EMAIL_IN_USE_MESSAGE);
  }

  const passwordHash = await hashPassword(input.password);
  const user = await createUser({
    email,
    passwordHash,
    displayName: input.displayName,
  });

  const session = await createSession({
    id: newSessionId(),
    userId: user.id,
    expiresAt: newSessionExpiry(),
    userAgent: input.userAgent,
    ip: input.remoteIp,
  });

  logger.info({ userId: user.id }, 'user registered');
  return { user, session };
}

export async function loginUser(input: {
  email: string;
  password: string;
  turnstileToken?: string;
  remoteIp: string | null;
  userAgent: string | null;
}): Promise<{ user: User; session: Session }> {
  const email = input.email.toLowerCase();

  if (input.turnstileToken) {
    const ok = await verifyTurnstile(input.turnstileToken, input.remoteIp);
    if (!ok) throw new AppError(400, 'TURNSTILE_FAILED', 'Bot check failed');
  }

  const user = await findUserByEmail(email);
  if (!user) {
    // Run a dummy hash to make timing roughly equal.
    await verifyPassword(
      '$argon2id$v=19$m=65536,t=3,p=4$YWFhYWFhYWFhYWFhYWFhYQ$8c1G4xV7r5e8W8o7I0wTl2u5xZ4K8yC8Q4m3Z4q7R8M',
      input.password,
    );
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const session = await createSession({
    id: newSessionId(),
    userId: user.id,
    expiresAt: newSessionExpiry(),
    userAgent: input.userAgent,
    ip: input.remoteIp,
  });

  logger.info({ userId: user.id }, 'user logged in');
  return { user, session };
}

export async function logoutUser(sessionId: string): Promise<void> {
  await deleteSession(sessionId);
  logger.info({ sessionIdPrefix: sessionId.slice(0, 8) }, 'user logged out');
}

/** Read the current user from a session ID. Returns null if invalid/expired. */
export async function getUserFromSessionId(
  sessionId: string,
): Promise<{ user: User; session: Session } | null> {
  const session = await findSessionById(sessionId);
  if (!session) return null;
  const user = await findUserById(session.userId);
  if (!user) return null;
  return { user, session };
}
