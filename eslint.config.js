import tseslint from 'typescript-eslint';
const folders = [
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
  'game',
];
const rules = (folder) => ({
  patterns: [
    ...folders
      .filter((other) => other !== folder && other !== 'sim')
      .map((other) => ({
        group: [
          '@' + other,
          '@' + other + '/**',
          '**/' + other,
          '**/' + other + '/**',
        ],
        message: 'Cross-owner imports go through @contracts or @sim.',
      })),
    {
      group: ['@sim/*', '**/sim/*'],
      message: 'Only the @sim public entry point is allowed.',
    },
  ],
});
export default [
  {
    ignores: [
      'legacy/**',
      '.local/**',
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  ...tseslint.configs.recommended,
  ...folders
    .filter((f) => f !== 'game')
    .map((folder) => ({
      files: ['src/' + folder + '/**/*.{ts,js}'],
      rules: { 'no-restricted-imports': ['error', rules(folder)] },
    })),
  {
    files: ['src/game/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: folders
            .filter((f) => f !== 'game')
            .map((f) => ({
              group: [
                '@' + f + '/*',
                '**/' + f + '/*',
                '!@' + f + '/index',
                '!@' + f + '/index.ts',
                '!**/' + f + '/index',
                '!**/' + f + '/index.ts',
              ],
              message:
                'Game composition may import public index.ts entry points only.',
            })),
        },
      ],
    },
  },
];
