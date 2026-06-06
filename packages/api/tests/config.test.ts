import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig, _resetConfigForTests } from '../src/config.js';

describe('config (production rules)', () => {
  beforeEach(() => _resetConfigForTests());

  const baseProd = {
    NODE_ENV: 'production',
    LOG_LEVEL: 'info',
    WEB_ORIGIN: 'https://app.dam-link.example',
    API_HOST: '0.0.0.0',
    API_PORT: '3000',
    API_PUBLIC_URL: 'https://api.dam-link.example',
    DATABASE_URL: 'postgres://u:p@db.example:5432/dam_link',
    S3_ENDPOINT: 'https://bucket.r2.cloudflarestorage.com',
    S3_REGION: 'auto',
    S3_ACCESS_KEY: 'r2-access',
    S3_SECRET_KEY: 'r2-secret',
    S3_BUCKET: 'dam-link-prod',
    S3_FORCE_PATH_STYLE: 'true',
    SESSION_COOKIE_NAME: 'dam_session',
    SESSION_TTL_DAYS: '30',
    SESSION_COOKIE_SECRET: 'a'.repeat(64),
    TURNSTILE_SECRET_KEY: 'real-turnstile-secret',
  } as const;

  it('accepts a fully-specified production config', () => {
    expect(() => loadConfig(baseProd)).not.toThrow();
  });

  it('rejects a production config with the default cookie secret', () => {
    expect(() =>
      loadConfig({ ...baseProd, SESSION_COOKIE_SECRET: 'change-me-32-bytes-of-random-data' }),
    ).toThrow(/SESSION_COOKIE_SECRET/);
  });

  it('rejects a production config with a short cookie secret', () => {
    expect(() =>
      loadConfig({ ...baseProd, SESSION_COOKIE_SECRET: 'short' }),
    ).toThrow(/at least 32 characters/);
  });

  it('rejects a production config without TURNSTILE_SECRET_KEY', () => {
    expect(() => {
      const { TURNSTILE_SECRET_KEY: _, ...rest } = baseProd;
      void _;
      return loadConfig(rest as typeof baseProd);
    }).toThrow(/TURNSTILE_SECRET_KEY/);
  });

  it('rejects a production config with debug log level', () => {
    expect(() => loadConfig({ ...baseProd, LOG_LEVEL: 'debug' })).toThrow(/LOG_LEVEL/);
  });
});

describe('config (SENTRY_DSN)', () => {
  beforeEach(() => _resetConfigForTests());

  const baseDev = {
    NODE_ENV: 'development',
    LOG_LEVEL: 'info',
    WEB_ORIGIN: 'http://localhost:5173',
    API_HOST: '0.0.0.0',
    API_PORT: '3000',
    API_PUBLIC_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgres://dam:dam@localhost:54321/dam_link',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: 'dam',
    S3_SECRET_KEY: 'dams3cret',
    S3_BUCKET: 'dam-link-dev',
    S3_FORCE_PATH_STYLE: 'true',
    SESSION_COOKIE_NAME: 'dam_session',
    SESSION_TTL_DAYS: '30',
    SESSION_COOKIE_SECRET: 'change-me-32-bytes-of-random-data',
  } as const;

  it('treats an empty SENTRY_DSN string as undefined (dev default)', () => {
    const cfg = loadConfig({ ...baseDev, SENTRY_DSN: '' });
    expect(cfg.SENTRY_DSN).toBeUndefined();
  });

  it('treats an unset SENTRY_DSN as undefined', () => {
    const cfg = loadConfig(baseDev);
    expect(cfg.SENTRY_DSN).toBeUndefined();
  });

  it('accepts a valid https SENTRY_DSN', () => {
    const dsn = 'https://public@sentry.example.com/123';
    const cfg = loadConfig({ ...baseDev, SENTRY_DSN: dsn });
    expect(cfg.SENTRY_DSN).toBe(dsn);
  });

  it('rejects an http (non-https) SENTRY_DSN', () => {
    expect(() =>
      loadConfig({ ...baseDev, SENTRY_DSN: 'http://public@sentry.example.com/123' }),
    ).toThrow(/SENTRY_DSN must be HTTPS/);
  });

  it('rejects a SENTRY_DSN that is not a URL at all', () => {
    expect(() => loadConfig({ ...baseDev, SENTRY_DSN: 'not-a-url' })).toThrow(/SENTRY_DSN/);
  });
});
