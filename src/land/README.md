# Aviraj M0 — bicycle handoff

This implements the first unfinished milestone in the supplied `aviraj.md`:
an isolated flat/ramp bike simulation and diagnostic view. It does **not**
complete the ride chapter, drivetrain progression, Tallow Head, or M1–M3.

At the initial checkout (`243495d`), the shared contracts, agent briefs, master
plan and handoff directory did not exist. The concurrently published foundation
was subsequently merged through `73d365a`. Its contracts remain provisional:
there is no drivetrain/inventory API, wheel raycast, camera anchor, bike event
schema or road-surface vocabulary matching the supplied brief. Shared files and
other owners' implementations are unchanged by this work.

## Run and verify

```sh
npm ci
npm run dev
# Open /sandbox/bike.html, then “Open bike dynamics M0 lab”.
# Direct entry: /sandbox/bike-lab.html
npm run check
npx vitest run tests/land tests/mech
```

The foundation sandbox retains its own lifecycle and debug API; `mount()` only
adds the lab link and returns a cleanup function. The lab owns a separate loop,
renderer and transient state. Vite's existing page discovery builds both labs.
No package, CI, shared-contract or root tooling changes are required.

## Model

- `createBike`, `stepBike`, `stateHash`, `flatWorld` and the local types are
  exported from `src/land/index.ts`. State is serializable data; there are no
  Three.js imports in the simulation.
- Units: metres, seconds, kilograms, radians; Y up, heading zero along +X,
  positive heading/steer towards +Z. Fixed 60 Hz with four integration substeps.
  Calls reject nonpositive, nonfinite or greater-than-1/30-second timesteps.
- Front/rear spring-damper support, optional prop raycasts and swept solid-hit
  callback; load transfer, surface/wetness friction circles, slip-angle terms,
  aerodynamic wind, rolling resistance and slope gravity.
- Power/cadence/torque limits, sprint reserve, tuck drag, braking/skid/lock,
  pendulum lean with countersteering PD control and low-speed stabilisation.
- Hop preload, ballistic flight, landing impulse/wear/trauma, crash events,
  1.2-second tumble and last-safe-point respawn. Events are returned to the caller;
  there is no global event bus or mutation of game context.
- Gear and wear fields are present, but shifting, crunch wear, ridge pacing,
  chain-break progression and repair replacement belong to A2/M1.

The brief's drive-force equation multiplies torque by the speed ratio. This
model **divides** crank torque by `chainring/cog`: wheel torque is
`crankTorque × cog/chainring`. This conserves power and makes a larger rear cog
easier on a climb. Cadence is wheel angular speed divided by that same ratio.

This is a reduced single-track model, not a rigid-body bicycle. Pitch is aligned
to the two supports with a braking perturbation; there is no full end-over-end
rotational inertia model. Tyre response and controller gains need M2 replay
tuning. The grey rider and frame are diagnostic geometry, not A3's rig or IK.

## Evidence — 2026-11-15

- 32 bicycle tests plus 81 mechanism/solvability tests; the integrated suite
  passed 156 Vitest and 6 graphics Node tests, strict types, ESLint, Prettier and
  the production build.
- Flat dry tarmac, no wind, 10 m/s coast-down: **321.916 m** to rest.
- Cruise top speeds after 300 s: 5 m/s headwind **6.742 m/s**, calm
  **8.568 m/s**, 5 m/s tailwind **10.467 m/s**.
- Scripted six alternating bends, assist on: **113.464 m**, zero crashes,
  identical replay hash **`d08fd42b`** twice on the same runtime. This is a
  synthetic flat-ground input trace, **not** a replay through the unauthored
  Tallow Head switchbacks.
- Ten simulated minutes of seeded random input on wet wood, rolling terrain
  and storm gusts remained finite and above ground.
- Circle tests verify the analytic tyre limit at μg and overload at 10% greater
  speed. A rendered steady-circle replay at that limit remains an M2 check.
- Warmed Node 22.23.5 / macOS arm64 sample, 20,000 calls: bike mean **0.00261 ms**,
  p95 **0.00967 ms**, max **0.268 ms**. These are local simulation timings, not
  a browser frame or production hardware guarantee.

Local browser verification was blocked: headless Chromium could not create its
macOS Mach service inside the shell sandbox, and the browser approval gate
declined access to the local lab. The authored Playwright harness was listed
successfully but its interactions/screenshots were **not run** locally.

## Next milestone

Reconcile the authoritative contracts with shobhit before exporting
`createRideChapter(): Chapter` or adapting the richer model to the shared loop.
Then implement A2, grey-box A3/A4 and the break → bike-1 bench → resume path.
Keep that work in the assigned land/mechanism/island paths. Do not treat this
lab as completed chapter acceptance.
