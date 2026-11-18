import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Test files share one test database; run them sequentially.
    fileParallelism: false,
  },
});
