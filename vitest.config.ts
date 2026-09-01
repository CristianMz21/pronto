import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'tests/unit/**/*.{test,spec}.{ts,tsx}',
      'tests/integration/**/*.{test,spec}.{ts,tsx}',
    ],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: [
        'lib/**/*.ts',
        'app/**/*.ts',
        'components/**/*.ts',
        'hooks/**/*.ts',
        'src/**/*.ts',
        'proxy.ts',
      ],
      thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
