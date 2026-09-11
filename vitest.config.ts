import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    maxWorkers: 2,
    isolate: false,
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
  },
});
