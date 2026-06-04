import { execSync } from 'node:child_process';
import postgres from 'postgres';
import { applyTestEnv } from './helpers/env.js';
import { _closeDbForTests } from '../src/db/client.js';

export async function setup(): Promise<void> {
  applyTestEnv();
  console.log('[vitest globalSetup] applying test env');

  // 1. Ensure test services are up
  console.log('[vitest globalSetup] ensuring docker-compose.test is up...');
  execSync('docker compose -f docker-compose.test.yml up -d', {
    stdio: 'inherit',
  });

  // 2. Wait for Postgres to be ready
  console.log('[vitest globalSetup] waiting for test postgres...');
  const url = process.env.DATABASE_URL!;
  let attempts = 0;
  const maxAttempts = 30;
  while (attempts < maxAttempts) {
    try {
      const sql = postgres(url, { max: 1, connect_timeout: 2 });
      await sql`SELECT 1`;
      await sql.end();
      break;
    } catch {
      attempts += 1;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (attempts === maxAttempts) {
    throw new Error('Test postgres never became ready');
  }

  // 3. Apply migrations
  console.log('[vitest globalSetup] applying migrations...');
  execSync('pnpm --filter @dam-link/api db:migrate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });

  console.log('[vitest globalSetup] ready');
}

export async function teardown(): Promise<void> {
  await _closeDbForTests();
  // Leave the test services running between runs for speed.
  // Use `pnpm test:services:down` to stop them.
}
