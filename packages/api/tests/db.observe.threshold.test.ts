import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { observeSql, _resetObserveForTests } from '../src/db/observe.js';
import { logger } from '../src/lib/logger.js';
import { _resetConfigForTests } from '../src/config.js';

describe('observeSql — SLOW_QUERY_MS threshold', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    _resetObserveForTests();
    _resetConfigForTests();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    _resetConfigForTests();
  });

  it('SLOW_QUERY_MS=0 logs every query', async () => {
    process.env.SLOW_QUERY_MS = '0';
    _resetConfigForTests();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);

    await observeSql('test.threshold-zero', async () => 'fast');
    await observeSql('test.threshold-zero', async () => 'also fast');

    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('SLOW_QUERY_MS=10000 does not log a 5ms query', async () => {
    process.env.SLOW_QUERY_MS = '10000';
    _resetConfigForTests();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);

    await observeSql('test.threshold-high', async () => {
      await new Promise((r) => setTimeout(r, 5));
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
