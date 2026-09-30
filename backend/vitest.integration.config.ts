import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['integration/**/*.integration.test.ts'],
    fileParallelism: false,
    testTimeout: 45_000,
    hookTimeout: 15_000,
  },
})
