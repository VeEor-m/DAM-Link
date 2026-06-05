import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { initSentry, captureException, _resetSentryForTests } from '../src/lib/sentry.js';

describe('sentry', () => {
  beforeEach(() => {
    _resetSentryForTests();
  });
  afterEach(() => {
    _resetSentryForTests();
  });

  it('captureException is a no-op when Sentry is not initialised', () => {
    // Should not throw.
    expect(() => captureException(new Error('boom'))).not.toThrow();
  });

  it('initSentry runs without throwing when given a fake DSN', () => {
    // We can't actually hit Sentry in tests, but we can verify the init path
    // doesn't crash on a syntactically valid DSN.
    expect(() =>
      initSentry({
        dsn: 'https://public@o0.ingest.sentry.io/0',
        environment: 'test',
        release: 'test-v1',
        tracesSampleRate: 0,
        profilesSampleRate: 0,
      }),
    ).not.toThrow();
  });

  it('initSentry is idempotent (second call is a no-op)', () => {
    const opts = {
      dsn: 'https://public@o0.ingest.sentry.io/0',
      environment: 'test',
      release: 'test-v1',
      tracesSampleRate: 0,
      profilesSampleRate: 0,
    };
    initSentry(opts);
    expect(() => initSentry(opts)).not.toThrow();
  });
});
