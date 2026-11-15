# Brief — shobhit: platform, world engine, UX, audio, integration captain

> **Paste this into Codex to start:**
> "You are **shobhit**. Read `AGENTS.md`, `docs/plan/MASTER-PLAN.md`, `docs/agents/shobhit.md`,
> `src/contracts/index.ts` and everything in `docs/handoff/`. Then do the next unfinished task in
> your brief, in order, and finish the session as `AGENTS.md` says."

## Your job

You build the frame the other three plug into, and you are the only one who merges to `main`. Your
first session unblocks everyone, so **M0 comes before anything else and must be pushed fast**.

You own: `src/core/`, `src/world/` (the terrain engine, not the island data files), `src/ui/`,
`src/audio/`, `src/game/`, `src/main.ts`, `index.html`, `sandbox/index.html` and the sandbox helper,
`e2e/`, all config, CI, `legacy/`, `README.md`, `docs/handoff/STATUS.md`.

You implement these contract types: `Rng`, `EnvState` (storm director), `WindField`, `Terrain`,
`InputState`, `CameraRig`, `Physics`, `AudioBus`, `Ui`, `SaveStore`, `EventBus`, `GameContext`,
`DebugApi`. You consume `Gfx` (tapesh), `Ocean` and chapters `sail`/`isle` (mansi), chapter `ride`
and `Bench` (aviraj).

CPU budget: wind bake + terrain queries + core ≤ 1.5 ms a frame.

---

## M0 — Foundation (session 1; push within the first hour or two)

**S0.1 Retire the prototype.** Branch `shobhit/m0-foundation`. Move `src/*.js`, `src/*.css`,
`index.html`, `tests/game.test.js`, `docs/PLAN.md`, `docs/starry-rea-findings.md`,
`docs/tria-prima-findings.md` into `legacy/v0/`. Delete `src/vendor/tria-prima/world/heightmap.js`
(that is another game's island). Keep `core/noise.js`, `core/rng.js`, `core/math.js` only if you
actually import them, with their MIT header, under `src/core/vendor/`. Keep `public/licenses/`.
Leave `src/contracts/index.ts` exactly as it is.

**S0.2 Toolchain.** TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
off), Vite, Vitest, ESLint + Prettier, Playwright. Pin exact versions; upgrade three to the latest
stable release and add `@types/three` at the matching version. Path aliases `@contracts`, `@core`,
`@gfx`, `@land`, `@mech`, `@sea`, `@sim`, `@isle`, `@world`, `@ui`, `@audio`. Scripts: `dev`,
`build`, `preview`, `typecheck`, `lint`, `test`, `e2e`, `check`. Rename the package `cog-and-gale`.
ESLint rule that fails on imports across owner folders (use `no-restricted-imports` per folder
override). Allowed: `@contracts` from anywhere, `@sim` (its `index.ts` only) from anywhere, and each
folder's `index.ts` from `src/game/`.

**S0.3 Core loop** (`src/core/loop.ts`). Fixed 60 Hz accumulator, at most 5 catch-up steps, `alpha`
for interpolation, pause on hidden tab, `ctx.timeScale` honoured (chapter `dt = FIXED_DT *
timeScale`). Order per step: input snapshot → storm director → wind bake → chapter `fixedUpdate` →
physics step. Per frame: chapter `frameUpdate` → camera → `gfx.setEnvironment` → `gfx.render`.

**S0.4 Small pieces.** Seeded `Rng` (xoshiro128** with string-hash `fork`), typed `EventBus`, math
helpers (damp, angle wrap, remap, smoothstep, spring).

**S0.5 Stubs so nobody waits** (`src/core/stubs/`): `StubWind` (constant vector plus one moving
sine gust, with a valid `WindBake`), `StubTerrain` (two noise cones at the `WORLD` island positions,
sea elsewhere), `StubOcean` (four Gerstner waves, exact contract formula), `StubGfx` (plain
`WebGLRenderer`, a sky colour, `MeshStandardMaterial` behind the `MaterialKit` interface, no-op
`Fx`), `StubBench` (resolves solved after 1 s), no-op `AudioBus`/`Ui`. Each real system replaces its
stub through one factory in `src/game/services.ts`.

**S0.6 Chapters and state machine** (`src/game/`). `title → ride → sail → isle → ending`. Register
chapters through a table; missing ones fall back to a stub chapter that shows its name and completes
on `interact`. Deep links: `?chapter=sail&cp=squall&storm=0.8&q=low&seed=7`.

