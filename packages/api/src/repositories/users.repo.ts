import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { users, type User, type NewUser } from '../db/schema.js';

export async function findUserById(id: string): Promise<User | null> {
  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function createUser(input: NewUser): Promise<User> {
  const db = getDb();
  const [row] = await db.insert(users).values(input).returning();
  if (!row) throw new Error('createUser: insert returned no rows');
  return row;
}
