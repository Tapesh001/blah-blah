import type { EnvState } from '@contracts';
import { clamp, damp } from './math';
export function createEnvironment(): EnvState {
  return {
    storm: 0,
    time: 0,
    timeOfDay: 0.35,
    rain: 0,
    wetness: 0,
    lightning: 0,
    sunDir: { x: 0.4, y: 0.8, z: 0.2 },
  };
}
/** M0 director: exact chapter timeline awaits the missing master plan. */
export function advanceEnvironment(
  env: EnvState,
  dt: number,
  progress: number,
  override: number | null,
): void {
  env.time += dt;
  env.storm = override ?? clamp(progress);
  env.rain = clamp((env.storm - 0.3) / 0.7);
  env.wetness = damp(
    env.wetness,
    env.rain,
    1 / (env.rain > env.wetness ? 60 : 240),
    dt,
  );
}
