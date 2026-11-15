import type { GameContext, SandboxFactory, SandboxOptions } from '@contracts';
let factory: SandboxFactory | undefined;
/** Composition root injects the factory: core never imports another owner. */
export function registerSandboxFactory(value: SandboxFactory): void {
  factory = value;
}
export async function createSandbox(
  options: SandboxOptions = {},
): Promise<GameContext> {
  if (!factory)
    throw new Error('Import src/game/sandbox before creating a sandbox.');
  return factory(options);
}
