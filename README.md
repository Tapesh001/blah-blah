# Starwind — A Painted Voyage

A first playable combined adaptation: a painterly bicycle ride, a gear-and-chain repair puzzle, wind-driven sailing with a first-person winch, and the actual procedural Isle of Morne terrain from Tria Prima.

## Run

Requires a modern Node.js release and a browser with WebGL 2.

```sh
npm install
npm run dev
```

Open the Local URL printed by Vite, normally http://127.0.0.1:5173/.

```sh
npm test
npm run build
npm run preview
```

Production output is `dist/`, suitable for a static web host. Serve through HTTP; do not open `index.html` directly as a file.

## Play the journey

1. Pedal north along the illuminated road and collect six golden stars.
2. The chain fails after about 35 metres. Choose the **24T gear**, click or drag it onto the glowing axle, fit the master link, then turn the tensioner or move its slider to **55–72%**. Test the drivetrain to resume.
3. Collect the remaining stars and deliver them at the steeple with **E** or the interaction button.
4. Follow the road southeast to the harbour and board the sailboat.
5. Navigate to the three beacons using the chart. Hold **Space** within 53 metres of each to kindle it. The on-screen kindle button also accepts repeated taps.
6. Moor at Morne after lighting all three beacons. Follow the lanterns inland to the ruined chapel and the Athanor to finish.

Sailing practice starts directly at sea and leaves campaign saves untouched. Checkpoints stay in your browser. Replacing a journey requires confirmation. Pause includes a recovery action to return to a safe place.

## Controls

| Input | Bicycle / shore | Sailboat |
| --- | --- | --- |
| W / up | Pedal / walk forward | Raise sail |
| S / down | Brake / walk backward | Lower sail |
| A / D | Steer / turn | Rudder |
| Space | Jump | Hold to kindle |
| E | Repair, deliver, board | Haul sheet; dock when prompted |
| Q | — | Ease sheet |
| R / Trim the sail button | — | Open first-person winch |
| V / camera button | First / third person | First / third person |
| M / chart button | Chart | Chart |
| Escape | Pause / close panel | Pause / close panel |
| Drag the scene | Look around | Look around |

Clockwise rotation tightens the chain tensioner or hauls the sail's sheet. Sliders provide keyboard and touch alternatives. Wind trim advice appears on the HUD. Sailing into the wind produces little thrust; turn across it to regain speed.

## Source

- `src/main.js`: input, progression, workbench, winch, chart, checkpoint UI and game loop.
- `src/world.js`: Three.js scene, procedural village, terrain, bicycle, boat, sail, water shader and cameras.
- `src/game.js`: state transitions, save validation and sailing model.
- `src/audio.js`: opt-in synthesised sound and ambient notes.
- `src/vendor/tria-prima/`: four MIT-licensed source files providing Morne's actual terrain and regions, sampled at 60% scale. Original peak, caldera, Mere and shoreline are retained; materials, landmark models and campaign are adapted.
- `tests/game.test.js`: campaign prerequisites, repair validation, wind/trim, saves, practice isolation and terrain checks.

The interface uses Google Fonts when available and local fallbacks otherwise. Gameplay needs no account, multiplayer backend or paid API.

## Reference provenance

- [Starry Nightrider](https://starrynightrider.com/): bicycle controls, follow camera, carried light and steeple delivery. Shipped scripts were inspected with REA but are not copied into this game.
- [The Clockmaker’s Heart](https://claude.ai/artifact/6MjtQjf4ee1ZZjEpafaEpa): gear tray, axle placement and meshing concept. The repair sequence is new.
- [Tidewright](https://claude.ai/artifact/JTgyEMn7sn1q2riWrMb7D4): wind-driven sailing and beacon restoration. Rope winch and first-person view are additions.
- [Tria Prima](https://github.com/winchxyz/tria-prima): terrain copied from revision `acce14089aeee01f3225a09a3a8a9532612359fb`, copyright 2026 winchxyz. MIT notice: `public/licenses/TRIA-PRIMA-MIT.txt`.
- Three.js licence: `public/licenses/THREE-MIT.txt`.

This combines the requested mechanics into a new two-chapter game. It does not reproduce the full upstream multiplayer, flight/trick systems, seven-organ puzzle campaign, six-beacon sailing campaign or alchemy/combat systems. Procedural artwork is an adaptation, not an exact visual replica.

## Verification

- Five automated tests passed, including a complete state-transition campaign and upstream terrain samples.
- Vite production build passed; local server returned HTTP 200.
- Brave visual checks confirmed the 3D village renders, the wrong repair gear is rejected, excessive chain tension is rejected, and a 24T idler with 63% tension completes repair and returns to riding.
- An Escape pause issue was found during browser testing and fixed by suppressing the key's default dialog dismissal. The fix still needs a browser recheck. Sailing, the ending and a full campaign playthrough remain unverified in-browser.
- Full REA evidence and research are outside this deployable project under `../references/`. The 111 MB Evidence JSON is excluded from deployment.

The original build plan and compact reference reports are included in `docs/`.
