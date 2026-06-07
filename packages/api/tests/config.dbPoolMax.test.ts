import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, _resetConfigForTests } from '../src/config.js';

describe('config — DB_POOL_MAX', () => {
  const original = process.env.DB_POOL_MAX;
  beforeEach(() => {
    delete process.env.DB_POOL_MAX;
    _resetConfigForTests();
  });
  afterEach(() => {
    if (original === undefined) delete process.env.DB_POOL_MAX;
    else process.env.DB_POOL_MAX = original;
    _resetConfigForTests();
  });

  it('defaults to 10 when env not set', () => {
    const cfg = loadConfig();
    expect(cfg.DB_POOL_MAX).toBe(10);
  });

  it('parses a numeric env var', () => {
    process.env.DB_POOL_MAX = '25';
    _resetConfigForTests();
    const cfg = loadConfig();
    expect(cfg.DB_POOL_MAX).toBe(25);
  });

  it('rejects a non-positive value', () => {
    process.env.DB_POOL_MAX = '0';
    _resetConfigForTests();
    expect(() => loadConfig()).toThrow(/Invalid configuration/);
  });
});
