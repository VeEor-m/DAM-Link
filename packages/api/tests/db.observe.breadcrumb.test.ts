import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { observeSql, _resetObserveForTests } from '../src/db/observe.js';
import { addBreadcrumb } from '../src/lib/sentry.js';
import { _resetConfigForTests } from '../src/config.js';

vi.mock('../src/lib/sentry.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/sentry.js')>(
    '../src/lib/sentry.js',
  );
  return {
    ...actual,
    addBreadcrumb: vi.fn(),
  };
});

describe('observeSql — Sentry breadcrumb', () => {
  beforeEach(() => {
    _resetObserveForTests();
    _resetConfigForTests();
    vi.mocked(addBreadcrumb).mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls addBreadcrumb with category=db on a slow query', async () => {
    process.env.SLOW_QUERY_MS = '0';
    _resetConfigForTests();

    await observeSql(async () => 'fast');

    expect(vi.mocked(addBreadcrumb)).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(addBreadcrumb).mock.calls[0][0];
    expect(arg.category).toBe('db');
    expect(arg.message).toBe('slow_query');
    expect(arg.data?.durationMs).toBeGreaterThanOrEqual(0);
    expect(arg.level).toBe('warning');
  });

  it('does NOT call addBreadcrumb on a fast query', async () => {
    process.env.SLOW_QUERY_MS = '10000';
    _resetConfigForTests();

    await observeSql(async () => {
      await new Promise((r) => setTimeout(r, 1));
    });

    expect(vi.mocked(addBreadcrumb)).not.toHaveBeenCalled();
  });
});
