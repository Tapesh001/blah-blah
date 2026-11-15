import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/play/bike/**/*.test.ts', 'src/play/bench/**/*.test.ts'],
    environment: 'node',
  },
});
