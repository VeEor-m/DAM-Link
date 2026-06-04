import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3 } from './helpers/s3.js';
import { createUser } from '../src/repositories/users.repo.js';
import {
  createSession,
  findSessionById,
  deleteSession,
  touchSession,
  purgeExpiredSessions,
} from '../src/repositories/sessions.repo.js';
import { newSessionId, newSessionExpiry } from '../src/lib/sessions.js';

describe('sessions repo', () => {
  beforeAll(async () => {
    // globalSetup already ran; this just ensures connections are warm.
  });

  afterAll(async () => {
    await closeDb();
    await closeS3();
  });

  beforeEach(async () => {
    await truncateAllTables();
  });

  it('creates and finds a session', async () => {
    const user = await createUser({
      email: 'a@example.com',
      passwordHash: 'hash',
      displayName: 'A',
    });
    const id = newSessionId();
    const session = await createSession({
      id,
      userId: user.id,
      expiresAt: newSessionExpiry(),
      userAgent: 'jest',
      ip: '127.0.0.1',
    });
    expect(session.id).toBe(id);

    const found = await findSessionById(id);
    expect(found).not.toBeNull();
    expect(found?.userId).toBe(user.id);
  });

  it('does not return expired sessions', async () => {
    const user = await createUser({
      email: 'a@example.com',
      passwordHash: 'hash',
      displayName: 'A',
    });
    const id = newSessionId();
    await createSession({
      id,
      userId: user.id,
      expiresAt: new Date(Date.now() - 1000), // already expired
    });
    expect(await findSessionById(id)).toBeNull();
  });

  it('touches lastSeenAt', async () => {
    const user = await createUser({
      email: 'a@example.com',
      passwordHash: 'hash',
      displayName: 'A',
    });
    const id = newSessionId();
    // Seed with an explicit old timestamp so we can detect the touch without
    // relying on a comparison that could be defeated by Docker↔host clock skew.
    const oldSeen = new Date('2020-01-01T00:00:00Z');
    await createSession({
      id,
      userId: user.id,
      expiresAt: newSessionExpiry(),
      lastSeenAt: oldSeen,
    });
    const before = (await findSessionById(id))!.lastSeenAt;
    expect(before.getTime()).toBe(oldSeen.getTime());

    const justBeforeTouch = Date.now();
    await touchSession(id);
    const after = (await findSessionById(id))!.lastSeenAt;

    // After touch: lastSeenAt should reflect `new Date()` from the Node host.
    // Allow up to 5s of slack for slow CI / Docker clock drift.
    expect(after.getTime()).toBeGreaterThanOrEqual(justBeforeTouch - 5000);
    expect(after.getTime()).toBeLessThanOrEqual(Date.now() + 5000);
  });

  it('deletes a session', async () => {
    const user = await createUser({
      email: 'a@example.com',
      passwordHash: 'hash',
      displayName: 'A',
    });
    const id = newSessionId();
    await createSession({ id, userId: user.id, expiresAt: newSessionExpiry() });
    await deleteSession(id);
    expect(await findSessionById(id)).toBeNull();
  });

  it('purges expired sessions', async () => {
    const user = await createUser({
      email: 'a@example.com',
      passwordHash: 'hash',
      displayName: 'A',
    });
    await createSession({
      id: newSessionId(),
      userId: user.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    await createSession({
      id: newSessionId(),
      userId: user.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    const purged = await purgeExpiredSessions();
    expect(purged).toBe(2);
  });
});
