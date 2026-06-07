import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  observeSql,
  getPoolStats,
  _resetObserveForTests,
} from '../src/db/observe.js';
import { _resetConfigForTests } from '../src/config.js';

describe('getPoolStats', () => {
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

  it('returns max from config, inUse=0, waiting=0 when idle', () => {
    process.env.DB_POOL_MAX = '15';
    _resetConfigForTests();
    const stats = getPoolStats();
    expect(stats).toEqual({ max: 15, inUse: 0, waiting: 0 });
  });

  it('inUse counts concurrent observeSql calls', async () => {
    let release!: () => void;
    const barrier = new Promise<void>((res) => {
      release = res;
    });

    const q1 = observeSql('test.barrier', async () => {
      await barrier;
    });
    const q2 = observeSql('test.barrier', async () => {
      await barrier;
    });
    const q3 = observeSql('test.barrier', async () => {
      await barrier;
    });

    // Yield to the event loop so all 3 observeSql calls have entered
    // (inUse incremented) and parked on the barrier.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(getPoolStats().inUse).toBe(3);

    release();
    await Promise.all([q1, q2, q3]);
    expect(getPoolStats().inUse).toBe(0);
  });

  it('waiting is always 0 (postgres-js 3.4.5 has no pool events — see spec §6)', () => {
    expect(getPoolStats().waiting).toBe(0);
  });
});
