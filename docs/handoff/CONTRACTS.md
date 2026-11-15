# Provisional integration guide

The canonical contract mentioned by the brief was missing from the repository.
Every interface currently in `src/contracts/index.ts` is therefore provisional.
Do not infer team approval from successful compilation.

## Compose systems

`startGame({ services, chapters })` in `src/game/runtime.ts` replaces individual
services while leaving the other stubs intact. `createServices` is the sole
default factory. The caller transfers ownership of service disposal to the
context. Do not share one renderer between simultaneous contexts.

`chapterTable` fills absent chapter factories with a fallback chapter. Chapters
load asynchronously before entering; failed loads dispose the candidate and
retain the current chapter. Use `ctx.completeChapter()` to request progression.
The route loops from ending back to title. New journeys do not load/save progress
until the M1 save service arrives.

Cross-owner code imports only `@contracts` or the future `@sim` public entry.
`src/game` may compose owner public `index.ts` exports.
Do not import another owner's internals. Aliases for absent owner modules are
configured now; files will resolve when those owners land.

## Sandbox integration

Import `createSandbox` from `src/game/sandbox.ts`. This registers the composition
factory in `src/core/sandbox.ts` without a core → game dependency.

The supplied pages discover optional `mount(ctx)` exports at:
bike → land, bench → mech, sail/cloth → sea, isle → isle, gfx-* → gfx.
Each owner can inspect `document.body.dataset.sandbox` to select a demo.
A mount may return a cleanup callback or a promise of one.
A separate browser page has its own context. Call `window.__cg.dispose()`
before unmounting an embedded context.

## Sampling conventions

Units are metres and seconds, y is up. WORLD coordinates are temporary original
values. Wind is velocity towards a direction, not the meteorological direction
it comes from. WindBake uses interleaved float32 XYZ velocities, row-major with
x varying fastest, sampled at y=10. Its origin is the minimum x/z corner;
texel centres are origin + (index + 0.5) × (512/64).
The 64×64 buffer is reused and must be copied if retained across steps.

The four-wave ocean uses k=2π/wavelength, ω=√(9.81k),
phase=k×dot(direction, restXZ)−ωt,
horizontal displacement=q×amplitude×direction×cos(phase),
height=amplitude×sin(phase). Four fixed-point iterations invert horizontal
displacement for world-space height queries; normals derive from its Jacobian.
This is a provisional formula, because the requested exact shared contract
formula was unavailable.

The terrain is two deterministic, original analytic noise cones. It does not
implement the M1 cache, sculpt, road, surface-grade or collider requirements.

## Time and lifecycle

Every fixed step runs input → environment → wind bake → chapter → physics.
Every frame runs chapter interpolation → camera → environment submission →
render. The accumulator runs at 60 Hz regardless of timeScale; simulation dt
is (1/60)×timeScale. At most five fixed steps run per frame, excess whole steps
are counted and dropped, and the fractional remainder supplies alpha.
Hidden tabs discard wall-clock backlog. Pause preserves rendering and freezes
simulation. M0 input is keyboard plus the onscreen action button, not the M1
gamepad, pointer-lock or two-thumb touch system.

The bench stub resolves after one second of wall time and accepts an AbortSignal.
Audio, physics and saves are intentionally no-ops in M0.

## Verification by milestone

TypeScript is pinned to 6.0.3 to stay within typescript-eslint's supported
peer range. The minimatch override pins 11.0.8 across development tools to
remove the glob-amplification advisory; boundary tests exercise the upgraded
matcher. Three.js and its type package are both pinned to 0.187.0.

M0 tests cover scheduling, timing, determinism, typed events, keyboard edges,
wind layout, ocean normals, finite sampling, load failures, cleanup, import
boundaries, deep links, pause, all fallback chapters and every production
sandbox page. M1 camera/roads/save/timeline and M3 soak/performance tests require
their real implementations and must be added with those milestones.
