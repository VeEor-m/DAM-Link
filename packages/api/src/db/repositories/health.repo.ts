import { sql } from 'drizzle-orm';
import { getDb } from '../client.js';

/** Used by /healthz and integration tests. */
export async function checkDbConnection(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1 AS ok`);
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}
