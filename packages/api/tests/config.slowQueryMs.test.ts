import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, _resetConfigForTests } from '../src/config.js';

describe('config — SLOW_QUERY_MS', () => {
  const original = process.env.SLOW_QUERY_MS;
  beforeEach(() => {
    delete process.env.SLOW_QUERY_MS;
    _resetConfigForTests();
  });
  afterEach(() => {
    if (original === undefined) delete process.env.SLOW_QUERY_MS;
    else process.env.SLOW_QUERY_MS = original;
    _resetConfigForTests();
  });

  it('defaults to 200 when env not set', () => {
    const cfg = loadConfig();
    expect(cfg.SLOW_QUERY_MS).toBe(200);
  });

  it('parses a numeric env var', () => {
    process.env.SLOW_QUERY_MS = '500';
    _resetConfigForTests();
    const cfg = loadConfig();
    expect(cfg.SLOW_QUERY_MS).toBe(500);
  });

  it('accepts 0 (every query is "slow")', () => {
    process.env.SLOW_QUERY_MS = '0';
    _resetConfigForTests();
    const cfg = loadConfig();
    expect(cfg.SLOW_QUERY_MS).toBe(0);
  });
});
