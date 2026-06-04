import { sql } from 'drizzle-orm';
import { getDb, _closeDbForTests } from '../../src/db/client.js';

/** Truncate all data tables (keeps schema, removes rows). CASCADE handles FKs. */
export async function truncateAllTables(): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    TRUNCATE
      share_links,
      assets,
      memberships,
      orgs,
      sessions,
      users
    RESTART IDENTITY CASCADE
  `);
}

export async function closeDb(): Promise<void> {
  await _closeDbForTests();
}
