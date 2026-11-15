# CODEX 2 — sailing boat, cloth sail, rope, first-person winch

Paste to Codex: "Read `docs/agents/CODEX-2-boat-sail.md` and `src/play/api.ts`. Build it. Push branch `codex2/boat-sail`."

## Rules
- Only create/edit files in `src/play/boat/`. Touch nothing else.
- Code against `src/play/api.ts` (read-only). Claude builds the world (ocean, sky, islands, wind) and main loop and calls you.
- three.js `0.187.0`, TypeScript strict. `npm run typecheck` must pass. No new dependencies. No asset files: build all meshes in code.
- Must look good: `MeshStandardMaterial`/`MeshPhysicalMaterial`, `castShadow = true`, real detail. No flat boxes.
- Until Claude's world lands, test with a fake `World` (flat sea, constant wind) in your own folder.

## Deliver

```ts
// src/play/boat/index.ts
export function createBoatMode(): GameMode;
```

## What it does
Sail from `world.places.boatStart` to `world.places.cove`. `done() = true` within 30 m of the cove. Wind blows against the direct course, so the player must tack.

### Controls
- A/D rudder. W/S raise/reef sail (3 sizes).
- **V = switch 3rd person ↔ 1st person.** Smooth blend, no cut.
- In 1st person (seated at the helm, mouse looks around): **hold E = grind the winch fast gear** (quick, but stalls when the rope load is high); **hold Q = grind low gear** (slow, strong); **hold R = ease the rope out**. The winch only works in 1st person; in 3rd person show `hud.prompt('V — go to the winch')` when trim is bad.

### Physics
- Boat: position, heading, forward speed, sideways slip, heel. Float on `world.oceanHeight` sampled at bow, stern, port, starboard → sets height, pitch, roll. Run aground when `world.heightAt` under the bow > -0.4 (stop, push back).
- Apparent wind = `world.windAt` − boat velocity. Angle of it to the bow = `awa`.
- Rope length `sheet` 0 (tight) .. 1 (eased) limits the boom: boom angle = min(|awa|, 5° + sheet × 80°), to leeward.
- Angle of attack = |awa| − boom angle. Lift coefficient: 0 below 4° (sail **luffs**, flaps, no drive), up to 1.3 at ~25°, falling after 35° (stalled). Drag 0.05 + 1.1·sin².
- Force = ½·1.225·wind²·area·(lift ⟂ wind + drag ∥ wind). Forward part drives the boat; side part heels it and causes slip (keel resists). Hull drag ∝ speed².
- So: pointing into the wind = no drive; wrong trim = slow; over-trimmed in a gust = big heel. Do not script any of this.
- Rope load = sail force × 0.6. Winch fast gear stops turning above ~700 N; low gear works to ~2500 N.
- `trim` = current drive ÷ best possible drive at this heading. `hud.set('trim', 0..1)`.

### What the player sees
- **Boat:** shaped wooden hull (lofted, not a box), thwarts, mast, boom that swings, tiller that moves, lantern glowing at the masthead.
- **Sail = simulated cloth.** Verlet/XPBD grid (about 12 × 16), pinned along mast and boom, pushed by the apparent wind, visibly bellies when full and flogs when luffing. Double-sided, soft shading, recompute normals each frame. Add 3 small ribbon "telltales" that stream when trim is good and flutter when bad.
- **Rope:** a simulated sagging rope from the boom end through a block to the winch drum; tight when loaded, slack and swinging when eased.
- **Winch:** drum + handle that really turn when grinding, visible gears, clicks. In low gear the handle turns the other way.
- **Cameras:** 3rd person behind/above the stern, horizon kept steady; 1st person at head height in the cockpit with tiller, winch and sail in view.
- **Effects:** `world.burst('spray', ...)` at the bow scaled by speed and when slamming into waves.
- **HUD:** `speed`, `trim`, `load`, `heel`, `sail`. Objective: "Sail to the far island". Prompts teach: "Too close to the wind — bear away", "Ease the rope (R)", "Use low gear (Q)".

## Done means
`npm run typecheck` passes, factory exported, pushed to `codex2/boat-sail`. Write what works and what does not in `docs/handoff/codex2.md`.
