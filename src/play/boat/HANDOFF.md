# Codex 2 boat and sail

Implemented against the read-only `src/play/api.ts` from Claude's `ef7d378` world branch. All authored changes are under `src/play/boat/`. The user explicitly requested that this handoff stay inside the same folder.

## Entry point

`index.ts` exports `createBoatMode(): GameMode`. Claude's existing eager module discovery picks it up automatically. The mode adds its own boat group on `enter`, starts at `world.places.boatStart`, updates the supplied camera, and returns `done() === true` within 30 metres of `world.places.cove`. `exit` releases geometry, materials and synthesized audio, removes its group, and restores the camera FOV. Re-entry is supported.

## Working behavior

- Fixed 120 Hz boat steps use apparent wind, sail lift and drag, quadratic hull resistance, keel resistance, heel and three reef areas. Four ocean samples supply heave, pitch and wave roll. Bow terrain samples stop and push back a grounded hull.
- A/D steers. W raises one sail step and S reefs one step. V smoothly blends chase and cockpit cameras. Mouse look is consumed from the shared input in the cockpit.
- E hauls quickly, Q hauls through the reduction gear, and R accelerates sheet payout. All three are locked outside the cockpit. The fast gear stalls at 700 N and low gear at 2500 N. The pawl holds immediately after release. The handle reverses in low gear while the drum continues hauling.
- The procedural boat has a lofted hull, clinker laps, frames, fasteners, floor planks, thwarts, mast and stays, swinging boom, rudder/tiller, masthead lantern, blocks and an exposed geared winch. Meshes cast and receive shadows with Standard/Physical materials.
- A 12 by 16 cell cloth grid uses moving mast/foot pins, shear, structural, bending and batten constraints, apparent-wind pressure and luff flutter. Reefing contracts the sail smoothly. Three ribbon telltales respond to trim. A separate constrained sheet follows boom, deck block and drum, with load-dependent slack.
- Gauges publish speed in m/s, trim in 0–1, load in N, heel in degrees and sail as an area percentage. Prompts explain bearing away, cockpit entry, gearing, easing and reefing. Bow spray and wave-slam bursts go through `world.burst`.
- Ratchet clicks are synthesized after browser user activation. No assets or dependencies were added.

## Verification

```sh
npm run typecheck
node node_modules/vitest/vitest.mjs run --config src/play/boat/vitest.config.ts
node node_modules/eslint/bin/eslint.js src/play/boat
node node_modules/prettier/bin/prettier.cjs --check src/play/boat
npm run build
```

Eight scoped tests cover aerodynamic trim and downwind drive, gear stall thresholds and cockpit lockout, grounding and reef steps, four-point flotation, deterministic ten-minute gust physics, a one-minute cloth/rope wind-and-reef soak, resource cleanup, cove completion, camera continuity and HUD publication. The tests live in this owner folder and use the explicit Vitest configuration above because the shared test configuration selects `tests/`.

For the flat-sea/constant-wind fixture, run the Vite development server and open `/src/play/boat/demo.html`. The fixture has a wind slider and reset control. This development page is separate from the shared production entry point. The production build includes the real mode through Claude's existing module discovery.

Browser checks confirmed the detailed boat and sail render, V enters the cockpit, and holding E changes trim and load. In the shared world, skipping the bike preview with N entered the boat mode. Bearing away with D produced drive. Cockpit hauling improved displayed trim from 0.6 to 1.0 and the boat accelerated. The browser reported no error logs during that check.

## Remaining validation and tuning

A complete manual harbour-to-cove crossing and a full-duration cloth storm soak remain unverified. The one-minute fabric test uses gusts up to 26 m/s and repeated boom/reef changes. The audio path ran without browser errors, but audible quality has not been assessed.

The sailing model uses simplified yaw response with low-speed steering authority for departure. Cloth pressure is evaluated against the boom-plane normal, with distance constraints producing the belly. Telltales are deforming ribbon meshes. These are deliberate real-time approximations. The shared world owns weather progression and the main HUD layout.
