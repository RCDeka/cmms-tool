import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    // argon2 hashing in the seed makes some suites slower than the default 5 s budget.
    testTimeout: 20000,
  },
});
