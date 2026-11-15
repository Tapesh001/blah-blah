import { createSandbox, registerSandboxFactory } from '@core';
import { startGame } from './runtime';
registerSandboxFactory(startGame);
export { createSandbox };
