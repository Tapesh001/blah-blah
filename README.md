# Cog & Gale

A browser game foundation for a bicycle ride, a sea crossing and an island
journey. **This is the provisional M0 milestone:** chapters and simulation
services are placeholders awaiting the other owners' implementations.

## Run

Use Node.js 22.12+ (CI uses Node 24) and a browser with WebGL 2.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. Press **E**, or use the onscreen button,
to traverse title → ride → sail → isle → ending. Ending returns to title.
**Escape** or the Pause button pauses/resumes. M0 collects WASD movement input,
but placeholder chapters have no movement simulation yet.

Try `/?chapter=sail&cp=squall&storm=0.8&q=low&seed=7`.
Supported quality values are low, medium and high. The checkpoint is supplied
to the chapter context; restoring a saved game is a later milestone.

Open `/sandbox/` for bike, bench, sail, cloth, isle, ocean, sky and terrain
development pages. Each starts a fresh context and uses the owner's public
`mount(ctx)` export when available.

## Verify

```sh
npm run check
npx playwright install chromium
npm run e2e
```

`check` runs strict type checking, ESLint/Prettier, unit tests and production
build. On Linux install the browser with
`npx playwright install --with-deps chromium`.
The browser suite exercises the production build using Chromium software GL.

```sh
npm run build
npm run preview
```

The multi-page output is `dist/`. Existing static hosting configuration is
retained, but deployment is not part of this provisional milestone.

## Integrate

- `src/contracts/index.ts`: explicitly provisional interfaces.
- `src/core/`: scheduler, RNG, events, math, keyboard adapter and service stubs.
- `src/game/services.ts`: service replacement factory.
- `src/game/chapters.ts`: chapter table and asynchronous lifecycle.
- `src/game/runtime.ts`: composition, loop wiring and debug API.
- `src/game/sandbox.ts`: composition entry for `createSandbox(options)`.
- `src/ui/`: lightweight foundation screen.
- `docs/handoff/CONTRACTS.md`: data layout, lifecycle and integration notes.
- `docs/handoff/STATUS.md`: milestone evidence and outstanding work.
- `docs/agents/shobhit.md`: supplied task brief.

`window.__cg` exposes `ready`, `chapter()`, `goTo(id)`, `setStorm(value|null)`,
`setTimeScale(value)`, `setRouteProgress(value)`, `checkpoint(id)`,
`stats()`, completion `events`, and `dispose()`.

## Provenance and remaining work

The supplied brief referenced shared contracts and a master plan that were
absent from the repository. The user approved a provisional foundation;
its APIs, island positions, ocean formula and environment defaults require
reconciliation with the team before real-system integration.

M1 input/camera/wind/terrain/physics/saves, M2 UI/audio and M3/M4 integration,
soak/performance checks and release remain outstanding. No real gameplay,
full-run acceptance, CPU budget or ten-minute browser soak is claimed.

The previous prototype is archived under `legacy/v0/`. Its copied upstream
terrain and unused helpers are removed from the active tree; no vendor
terrain is imported by this version. The original archive can be reconstructed
from Git revision `243495d`. Third-party notices remain in `public/licenses/`.
