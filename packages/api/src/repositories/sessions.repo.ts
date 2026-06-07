import { and, eq, gte, lt } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { observeSql } from '../db/observe.js';
import { sessions, type Session, type NewSession } from '../db/schema.js';

export async function findSessionById(id: string): Promise<Session | null> {
  return await observeSql('sessions.findSessionById', async () => {
    const db = getDb();
    const now = new Date();
    const rows = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, id), gte(sessions.expiresAt, now)))
      .limit(1);
    return rows[0] ?? null;
  });
}

export async function createSession(input: NewSession): Promise<Session> {
  return await observeSql('sessions.createSession', async () => {
    const db = getDb();
    const [row] = await db.insert(sessions).values(input).returning();
    if (!row) throw new Error('createSession: insert returned no rows');
    return row;
  });
}

export async function deleteSession(id: string): Promise<void> {
  return await observeSql('sessions.deleteSession', async () => {
    const db = getDb();
    await db.delete(sessions).where(eq(sessions.id, id));
  });
}

export async function touchSession(id: string): Promise<void> {
  return await observeSql('sessions.touchSession', async () => {
    const db = getDb();
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, id));
  });
}

export async function purgeExpiredSessions(): Promise<number> {
  return await observeSql('sessions.purgeExpiredSessions', async () => {
    const db = getDb();
    const deleted = await db
      .delete(sessions)
      .where(lt(sessions.expiresAt, new Date()))
      .returning({ id: sessions.id });
    return deleted.length;
  });
}
