import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'clover', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['dist/**', 'node_modules/**'],
      reportsDirectory: 'coverage',
    },
  },
  root: resolve(__dirname, '.'),
});