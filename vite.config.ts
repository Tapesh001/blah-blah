import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import { readdirSync } from 'node:fs';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  resolve: {
    alias: Object.fromEntries(
      [
        'contracts',
        'core',
        'gfx',
        'land',
        'mech',
        'sea',
        'sim',
        'isle',
        'world',
        'ui',
        'audio',
      ].map((name) => [
        '@' + name,
        fileURLToPath(new URL('./src/' + name, import.meta.url)),
      ]),
    ),
  },
  build: {
    rolldownOptions: {
      input: [
        root + 'index.html',
        ...readdirSync(root + 'sandbox')
          .filter((p) => p.endsWith('.html'))
          .map((p) => root + 'sandbox/' + p),
      ],
    },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
