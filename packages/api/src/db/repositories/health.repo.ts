import { sql } from 'drizzle-orm';
import { getDb } from '../client.js';
import { observeSql } from '../observe.js';

/** Used by /healthz and integration tests. */
export async function checkDbConnection(): Promise<{ ok: boolean; latencyMs: number }> {
  return await observeSql('health.checkDbConnection', async () => {
    const start = Date.now();
    try {
      const db = getDb();
      await db.execute(sql`SELECT 1 AS ok`);
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  });
}
