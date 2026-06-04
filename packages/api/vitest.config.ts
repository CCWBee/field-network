import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Pick up tests co-located with source (src/**/*.test.ts and
    // src/**/__tests__/*.test.ts) as well as the dedicated tests/ tree.
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts', 'src/**/__tests__/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'dist',
        'tests',
        '**/*.d.ts',
      ],
    },
    // Increase timeout for E2E tests
    testTimeout: 30000,
    hookTimeout: 30000,
    // Run tests sequentially for E2E tests that modify shared state
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
