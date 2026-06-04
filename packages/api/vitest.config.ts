import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/helpers/env.ts'],
    globalSetup: './tests/setup.ts',
    pool: 'forks',
    poolOptions: {
      forks: {
        // Single fork — DB cleanup is sequential anyway, and tests share
        // the test postgres + minio. Parallelising would race.
        singleFork: true,
      },
    },
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
