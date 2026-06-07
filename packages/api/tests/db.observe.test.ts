import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { observeSql, _resetObserveForTests } from '../src/db/observe.js';
import { logger } from '../src/lib/logger.js';
import { _resetConfigForTests } from '../src/config.js';

describe('observeSql', () => {
  beforeEach(() => {
    _resetObserveForTests();
    _resetConfigForTests();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the wrapped result unchanged', async () => {
    const result = await observeSql(async () => 42);
    expect(result).toBe(42);
  });

  it('does NOT log when query is fast (< threshold)', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    // Default SLOW_QUERY_MS=200; a 1ms query must not log.
    const result = await observeSql(async () => {
      await new Promise((r) => setTimeout(r, 1));
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('DOES log with evt=slow_query when query is slow (> threshold)', async () => {
    process.env.SLOW_QUERY_MS = '5';
    _resetConfigForTests();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);

    await observeSql(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [payload, message] = warnSpy.mock.calls[0];
    expect(payload.evt).toBe('slow_query');
    expect(payload.durationMs).toBeGreaterThanOrEqual(5);
    expect(message).toBe('slow query');
  });

  it('decrements inUse even when the callback throws', async () => {
    const { getPoolStats } = await import('../src/db/observe.js');
    await expect(
      observeSql(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(getPoolStats().inUse).toBe(0);
  });

  it('propagates the original exception (does NOT swallow)', async () => {
    await expect(
      observeSql(async () => {
        throw new TypeError('original error');
      }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
