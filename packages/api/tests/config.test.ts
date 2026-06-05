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
