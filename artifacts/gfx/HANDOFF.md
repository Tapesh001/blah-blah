# Tapesh handoff — T0.1 frame pipeline

Date: 2026-11-15. Starting revision: `243495d` on main.

## Scope and status

Implemented **T0.1 in isolation**, following the supplied brief's instruction to do the next
unfinished task. Changes are restricted to `src/gfx/`, `sandbox/gfx-*.html`, `tests/gfx/` and
`artifacts/gfx/`. Existing game code, root dependencies/build scripts and other owners' files
are unchanged. No gameplay, wind or wave simulation is added.

The referenced agent instructions, master plan, shared contracts and handoff directory are absent
from this main branch. `createSandbox` is also absent. Accordingly `src/gfx/index.ts` exposes a
standalone `createGfx` implementation with a documented provisional interface. It cannot yet be
checked against `Gfx` / `QualitySettings`. This handoff is kept in the graphics-owned artifact
directory rather than creating a shared documentation path.

Delivered: WebGL2 RGBA16F + depth at render scale; scene-stage ordering; soft shadow maps;
instance-owned fullscreen triangle; HDR ping-pong buffers; pass registration, switches and resize;
CPU and asynchronous per-pass GPU timing; renderer statistics; `?perf=1` overlay; shader failure
hook; context-loss suspension, recovery and cleanup; static procedural sandbox and tests.

Three 0.170.0 source and its `examples/jsm/postprocessing/Pass.js` were inspected for API behavior.
The shadow timing wrapper targets this pinned version and must be reviewed on a Three upgrade.

## Validation

- `node --test tests/gfx/*.test.js`: **6/6 passed** (dimensions, pass lifecycle, asynchronous query
  completion, disjoint handling, queue bounds, unsupported timers, context loss and target ownership).
- `npm test`: **5/5 existing game tests passed**.
- `npm run build`: **passed**, with the existing game's >500 kB chunk advisory.
- `npx vite build --config tests/gfx/vite.config.js`: **passed**; isolated sandbox built separately.
- `node tests/gfx/browser.mjs` against the built sandbox: **passed**. Every stage toggled;
  caller scene state preserved; custom post visibly changed the image and bypass restored it;
  resize and render-scale changes worked; forced WebGL loss/restoration resumed rendering;
  disposal removed the overlay; normal URL had no overlay. **No console errors, shader warnings
  or WebGL errors** in the successful run.

The context test caught old Three render-target disposal listeners attempting to delete handles
from the lost context after restoration. GPU backing is now released while the context is lost,
and CPU scene data survives for re-upload. Custom effects must follow the documented lifecycle.

## Measured costs

Built sandbox, headless Chrome 157, Windows, Intel UHD Graphics via ANGLE / Direct3D11.
Canvas: 1920 × 1080; device pixel ratio: 1; shadow map: 1024². Each scale had 60 warm-up frames,
then 120 sampled CPU frames. GPU results are deduplicated by source frame, and include clear.

| Render scale           | Internal pixels | Mean CPU submission | Mean GPU | GPU samples |
| ---------------------- | --------------- | ------------------: | -------: | ----------: |
| 0.50                   | 960 × 540       |            0.345 ms | 2.204 ms |         120 |
| 0.75 (sandbox default) | 1440 × 810      |            0.461 ms | 3.930 ms |         119 |
| 1.00                   | 1920 × 1080     |            0.839 ms | 6.696 ms |         120 |

All runs: **37 draw calls, 928 triangles, 4 geometries, 5 textures** as reported by Three for the
fixture, including shadow/fullscreen draws. These are pipeline-fixture costs, not full-game,
60 fps, or four-tier acceptance claims. Shared quality tiers are not defined in this checkout.

Per-pass GPU means at the default 0.75 scale (`?perf=1` uses the same timing instrumentation):

| Pass                              | GPU ms |
| --------------------------------- | -----: |
| Clear                             |  0.627 |
| Shadows                           |  1.156 |
| Opaque                            |  0.113 |
| Sky fixture                       |  0.373 |
| Ocean-stage fixture               |  0.280 |
| Transparents                      |  0.013 |
| Post copy                         |  0.713 |
| Upscale + diagnostic presentation |  0.655 |

Raw measurements, environment and per-pass CPU/GPU values: [t0-1-performance.json](t0-1-performance.json).
Screenshots: [initial frame](t0-1-pipeline.png), [resize](t0-1-resized.png),
[restored context](t0-1-restored.png). These are T0.1 evidence, not the P0 ocean/sky/terrain or P1
hero-shot deliverables.

## Next task and integration needs

Next unfinished task is **T0.2**: six-level 13-tap bloom, exposure adaptation, AgX/ACES and dither.
The current output shader only uses a temporary Reinhard mapping followed by sRGB for diagnostics.
T0.3–T0.9, all P1/P2 tasks, and full P0/P1 acceptance remain unfinished.

When the shared contracts and M0 scaffold arrive, adapt the provisional entry point to them and
mount this through `createSandbox`, with coordination for any changes outside graphics ownership.
Do not substitute the sandbox's flat water or gradient sky for contract-driven implementations.
The future ocean must use a detached copy of scene depth/colour for refraction; sampling the
currently attached depth texture during ocean drawing would be a framebuffer feedback loop.

API, resource ownership, extension hooks and reproduction commands: [src/gfx/README.md](../../src/gfx/README.md).
