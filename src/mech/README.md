# Aviraj M0 — mechanism handoff

`evaluate(def, placement)` is a pure static mechanism evaluator. It is exported
with `MechPuzzleDef`, `MechPlacement`, `MechEvaluation`, `chainPath`, `pitchRadius`
and constants from `src/mech/index.ts`. Local contracts are provisional because
the shared foundation does not yet define the puzzle, placement or drivetrain
types from the supplied brief. Nothing imports another owner's implementation.

Open `/sandbox/bench.html` and follow the lab link, or open
`/sandbox/bench-lab.html` directly. These are M0 rule exercises, not the authored
`bike-1`, `bike-2`, `winch-1`, `engine-1` or spare chapter puzzles.

## Rules and representation

- All board coordinates, chain pitch, module, tension take-up and slack are in
  metres. A gear's pitch radius is `0.0025 × teeth / 2`; a sprocket's is
  `0.0127 / (2 × sin(π/teeth))`.
- Place one physical part per axle/tier. IDs identify actual parts, so a part
  cannot be reused. Inventory augments the tray without overriding its IDs.
- Same-tier gears mesh within an inclusive 2% pitch-centre distance tolerance.
  Meshes reverse rotation, stacks rigidly couple tiers and overlaps are invalid.
- Chains are closed, external loops of ordered, coplanar sprockets. Exact
  external tangent segments and wrap arcs determine length, including unequal
  sprockets and convex idler routes. Repeating the first sprocket is invalid.
  Crossed, concave/internal-wrap, overlapping and cross-tier routes are rejected.
- `links` is an integer allocation from the puzzle's link budget. Remaining
  slack is `links × pitch − pathLength − tensioner × takeUp`; the inclusive
  min/max range determines tight, acceptable or loose. Studs block lower-tier
  pitch circles and chain tangents/wraps; upper tiers clear them.
- `ratchets: [{part, mount}]` installs a physical one-way hub between a mounted
  gear/sprocket and its shaft. Its `direction` is the permitted **absolute**
  rotation sign. An unhubbed stack is rigid. This is a directional kinematic
  clutch, not a torque/contact or loaded-winch dynamics solver.
- Driver-relative signed ratios propagate through the graph. Conflicting
  ratio/sense paths seize and return a closed node loop for highlighting.
  Unreachable axles remain idle and are not errors. RPM and senses are absolute;
  goal ratio is a positive magnitude with an **absolute** tolerance.
- Efficiency charges 0.97 per driven mesh and 0.98 per driven chain span.
  Legal chains are coplanar, so there is no lateral chain-line penalty; crossed
  tier connections are rejected rather than silently given a penalty. Durability
  scales with mean sprocket size, clamped to 0.25–2.0.
- Only a solved, valid bike mechanism exports an effective drivetrain. Its cog
  count represents the final ratio, including compound trains. This awaits
  reconciliation with the team's future `DrivetrainSpec` contract.

## Lab and tests

The lab has native keyboard controls for part/axle/tier placement, lifting,
ordered chain routing, link allocation, tension, testing, undo, hints and clear.
It shows true tooth counts, signed output RPM, slack, errors and seizure loops.
The five exercises demonstrate a mesh, compound train, chain, stud-clearing
idler and a one-way hub. Exhaustive finite assignment searches find tray-only
solutions and distinct builds using an inventory replacement, independently of
the authored examples. Ratchet pass/freewheel/reversal and inconsistent-path
cases are also unit-tested. The ratchet exercise demonstrates hub behavior; it
does not require a ratchet when the player uses a rigid shaft instead.

```sh
npm run check
npx vitest run tests/mech
npm run build
npx playwright install chromium
npx playwright test --config tests/mech/playwright.config.ts
```

The Playwright suite uses real keyboard events to complete every example,
reject a reversed ratchet, exercise undo/hint/clear, and check the bike lab.
It uses production preview port 4178 and writes screenshots to
`test-results/aviraj`. Its test was discovered successfully, but browser
execution was blocked locally; see the land handoff for the exact limitation.
The `.test.ts` files register the adjacent JavaScript case modules with the
existing Vitest discovery rule, without changing shared test configuration.

81 mechanism tests pass: 66 evaluator/geometry cases and 15 authored-example,
independent-solver and inventory-variant checks. A warmed 20,000-call local
benchmark of the five examples measured mean **0.00644 ms**, p95 **0.01083 ms**
and max **1.312 ms** on Node 22.23.5/macOS arm64. The occasional max exceeds the
1 ms target; these are small static examples, not a whole rendered bench budget.

## Deliberate later work

B2's in-game overlay, drag/ghost placement, rotary crank/tension gestures,
close-up involute 3D meshes, depth of field, Fx/audio, loose-chain skipping and
inventory consumption are not implemented. The shared `Bench` currently only
has `solve(signal)`, not `open` or `puzzles`; no fake `createBench` adapter was
added. Reconcile those APIs before the M1 bike-1 repair flow, then design the
actual two-speed winch with mansi and the Keystone engine in milestone order.
