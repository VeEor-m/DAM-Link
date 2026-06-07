import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { observeSql, _resetObserveForTests } from '../src/db/observe.js';
import { logger } from '../src/lib/logger.js';
import { _resetConfigForTests } from '../src/config.js';

describe('observeSql — SLOW_QUERY_MS threshold', () => {
  beforeEach(() => {
    _resetObserveForTests();
    _resetConfigForTests();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('SLOW_QUERY_MS=0 logs every query', async () => {
    process.env.SLOW_QUERY_MS = '0';
    _resetConfigForTests();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);

    await observeSql(async () => 'fast');
    await observeSql(async () => 'also fast');

    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('SLOW_QUERY_MS=10000 does not log a 5ms query', async () => {
    process.env.SLOW_QUERY_MS = '10000';
    _resetConfigForTests();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);

    await observeSql(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
