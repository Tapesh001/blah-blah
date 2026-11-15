# CODEX 1 — bike ride + chain repair bench

Paste to Codex: "Read `docs/agents/CODEX-1-bike-bench.md` and `src/play/api.ts`. Build it. Push branch `codex1/bike-bench`."

## Rules

- Only create/edit files in `src/play/bike/` and `src/play/bench/`. Touch nothing else.
- Code against `src/play/api.ts` (read-only). Claude builds the world and main loop and calls you.
- three.js `0.187.0`, TypeScript strict. `npm run typecheck` must pass. No new dependencies. No asset files: build all meshes in code.
- Must look good: `MeshStandardMaterial`/`MeshPhysicalMaterial`, `castShadow = true`, real detail. No flat boxes.
- Until Claude's world lands, test with a fake `World` (flat ground) in your own folder.

## Deliver two exports

```ts
// src/play/bike/index.ts
export function createBikeMode(): GameMode;
// src/play/bench/index.ts
export function createBench(kind: 'bike' | 'engine'): GameMode;
```

## 1. Bike mode (`createBikeMode`)

Reuse the physics already in `src/land/sim/bike.ts` if it fits; otherwise write new.

- Start at `world.places.bikeStart`. Finish (`done() = true`) within 12 m of `world.places.harbour`.
- Controls: W pedal, S brake, A/D lean-steer, Space hop, Z/X shift down/up, V toggles 3rd/1st person.
- Physics: speed from rider power through gear ratio; rolling + air drag using `world.windAt` (headwind slows, tailwind helps); gravity on slopes from `world.heightAt`; lean into turns, yaw rate = g·tan(lean)/speed; grip lower when `world.wet` is high and off-road (`roadNearest().dist > 4`); too fast for the corner = crash, respawn on road. Falls into water (`heightAt < 0.3`) = respawn.
- **Chain:** wear bar on HUD (`hud.set('chain', 0..1)`). When `roadNearest().progress > 0.45`, the next hard pedal stroke snaps the chain: no drive, `hud.prompt('Chain snapped — press E to repair')`. On E, set a public flag `needsBench = true`; main loop opens the bench, then calls your `repaired()` method to restore drive.
- Bike model: tube frame, spoked wheels that spin, chainring + cassette, chain, handlebars that turn. Rider: torso, head, legs that pedal, arms on bars, leans with the bike.
- Camera: 3rd person spring-follow behind/above, FOV widens with speed; 1st person at rider eyes with handlebars visible. Smooth blend on V.
- Effects: `world.burst('dust' | 'spray', ...)` from the rear tyre; `'sparks'` on crash.
- HUD: `speed`, `gear`, `chain`. Objective: "Ride to the harbour".

## 2. Bench (`createBench`)

Own close-up view: place camera yourself above a workbench you build (dark wood board, lamp glow, brass/steel gears with real teeth via `ExtrudeGeometry`). Reuse `src/mech/sim/evaluate.ts` for the gear logic if it fits.

- Board has axles (pegs). A driver gear and an output gear are fixed. A tray holds loose gears with different tooth counts.
- Mouse: drag a gear from the tray onto an axle (snap). Drag off to remove.
- Rules: gears mesh when centre distance = r1 + r2 (r = teeth × 0.004 m); meshed gears turn opposite ways; speed ratio = teeth ratio; overlap is not allowed (snap back).
- Hold Space = spin the driver; every connected gear turns at its true speed with teeth interlocking. Show output ratio + direction vs the goal.
- `'bike'`: one free axle, goal = output same direction as crank at 2.5×; then A/D turns a chain tensioner until a gauge is in the green band; then Space to test. Solved → `done() = true`.
- `'engine'`: two free axles, goal = output opposite direction at 0.5×, output is a big 40-tooth "Keystone" gear. Solved → `done() = true`.
- Sparks (`world.burst('sparks', ...)`) and a shake when gears clash. H = hint text.

## Done means

`npm run typecheck` passes, both factories exported, pushed to `codex1/bike-bench`. Write what works and what does not in `docs/handoff/codex1.md`.
