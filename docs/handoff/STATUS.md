# Integration status

M0 implementation is ready on `shobhit/m0-foundation`; remote CI is pending.

## Scope and provenance

The repository at `243495d` contained only the old JavaScript prototype.
The shared `src/contracts/index.ts`, `AGENTS.md`,
`docs/plan/MASTER-PLAN.md`, `docs/agents/shobhit.md`, and all handoff files
referenced by the supplied brief were absent. No teammate branches existed.

The user explicitly approved a provisional foundation on 2026-11-15.
The new contracts are marked `0.0.0-provisional`; they are not a recovered or
approved copy of the team's shared contract. The attached brief is preserved
in `docs/agents/shobhit.md`.

## M0 delivered

- Prototype moved to `legacy/v0`; copied upstream heightmap and unused vendor
  helpers removed. Existing licence notices retained.
- Exact dependency versions, strict TypeScript, aliases, owner import rules,
  Vite multi-page builds, Vitest, Playwright, formatting and two CI jobs.
- Fixed 60 Hz loop, five-step catch-up cap, interpolation, visibility suspension,
  pause, scaled simulation dt, deterministic RNG, typed events and math helpers.
- Replaceable wind, terrain, Gerstner ocean, renderer, bench, camera, physics,
  save, UI and audio stubs. The composition root is `src/game/services.ts`.
- Five registered chapter states, asynchronous loading/disposal, fallback
  chapters, deep links, keyboard/button interaction and the provisional debug API.
- Eight isolated sandbox pages, with optional public owner `mount(ctx)` exports.

## Outstanding dependencies and later milestones

1. Team: supply authoritative contracts, WORLD coordinates, master plan and
   storm timeline. Reconcile the provisional API before integrating owner modules.
2. tapesh: real Gfx, MaterialKit and Fx, then graphics sandbox mounts.
3. aviraj: ride/bench implementations and home-island data.
4. mansi: real ocean, sail/isle chapters and destination-island data.
5. shobhit M1: multi-device input/rebinding, real camera, storm/wind/terrain,
   Rapier physics, validated saves and complete gameplay debug API.
6. shobhit M2: final HUD/settings/chart and synthesised audio.
7. M3/M4: merge real owners in tapesh → aviraj → mansi order, full-run and
   ten-minute per-chapter soak/performance checks, accessibility review,
   reference review and deployment.

No real chapter integrations, contract approvals, M1/M2 acceptance, production
performance budget, or deployment are claimed. The existing hosting settings
are retained; this milestone produces a deployable `dist/` artifact.

## Validation

- Clean `npm ci` succeeds; `npm audit` reports zero vulnerabilities.
- `npm run check`: strict types, owner boundaries, formatting, 37 unit tests
  and the multi-page production build pass.
- `npm run e2e`: 11 Chromium tests pass against the production build, including
  real-key chapter traversal, deep links, pause, phone interaction/cleanup and
  all eight sandbox pages.
- Desktop (1280×720) and landscape phone (844×390) screenshots were inspected.
  A footer/action overlap was corrected and covered by a browser assertion.
- Vite reports a non-fatal 545.5 kB shared Three.js/runtime chunk warning
  (approximately 137.4 kB gzip). Chunk splitting/loading optimization is deferred.
- GitHub Actions results and the landing commit will be recorded after push.
