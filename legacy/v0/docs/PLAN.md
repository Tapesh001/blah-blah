# Starwind — implementation plan

## One continuous game

The base is Starry Nightrider's night-time bicycle ride, painterly village, collectible light and steeple delivery loop. The Clockmaker's Heart contributes a gear-placement puzzle. A broken bicycle chain interrupts the ride and opens a mechanical workbench: place the missing idler on its axle, fit the connecting chain and tension it. Tidewright contributes wind-driven sailing and beacon restoration. The same tactile turning interaction becomes the boat's rope winch. Tria Prima's actual deterministic terrain is adapted into the sailing map.

## Ordered build

1. Create a Three.js/Vite browser game with a painted starfield, hills, village, steeple, bicycle, sea and boat. Keep a coherent navy, lapis, teal and warm brass palette.
2. Implement cycling, braking, steering, jumping, orb collection, delivery and a guaranteed one-time chain break. Give players a clear objective and checkpoints.
3. Build the repair workbench with draggable gear choices, accessible click/keyboard placement, a chain connector and rotary tension control. Validate each mechanical step and test the repaired drivetrain.
4. Unlock the harbour after light delivery. Add sailing, apparent wind, sail trim, a dead zone into the wind, first/third person camera, an animated sail and an interactive rope/winch control.
5. Embed Tria Prima's MIT terrain with original height/region functions, a chapel landmark and dock. Add three reachable beacons, docking and a final completion state.
6. Add chart, pause/help, audio toggle, persisted checkpoints, reset/replay and touch controls. Check progression, bad input, reload, build output and browser rendering.
7. Publish a private preview when supported, and deliver source, controls and any remaining fidelity limitations.

## Evidence and fidelity

- Browser observed: Clockmaker title, organ/chamber progression, tray of 16T/32T gears, axle board, drag-to-ring prompt, output motion target, undo/clear/hint controls.
- Browser observed: Tidewright third-person boat, sail controls, compass, chart, wind warning, six beacon objective, hold-to-kindle, hull/oil UI.
- Starry page observed: bicycle controls, orb collection/delivery, steeple, gallery and painting attribution. Live scene initially remained on loading; shipped JS inspection is tracked separately.
- Tria Prima: source inspected at acce14089aeee01f3225a09a3a8a9532612359fb. See references/tria-prima-findings.md. Integrate actual terrain with preserved MIT notice.
- The combined route, chain break timing, repair sequence, first-person winch and three-beacon campaign are new design decisions. This is a playable combined adaptation, not a claim of byte-for-byte replication of all four full games.

## Acceptance checks

- Pedalling and steering move the bicycle; brakes and pause work.
- Chain break prevents propulsion and leads to a solvable puzzle; wrong gears do not solve it.
- Completing repair restores movement and survives reload.
- Delivery unlocks the sailing chapter; sailing is also available as a clearly labelled practice mode.
- Winch tension visibly changes sail angle; wind alignment changes boat speed.
- View toggle changes actual camera position between chase and cockpit views.
- Three beacons are reachable, can be lit, and unlock an explicit ending at Morne.
- Morne terrain uses the original height function for visuals and collision.
- Progress, chart, restart and sound controls work; production bundle builds.
