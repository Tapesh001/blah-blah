import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/play/boat/*.test.ts'], environment: 'node' },
});
