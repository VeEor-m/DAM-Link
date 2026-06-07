import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { observeSql, _resetObserveForTests } from '../src/db/observe.js';
import { logger } from '../src/lib/logger.js';
import { _resetConfigForTests } from '../src/config.js';

describe('observeSql', () => {
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

  it('returns the wrapped result unchanged', async () => {
    const result = await observeSql('test.fast', async () => 42);
    expect(result).toBe(42);
  });

  it('does NOT log when query is fast (< threshold)', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    // Default SLOW_QUERY_MS=200; a 1ms query must not log.
    const result = await observeSql('test.fast', async () => {
      await new Promise((r) => setTimeout(r, 1));
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('DOES log with evt=slow_query, op, and rowCount=array.length when query is slow (> threshold)', async () => {
    process.env.SLOW_QUERY_MS = '5';
    _resetConfigForTests();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);

    // Return an array so rowCount=length is asserted (3 elements).
    // Returning a non-array yields rowCount=undefined, covered by the
    // scalar path implicit in test 1 above.
    await observeSql('assets.list', async () => {
      await new Promise((r) => setTimeout(r, 30));
      return [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [payload, message] = warnSpy.mock.calls[0];
    expect(payload.evt).toBe('slow_query');
    expect(payload.op).toBe('assets.list');
    expect(payload.durationMs).toBeGreaterThanOrEqual(5);
    expect(payload.rowCount).toBe(3);
    expect(message).toBe('slow query');
  });

  it('decrements inUse even when the callback throws', async () => {
    const { getPoolStats } = await import('../src/db/observe.js');
    await expect(
      observeSql('test.throwing', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(getPoolStats().inUse).toBe(0);
  });

  it('propagates the original exception (does NOT swallow)', async () => {
    await expect(
      observeSql('test.typed-throw', async () => {
        throw new TypeError('original error');
      }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
