import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),

  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().nonnegative().default(3000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  SLOW_QUERY_MS: z.coerce.number().int().nonnegative().default(200),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  SESSION_COOKIE_NAME: z.string().default('dam_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SESSION_COOKIE_SECRET: z.string().min(1),

  SENTRY_DSN: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .refine(
      (v) => v === undefined || v.startsWith('https://'),
      'SENTRY_DSN must be HTTPS',
    ),

  TURNSTILE_SITE_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  TURNSTILE_SECRET_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),

  RATE_LIMIT_DISABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

export type Config = z.infer<typeof ConfigSchema>;

let cached: Config | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (cached) return cached;
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  const cfg = result.data;

  // Production-only rules. Fail-fast on dangerous misconfigurations.
  if (cfg.NODE_ENV === 'production') {
    const errors: string[] = [];
    if (cfg.SESSION_COOKIE_SECRET === 'change-me-32-bytes-of-random-data') {
      errors.push('SESSION_COOKIE_SECRET must be changed from the default in production');
    }
    if (cfg.SESSION_COOKIE_SECRET.length < 32) {
      errors.push('SESSION_COOKIE_SECRET must be at least 32 characters in production');
    }
    if (!cfg.TURNSTILE_SECRET_KEY) {
      errors.push('TURNSTILE_SECRET_KEY is required in production (bot protection)');
    }
    if (cfg.LOG_LEVEL === 'trace' || cfg.LOG_LEVEL === 'debug') {
      errors.push(`LOG_LEVEL=${cfg.LOG_LEVEL} is not allowed in production`);
    }
    if (errors.length > 0) {
      throw new Error(
        `Unsafe production configuration:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
      );
    }
  }

  cached = cfg;
  return cached;
}

/** Test-only — clears the config cache so tests can re-load with new env. */
export function _resetConfigForTests(): void {
  cached = null;
}