**S0.7 Sandbox harness.** `sandbox/index.html` lists every page. `createSandbox(options)` in
`src/core/sandbox.ts` returns a ready `GameContext` built from stubs (or real services when
present), runs the loop, and exposes `window.__cg`. Create empty pages `sandbox/bike.html`,
`bench.html`, `sail.html`, `cloth.html`, `isle.html`, `gfx-ocean.html`, `gfx-sky.html`,
`gfx-terrain.html` each calling a `mount(ctx)` exported from the owner's folder if it exists.

**S0.8 CI.** GitHub Action: `npm ci`, `npm run check`. Second job: `npm run e2e` (Chromium, software
GL allowed).

**Acceptance M0:** `npm run check` green; `npm run dev` shows a stub title and lets `interact` walk
through all stub chapters; unit tests for loop timing (N frames → exactly the right step count), rng
determinism and event bus; pushed to `main`; `docs/handoff/STATUS.md` says "M0 landed in `<sha>`".

---

## M1 — Services the gameplay needs

**S1.1 Input** (`src/core/input/`). Keyboard, mouse (pointer lock in first person), gamepad, touch
(left thumb = steer/throttle, right thumb = look, on-screen action buttons). Produce one
`InputState` per fixed step with correct `pressed`/`released` edges even if several frames pass.
Default bindings: W/S throttle, A/D steer, Space jump, Shift run, E interact/haul, Q haulLow,
R ease, Z/X shift down/up, V camera, H hint, U undo, M map, Esc pause, ArrowUp/Down reef. Rebinding
table saved with settings. Tests: edge detection, dead zones, simultaneous devices.

**S1.2 Camera rig** (`src/core/camera.ts`). Modes `chase`, `first`, `bench`, `cinematic`. Chase is a
critically damped spring arm toward the anchor's pose, pulled in when the arm would cross terrain
(sample `terrain.height` along it) and kept 0.3 m above water. First person adds look yaw/pitch on
top of the anchor pose with limits the anchor can set later through its pose. Blend between any two
modes over `blendSeconds` by interpolating position, target and FOV (no cut). Trauma shake with
squared falloff. FOV kick is the anchor's business (it sets `fov` in the pose). Tests: blend
continuity (no jump > 5 cm between consecutive frames), terrain avoidance.

**S1.3 Storm director and wind** (`src/core/env/`). `storm` follows chapter progress along the table
in the master plan (chapters report progress 0..1 through `ctx.setRouteProgress`; `__cg.setStorm`
overrides). In Chapter 2 the wind veers 40° and gusts to 20 m/s as the boat crosses
`WORLD.squallLine`. Derive `timeOfDay`, `rain`, `wetness` (first-order lag, 60 s up, 240 s down),
`lightning` (random bolts when storm > 0.7, deterministic from `rng`), `sunDir`.
Wind = base (direction and speed from the table, slow meander ±12°) × height gradient
`(y/10)^0.14` + gust cells (two octaves of noise advected downwind at base speed; amplitude
`0.15 + 0.45 * storm` of base) + terrain: shelter in the lee of ground higher than the sample point
(march 8 samples upwind, reduce speed up to 70%), speed-up over ridges (up to +30% where the upwind
slope rises). Bake a 64×64 `WindBake` covering 512 m centred on the camera every step. Tests: gusts
move downwind; lee side is calmer; bake matches `sample` within 5% at texel centres; finite for ten
minutes at storm 1.

**S1.4 Terrain engine** (`src/world/terrain.ts`). Height = max over islands of
`falloff(distance / radius) * (ridged fbm scaled to peak)` minus seabed depth, then the island's
`sculpt`, then roads: within half-width of a spline, blend to the spline's smoothed profile; shoulder
blend 4 m. Cache each island on a 2 m grid (`Float32Array`) with bilinear sampling; `normal` by
central differences; `surface` from road mask → slope → height bands (sand near sea level, rock on
slopes > 38°, grass otherwise). Export `heightGrid(islandId)` for tapesh's height textures and for
the Rapier heightfield. Island data files belong to aviraj and mansi; you provide the type helpers
and a `defineIsland()` validator. Tests: road is drivable (grade ≤ 14% along every spline),
continuity, determinism by seed.

