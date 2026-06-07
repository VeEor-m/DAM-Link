import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadConfig } from '../config.js';
import * as schema from './schema.js';

export type DB = PostgresJsDatabase<typeof schema>;

let cached: DB | null = null;
let cachedSql: ReturnType<typeof postgres> | null = null;

/** Returns a process-wide Drizzle client. Lazy-initialised. */
export function getDb(): DB {
  if (cached) return cached;
  const config = loadConfig();
  cachedSql = postgres(config.DATABASE_URL, {
    max: config.DB_POOL_MAX,
    idle_timeout: 30,
    connect_timeout: 5,
  });
  cached = drizzle(cachedSql, { schema });
  return cached;
}

/** Returns the configured max pool size. Exposed for /healthz. */
export function getDbPoolMax(): number {
  return loadConfig().DB_POOL_MAX;
}

/** Test-only — closes the pool and clears the cache. */
export async function _closeDbForTests(): Promise<void> {
  if (cachedSql) {
    await cachedSql.end({ timeout: 5 });
  }
  cached = null;
  cachedSql = null;
}

/** Liveness probe for /healthz. */
export async function pingDb(): Promise<boolean> {
  try {
    const db = getDb();
    await db.execute('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
