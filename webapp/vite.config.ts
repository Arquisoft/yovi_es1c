import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import '@testing-library/jest-dom/vitest';
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/game/socket.io': {
        target: process.env.VITE_DEV_GAMESERVICE_TARGET ?? 'http://localhost:3002',
        changeOrigin: true,
        ws: true,
      },
      '/api/game': {
        target: process.env.VITE_DEV_GAMESERVICE_TARGET ?? 'http://localhost:3002',
        changeOrigin: true,
        ws: true,
      },
      '/api/users': {
        target: process.env.VITE_DEV_USERS_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/auth': {
        target: process.env.VITE_DEV_AUTH_TARGET ?? 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/gamey': {
        target: process.env.VITE_DEV_GAMEY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
      },
      '/play': {
        target: process.env.VITE_DEV_GAMEY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
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
