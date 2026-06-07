import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  observeSql,
  requestIdStore,
  _resetObserveForTests,
} from '../src/db/observe.js';
import { logger } from '../src/lib/logger.js';
import { _resetConfigForTests } from '../src/config.js';

describe('observeSql — requestId propagation', () => {
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

  it('includes requestId from the AsyncLocalStorage in the slow-query log', async () => {
    process.env.SLOW_QUERY_MS = '0';
    _resetConfigForTests();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);

    await requestIdStore.run('req-abc-123', async () => {
      await observeSql('test.requestId', async () => 'fast');
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [payload] = warnSpy.mock.calls[0];
    expect(payload.requestId).toBe('req-abc-123');
    expect(payload.op).toBe('test.requestId');
  });

  it('requestId is undefined when the store is empty (e.g. background job)', async () => {
    process.env.SLOW_QUERY_MS = '0';
    _resetConfigForTests();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);

    await observeSql('test.no-requestId', async () => 'fast');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [payload] = warnSpy.mock.calls[0];
    expect(payload.requestId).toBeUndefined();
    expect(payload.op).toBe('test.no-requestId');
  });
});