**S1.5 Physics wrapper** (`src/core/physics.ts`). Initialise Rapier, heightfield colliders per
island, `raycast`, static props, and a kinematic capsule `CharacterBody` (step height 0.35 m, slope
limit 45°, slide on steeper). Walking tuning for mansi: walk 2.2 m/s, run 4.5 m/s, jump 1.1 m.

**S1.6 Save** (`src/core/save.ts`). Versioned `SaveData` in `localStorage`, validated on read
(reject unknown versions, clamp numbers, drop malformed parts). `checkpoint(id)` snapshots inventory,
drivetrain and stats. Tests carried over in spirit from `legacy/v0/tests`.

**S1.7 Minimal HUD and debug API.** Objective line, speed, prompt, toast; `window.__cg` complete.

**Acceptance M1:** with the others' M1 work merged, `e2e/run.spec.ts` plays title → ride → bench →
sail → cove using real key events plus `__cg` shortcuts and asserts `chapter:complete` for each.

---

## M2 — UI and audio

**S2.1 UI** (`src/ui/`, DOM + CSS over the canvas; no framework). Title (over the live sea), pause,
settings (quality tier, render scale, audio levels, rebinding, assists: balance, trim ghost, reduced
motion, hold-versus-toggle), chart (canvas: both islands, reef, wind arrow, boat track), ending
(time, top speed, crashes, capsizes, repairs, hints).
HUD by chapter — bike: speed, cadence band, gear, chain-wear bar that reddens; boat: apparent-wind
dial with the no-go wedge, sheet load, trim quality arc, heel, reef; isle: compass and gust warning.
All HUD reads `HudModel` only. Tutorial prompts are data-driven (`{when, text, action}`) and never
block input. Readable at 1280×720 and on a phone in landscape. Style: quiet, instrument-like, thin
lines, one accent colour; text never covers the centre third of the screen.

**S2.2 Audio engine** (`src/audio/`, Web Audio, all synthesised, started on first user gesture).
Continuous voices driven by `AudioParam`:

- wind: three band-passed noise layers; cutoff and gain follow `windSpeed`; `gust` adds a swell;
  first-person adds ear-buffet low rumble.
- sea: slow filtered noise swells (`storm`), hull wash (`boatSpeed`), rain hiss (`rain`).
- bike: freewheel tick at `wheelSpeed`, chain whirr at `cadence` that roughens with `chainWear`,
  tyre hum per surface, skid noise from `tyreSlip`.
- sail and winch: luffing flap from `luff`, sheet creak from `sheetLoad`, ratchet clicks at
  `winchRate`.
- bench: tooth-pass ticks at `benchRpm`.
  One-shots for every `AudioShot` (thunder delayed by distance / 343 m/s, with a low-pass tail).
  Music (last): a generative bed — a slow chord cycle in one mode per chapter, layers added as `storm`
  rises, resolving to major when the engine starts. Master limiter. Tests: param smoothing has no
  zipper steps; no node leak after 1000 shots.

**Acceptance M2:** every HUD value moves in play; audio follows wind and speed; settings persist.

---

## M3 / M4 — Integration and ship

- Merge rounds after every session: order tapesh → aviraj → mansi; resolve only in favour of the
  contract; run `check` and `e2e`; write `docs/handoff/STATUS.md` (what merged, what failed, who
  owes what).
- Apply accepted contract changes; bump `CONTRACT_VERSION`.
- `e2e/soak.spec.ts`: ten minutes at storm 1 in each chapter, assert no console errors and finite
  `__cg.stats()`. `e2e/perf.spec.ts`: record `?perf=1` numbers per tier.
- Accessibility: full keyboard path, reduced motion disables shake and speed blur, colour-independent
  gauges, text scale.
- Loading screen with real progress (chapter `load` promises); time-to-title ≤ 4 s.
- Deploy the static `dist/` (existing `.openai/hosting.json` or any static host). README with
  controls. Credits and licences page generated from `public/licenses/`.
- Final review against `docs/plan/REFERENCE-STUDY.md`: nothing resembles the references.

## Tests you must have

Loop step counts; rng and wind determinism; input edges; camera blend continuity; terrain road
grades; save validation; storm director timeline; the full-run and soak e2e specs.

## Requests you should expect

- tapesh: height grids, `WindBake` layout questions, quality settings plumbing.
- aviraj and mansi: extra `ActionId`s, HUD fields, audio parameters → these are contract changes;
  batch them and apply once per round.
