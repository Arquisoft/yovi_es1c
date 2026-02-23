import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
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

        /*TODO: Se excluyen de momento porque ahora mismo no tienen funcionalidad alguna.
            Quitar cuando se implementen para probarlas.
        */
        'src/features/auth/api/authApi.ts',
        'src/features/game/api/gameyClient.ts',
      ],
    },
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
  },
})
