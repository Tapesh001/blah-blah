import type { SandboxOptions, Services } from '@contracts';
import {
  StubAudio,
  StubBench,
  StubCamera,
  StubGfx,
  StubOcean,
  StubPhysics,
  StubSave,
  StubTerrain,
  StubUi,
  StubWind,
} from '@core';
/** The only service replacement point. Supply real implementations via options.services. */
export function createServices(
  container: HTMLElement,
  options: SandboxOptions,
): Services {
  const provided = options.services ?? {};
  return {
    wind: provided.wind ?? new StubWind(),
    terrain: provided.terrain ?? new StubTerrain(Number(options.seed) || 7),
    ocean: provided.ocean ?? new StubOcean(),
    gfx: provided.gfx ?? new StubGfx(container, options.quality ?? 'medium'),
    camera: provided.camera ?? new StubCamera(container),
    physics: provided.physics ?? new StubPhysics(),
    audio: provided.audio ?? new StubAudio(),
    ui: provided.ui ?? new StubUi(),
    save: provided.save ?? new StubSave(),
    bench: provided.bench ?? new StubBench(),
  };
}
