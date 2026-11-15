# Starry Nightrider — REA and shipped-source inspection

Captured public HTML and its linked JavaScript on 2026-11-14 from https://starrynightrider.com/. Captures are in `references/starry/`; they were inspected, not executed or copied into the new game.

## Actual REA execution

- Installed skill followed: `C:/Users/Lenovo/.codex/skills/reverse-engineer-anything/SKILL.md`, with JavaScript and connection-recovery guides.
- No REA MCP server tools were connected. Official `rea-agents@6.9.0` refused Node 26.9.0; its minimum for Node 26 is 26.12.1.
- Official npm package `rea-agents@6.0.0` supports Node >=26.0.0 and successfully ran through its public `rea.cmd` launcher. No Node upgrade, engine installation or MCP registration change was made.
- Operation: `analyze_javascript_application`, on `references/starry-analysis`, containing byte-identical copies of `index-BY2CcXjY.js` and `hails-DeolUH4Z.js`.
- Evidence ID: `ev_93e3b80201a3d608d9e7984f66f718bc61bc93b4b47bd0817e2671b6062b002e`.
- Input directory SHA-256: `2997ae5e2928727cb98c749da26d08e36599fac56b8daf687285a1e929d70e0b`.
- Full original CLI JSON envelope: `references/evidence/starry-rea.json` (111,363,468 bytes; keep out of deployment).
- Compact projection from that Evidence: `references/evidence/starry-summary.json`.
- Captured source URLs, hashes, byte ranges and selected direct-source excerpts: `references/evidence/starry-capture-manifest.json`.

REA parsed both selected scripts (606,973 bytes) with no parse failures, visiting 119,633 AST nodes and recording 183 findings. Its application graph reports complete coverage **of these selected inputs**. Its semantic graph is **partial**: the 100,000-node ceiling was reached, with 10,188 unknown records. The standalone 293 KB `kit` chunk, lazy portal modules, CSS, artwork, audio, server implementation and other resources were not analyzed. The main bundle itself contains both Three renderer code and application code. Some REA endpoint candidates are WebGL extension strings; candidate counts are not a verified network API inventory.

## Direct observations in the captured source

These are manual static observations anchored to the captured source, not claims that REA executed the game. The manifest includes exact byte offsets and excerpts.

| Feature | Source observation | Basis |
| --- | --- | --- |
| Input | `Ps` maps W/up to throttle, S/down to brake, A/left and D/right to steering; E/Shift to tricks, Space to jump. Touch stick and gamepad paths feed the same input state. | Main JS line 6223, byte 510833 onward |
| Bicycle controller | `js` stores position, heading, speed, vertical velocity, pitch, lean, wheel/crank phase, grounded/walking/flying state. Speed is integrated with acceleration/braking, slopes change speed, terrain is probed ahead/behind, and camera follows the rider. | Main JS line 6223, byte 495605 onward |
| Movement tuning | Nearby constants include ordinary ride target 8.2 and pedal target 15.5; controller also handles sprint, jumps, collision, coyote time, lean, squash and tricks. These are code values, not measured real-world speeds. | Main JS line 6223 |
| Follow camera | Camera distance varies with speed, airborne height, boost and walking state; yaw and look offsets are smoothed. | Main JS line 6223, byte 509453 |
| Orb delivery | `sd(e,t)` adds carried points plus a bonus to banked points, clears carried points, updates UI, plays delivery feedback and reports the score. Steeple proximity/entry checks trigger the flow elsewhere in the update loop. | Main JS line 6288, byte 583343 |
| Flight gesture | `fd()` retains Space taps from the last 1100 ms; three taps set wings and invoke takeoff, provided the game is in riding mode and the rider is neither already winged nor walking. | Main JS line 6288, byte 585058 |
| Walking | F toggles walking/riding through the controller. | Main JS line 6288, byte 585738 |
| Rendering | Three/WebGL renderer code, GLSL shader strings, render targets and composite effects are embedded. Painting images are loaded; this is not solely a flat procedural sky. | Main bundle renderer; painting load near byte 574084 |
| Other riders | A WebSocket client reconnects, receives state and sends rider position, heading, speed, pose and carried count. Reachability/backend behavior was not tested. | Main JS line 6225, byte 549730 |
| Town dialogue | `hails` exports voice/persona dialogue tables and line selection helpers. | `hails-DeolUH4Z.js` |

## Reconstruction implications

The base should preserve a third-person bicycle, blue/yellow painted night environment, steer/throttle/brake input, rolling terrain, glowing collectibles and a steeple delivery objective. A chain failure and repair workshop are new mechanics required by this project; this bounded inspection does not establish they exist upstream. Sailing, rope/cloth trim, first-person deck view and Morne integration are also project additions.

Implement the combined game with its own controller, rendering and progression. The captured closed-source game files are reference evidence, not runtime dependencies. No reuse licence was established for those shipped game scripts. Tria Prima has a separately verified MIT licence permitting source adaptation with notice retention.

## Remaining limits

No JavaScript was executed by REA. No claim about playability, exact visual parity, live multiplayer, network service availability or complete game feature coverage follows from this static pass. Browser visual observations are owned by the main task and should be documented separately. The CLI completed and exited; no persistent MCP/native analysis session remains to reset.
