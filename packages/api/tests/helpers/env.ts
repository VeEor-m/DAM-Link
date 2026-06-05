import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

/** Test env. Loaded once by globalSetup, frozen for the test run. */
export const TEST_ENV = {
  NODE_ENV: 'test' as const,
  LOG_LEVEL: 'fatal', // 'silent' isn't a Pino enum value; 'fatal' is the quietest.
  WEB_ORIGIN: 'http://localhost:5173',
  API_HOST: '127.0.0.1',
  API_PORT: '0', // ephemeral when binding via app.inject
  API_PUBLIC_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://dam:dam@localhost:5433/dam_link_test',
  S3_ENDPOINT: 'http://localhost:9003',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY: 'dam',
  S3_SECRET_KEY: 'dams3cret',
  S3_BUCKET: 'dam-link-test',
  S3_FORCE_PATH_STYLE: 'true',
  SESSION_COOKIE_NAME: 'dam_session_test',
  SESSION_TTL_DAYS: '30',
  SESSION_COOKIE_SECRET: 'test-secret-must-be-at-least-16-chars',
  RATE_LIMIT_DISABLED: 'true',
};

export function applyTestEnv(): void {
  loadDotenv({ path: resolve(process.cwd(), '.env.test'), quiet: true });
  for (const [k, v] of Object.entries(TEST_ENV)) {
    process.env[k] = v;
  }
}
