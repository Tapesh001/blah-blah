# CODEX 1 — bicycle and mechanism handoff

Delivered against the read-only `src/play/api.ts`, with Three.js 0.187.0 and no
new dependencies or asset files. Implementation and tests are confined to
`src/play/bike/` and `src/play/bench/`; this explicitly requested handoff is the
only additional authored path. The user also authorized merging Claude's
existing shared-world branch as a prerequisite, unchanged.

## Factories and integration

- `createBikeMode()` returns a `GameMode` with writable `needsBench` and a
  `repaired()` method. Claude's current main loop already consumes both.
- `createBench('bike' | 'engine')` returns a `GameMode`. The bike bench works
  with the main loop's suspend → repair → resume sequence.
- The engine factory is complete, but the current shared main loop only opens
  `createBench('bike')`. Claude still needs to call the engine factory at the
  appropriate story transition; this task does not edit that loop.
- Heading matches the API: forward `(sin h, 0, -cos h)`, model faces local -Z,
  yaw `-h`, with the rider visibly leaning towards the turn.

## What works

### Ride

W/S pedal and brake, A/D lean-steer, Space edge-triggered hop, Z/X shift with a
0.25-second torque interruption, V blends chase/eye cameras. Drive conserves
power through the selected cog; wind, drag, rolling resistance, sampled slope,
wet/off-road grip and sustained corner overload affect the ride. Water and
crashes return the rider to the last safe road point without clearing damage.
Completion uses the requested inclusive 12-metre harbour radius.

Passing 45% road progress arms the chain. Sustained hard pedalling snaps it,
disables drive and exposes the E-to-repair prompt/flag. Repair clears damage,
restores drive and the ride objective, and does not repeat the scripted failure.
HUD updates `speed` in m/s, one-based `gear` and `chain` in 0..1. Tyre dust/spray
and crash sparks use the world's burst API.

The bike is a reduced game model with power/drag constants reused from the
earlier land simulation. It deliberately uses the newly requested balanced
lean-to-yaw relation rather than duplicating the old pendulum controller.

### Bench

Raycast mouse dragging lifts a tray/mounted gear, previews a nearby free peg,
snaps legal placements, rejects overlap with sparks/shake, and removes a part
when dropped off the pegs. Fixed gears cannot be moved. Graph propagation gives
true signed speed ratios; tooth phases remain aligned during rotation.

- Bike: 30T driver → **24T idler** → 12T output, **2.5× same direction**.
  Use A/D to put tension at **55–72%**, then hold Space for one second.
- Engine: 20T driver → **24T** → **32T** → 40T Keystone,
  **0.5× opposite direction**; hold Space for one second.
- H gives progressively more explicit hints. Optional keyboard placement:
  1–4 selects a tray gear, Tab cycles free pegs, Enter places, Backspace lifts.

Both modes remove their own meshes, lights, generated textures and geometry on
exit. The bench restores the previous camera pose, projection and near plane.

## Graphics pass

All geometry and maps are procedural. The bike has clear-coated paint, brass
accents, frame weld beads, 32 spokes per wheel, 144 tread instances per tyre,
perforated disc rotors and calipers, brake cables, correct cassette tooth counts,
a shifting chain line, separate moving chain plates/rollers, curved bars and
pedals. The rider has animated two-bone legs, arms following the bars, helmet,
straps, face details, goggles, and textured clothing/leather.

The bench has bevelled wood planks, turned legs, metal fixings, an articulated
lamp with shadow-casting warm light, cool fill/rim lights, an oil can and shop
tools, bolt heads, wear rings, an actual tension dial and true-tooth-count
involute-flank gears made with `ExtrudeGeometry`.

512×512 colour, normal and roughness maps are generated in memory for brushed
metal, wood, woven cloth and leather. Physical materials add anisotropy and
clearcoat. Instance buffers keep repeated treads, spokes and chain hardware
from becoming separate draw calls. The added detail is intended for desktop
graphics; no GPU/frame-rate guarantee has been measured.

## Verification

```sh
npm run typecheck
npx vitest run --config src/play/bike/vitest.config.ts
npx eslint src/play/bike src/play/bench
npm test
npm run build
```

The focused suite covers drive/wind/braking, gears, chain pacing and repair,
hop, wet/off-road crashes, water recovery, harbour completion, camera toggling,
gear ratios and interlocking phases, real Three.js raycast drag/drop in a fake
World, clash rejection, hints, held-test/tension gating, resource disposal,
finite generated geometry and the complete bike → bench → repaired ride flow.

A development-only test stand is available at
`/src/play/bike/demo.html` under `npm run dev`. It can select either bench or a
flat-world ride, and its ridge-trial button exercises the actual repair flow.
The fixture and controls live entirely in the bike folder.

**Not visually verified:** browser approval declined access to the local test
stand. No browser screenshots, real mouse/keyboard event delivery or GPU
performance are claimed. The mode tests exercise the input API and Three.js
Raycaster directly. The engine's story integration remains with the main-loop
owner, as noted above.

## Published stages

- Shared-world prerequisite: PR #4 (existing Claude branch, user-authorized).
- Bike mode and procedural rider: PR #5, merged into main.
- Interactive bike/engine benches: PR #6, merged into main.
- Detailed graphics, standalone test stand and final integration checks are
  published from the same `codex1/bike-bench` branch as the final stage.
