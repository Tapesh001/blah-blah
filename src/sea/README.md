# Mansi ocean milestone

Part A is implemented as a standalone TypeScript module. The foundation that landed after this milestone introduced provisional shared contracts and a sandbox shell. The ocean module retains its explicit `update(dt)` clock and reusable sample output. Adapting it to the provisional `Ocean.sample(x, z, time)` service remains an integration task. The implemented Gerstner formula is documented in `ocean.ts` for the renderer and contract owner.

## Use

```js
import { createOcean } from './src/sea/index';
const env = { storm: 0.5, windHeading: 0.6, windSpeed: 12 };
const ocean = createOcean(env, seededRandom);
ocean.update(1 / 60);
const height = ocean.height(10, 20);
const sample = ocean.sample(10, 20); // height, normal, velocity
```

Pass a mutable environment and a seeded random function returning numbers in `[0, 1)`. `storm` is clamped to `[0, 1]`. Heading is the direction waves travel, measured from +X toward +Z. Directions stay fixed after initialization to preserve phase continuity when wind changes. Nine components spread across ±35 degrees, with an older swell at −50 degrees. Wind speed controls whitecaps between 7 and 20 m/s.

The public `waves` array contains plain numeric data for rendering. Treat it as read-only. Steepness is distributed equally across ten components, with an aggregate target of 0.25–0.6. Significant wave height uses `4 sqrt(sum(A²)/2)`. Amplitude, wavelength and steepness relax over ten seconds. Wave phase integrates deep-water angular frequency. Orbital velocity is the time derivative at a fixed material coordinate with instantaneous wave parameters held constant.

Pass a reused `{ height: 0, normal: { x: 0, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: 0 } }` as the third argument to `sample` to avoid output allocations. CPU and visual consumers must use the same waves, phases and displacement formula. The campaign renderer remains a later integration dependency.

## Run and verify

Run the usual Vite development server, then open `/sandbox/sail-ocean.html`. The ocean sandbox has its own loop. Storm, wind, pause and reset controls exercise this milestone. `/sandbox/sail.html` remains the foundation's chapter sandbox, with its debug API and lifecycle checks. Vite includes both pages in the production build.

```sh
npm test -- tests/sea/ocean.test.ts
npm run check
```

The ocean tests run under Vitest and are included automatically in the foundation's CI test selection. They cover the independent converged inversion reference, 1 cm accuracy, significant height targets, monotonic energy, ten-second smoothing, normals, orbital velocity, whitecaps, invalid inputs and a deterministic ten-minute storm soak.

The next unfinished work is Part B steps 1–4 and its polar test, followed by the M0 XPBD core, rope and cloth sandbox. Boat physics, winch, cloth and chapter progression require subsequent milestones.
