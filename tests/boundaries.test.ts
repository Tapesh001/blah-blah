import { ESLint } from 'eslint';
import { it, expect } from 'vitest';
const eslint = new ESLint();
it.each([
  ['src/core/example.ts', "import { internal } from '@sea/private';", true],
  ['src/core/example.ts', "import { internal } from '../sea/private';", true],
  [
    'src/sea/deep/example.ts',
    "import { internal } from '../../core/rng';",
    true,
  ],
  ['src/game/example.ts', "import { internal } from '@core/stubs/wind';", true],
  [
    'src/game/example.ts',
    "import { internal } from '../core/stubs/wind';",
    true,
  ],
  ['src/core/example.ts', "import { internal } from '@sim/private';", true],
  ['src/sea/example.ts', "import { internal } from '@contracts';", false],
  ['src/sea/example.ts', "import { internal } from '@sim';", false],
  ['src/game/example.ts', "import { internal } from '@core';", false],
  ['src/game/example.ts', "import { internal } from '../core/index';", false],
  ['src/core/example.ts', "import { internal } from './rng';", false],
] as const)(
  'enforces boundaries for %s: %s',
  async (filePath, code, restricted) => {
    const [result] = await eslint.lintText(code, { filePath });
    expect(
      result?.messages.some(
        (message) => message.ruleId === 'no-restricted-imports',
      ),
    ).toBe(restricted);
  },
);
