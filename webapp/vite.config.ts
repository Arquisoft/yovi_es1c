import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import '@testing-library/jest-dom/vitest';
export default defineConfig({
  plugins: [react()],
  test: {
    pool: 'threads',
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    testTimeout: 60000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 75,
        branches: 70,
      },
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/setupTests.ts',
        '**/index.ts',
        'src/main.tsx',
      ],
    },
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
  },
})
