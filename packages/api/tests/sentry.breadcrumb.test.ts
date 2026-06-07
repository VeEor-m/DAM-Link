import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @sentry/node BEFORE importing our wrapper, so the wrapper
// captures the mocked `addBreadcrumb` and `getClient` references at
// module-load time. Vitest's ESM namespace for @sentry/node is sealed
// (Object.isSealed === true) so neither vi.spyOn nor direct
// assignment work for spying — module-level vi.mock is the only way
// to observe calls to Sentry.addBreadcrumb from our wrapper.
vi.mock('@sentry/node', async () => {
  const actual = await vi.importActual<typeof import('@sentry/node')>('@sentry/node');
  return {
    ...actual,
    addBreadcrumb: vi.fn(),
  };
});

import * as Sentry from '@sentry/node';
import { initSentry, addBreadcrumb, _resetSentryForTests } from '../src/lib/sentry.js';

const mockAddBreadcrumb = Sentry.addBreadcrumb as unknown as ReturnType<typeof vi.fn>;

describe('sentry — addBreadcrumb', () => {
  beforeEach(async () => {
    _resetSentryForTests();
    await initSentry({
      dsn: 'https://test@test.ingest.sentry.io/1',
      environment: 'test',
      release: 'test',
      tracesSampleRate: 0,
      profilesSampleRate: 0,
    });
    mockAddBreadcrumb.mockClear();
  });

  afterEach(() => {
    _resetSentryForTests();
  });

  it('calls Sentry.addBreadcrumb with category, message, and data', () => {
    addBreadcrumb({
      category: 'db',
      message: 'slow_query',
      data: { durationMs: 350, sql: 'SELECT 1' },
    });
    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
    const arg = mockAddBreadcrumb.mock.calls[0][0];
    expect(arg.category).toBe('db');
    expect(arg.message).toBe('slow_query');
    expect(arg.data).toEqual({ durationMs: 350, sql: 'SELECT 1' });
  });

  it('is a no-op when Sentry is not initialized', () => {
    _resetSentryForTests();
    // Don't call initSentry this time. addBreadcrumb should silently no-op.
    expect(() =>
      addBreadcrumb({ category: 'db', message: 'x', data: {} }),
    ).not.toThrow();
  });
});
