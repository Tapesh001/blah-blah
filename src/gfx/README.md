# Tapesh — frame pipeline (T0.1)

This module implements the first unfinished task in the supplied Tapesh brief. It is isolated
from the existing game. Main at `243495d` has no `AGENTS.md`, `docs/plan/MASTER-PLAN.md`,
`docs/agents/tapesh.md`, `src/contracts/index.ts`, `docs/handoff/`, or `createSandbox`.
The API below is **provisional**, not a claim to implement the absent shared `Gfx` contract.
No shared types or game modules are created or changed.

## Run

Use the existing `npm ci` and `npm run dev`, then open
`http://127.0.0.1:5173/sandbox/gfx-pipeline.html?perf=1`.

The scene is a fixed procedural fixture. Its flat water and gradient sky exercise stage ordering;
they do not implement T0.3, T0.5 or T0.6. No image, model or HDRI assets are loaded.

```js
import { createGfx } from './src/gfx/index.ts';

const gfx = createGfx(canvas, { renderScale: 0.75, pixelRatio: 1, shadows: true });
gfx.scene.add(yourObject);
gfx.render(camera, deltaTimeSeconds);
gfx.setPassEnabled('shadows', false);
gfx.setRenderScale(1);
console.log(gfx.stats);
// Release caller-owned scene geometries, materials and light shadows, then:
gfx.dispose();
```

`createGfx` accepts positive finite `renderScale` and `pixelRatio`. Scale is clamped to [0.5, 1].
`shadows: false` disables shadows; `passes: { sky: false, post: false, ... }` sets initial switches.
There is no invented tier table: map real `QualitySettings` when the shared contract arrives.

`resize(cssWidth, cssHeight, pixelRatio)` resizes physical canvas and HDR targets without modifying
CSS dimensions. A `ResizeObserver` follows canvas CSS changes automatically. The caller updates
its camera aspect and projection. A DPR change without a CSS-size change requires `resize()`.
The GL texture-size limit caps physical resolution. `setRenderScale()` retains the constructor's
pixel-ratio setting (or uses the current device ratio if unspecified).

## Pipeline and ownership

* `clear` clears the RGBA16F HDR colour buffer and unsigned-int depth texture.
* `shadows` runs Three r170's shadow prepass exactly once, at the start of the first enabled scene
  stage. PCF soft filtering is used. Cascades and texel snapping belong to T0.7.
* `opaque`, `sky`, `ocean`, `transparents` share that HDR colour/depth attachment.
* `post` copies into independent RGBA16F ping-pong targets; registered effects follow it.
* `upscale` samples the final texture at canvas resolution, applies a diagnostic Reinhard mapping,
  then Three's sRGB conversion. Built-in tone mapping is disabled. The temporary diagnostic
  presentation is **not T0.2**: bloom, auto exposure, AgX/ACES and dither remain next.

Every registered pass can be toggled by name. Turning off `post` bypasses the initial copy;
custom post passes can still run. Turning off `upscale` clears the canvas to black. Turning off
`clear` is a debugging switch that intentionally retains prior frame contents.

Use `object.userData.gfxPass = 'sky' | 'ocean' | 'transparents' | 'opaque'` on a renderable or
ancestor to select a stage. Otherwise transparent materials go to `transparents`, other materials
to `opaque`. Split meshes with mixed opaque/transparent material groups if they need separate
stages. Objects retain their parents, transforms, visibility and original layer masks. Filtering
temporarily masks only each renderable's layers, so children can occupy different stages.
All eligible scene casters remain available to the shadow prepass, including later-stage objects.

Use geometry for the sky, with `depthWrite: false`, so it respects opaque depth. A
`scene.background` Color sets the clear colour; texture backgrounds are not drawn by this pipeline.
The pipeline does not move the camera, animate objects or calculate wind, waves or terrain.

## Extending post

`registerPostPass({ name, enabled?, render, resize?, onContextLost?, onContextRestore?, dispose? })`
inserts a pass immediately before upscale, after previously registered effects. `render(context)`
receives `renderer`, `fullscreen`, `input` (HDR texture), `output` (distinct HDR target), `depth`
(scene depth texture), `width`, `height`, `camera`, `scene`, and `deltaTime`.

Draw a fullscreen result to `output`; the pipeline swaps buffers afterwards. Import
`fullscreenMaterial` from `fullscreen.js` to make a linear HDR ShaderMaterial, and call
`fullscreen.render(renderer, material, output)`. Do not apply sRGB conversion in intermediate
passes. The shared triangle is instance-owned and has three vertices, without an index buffer.

Depth sampling is safe in post because the scene target is detached. A future ocean refraction
pass must first copy opaque depth/colour into separate textures: sampling an attachment while
drawing to the same framebuffer is a feedback loop. This T0.1 fixture does not sample scene depth.

## Timing, errors and lifecycle

`stats` returns a snapshot with CPU submission ms, asynchronous GPU ms and its source frame id,
per-pass timings, resolution/scale, draw calls, triangles, geometries and textures. `renderer.info`
accumulates across the complete frame, including shadow and fullscreen draws. GPU totals sum all
timed passes, including clear; they do not measure compositor presentation or browser frame rate.
CPU timings are not GPU estimates. Unsupported GPU timers report `null`/`n/a`.

The timer uses `EXT_disjoint_timer_query_webgl2`, never waits for a GPU result, caps queued frames
at eight, and discards disjoint results. Shadow timing wraps r170's `renderer.shadowMap.render`:
the enclosing pass query is split before/after the shadow work, with no nested queries or duplicate
shadow renders. Check this seam when changing Three versions. `?perf=1` displays an overlay.

`renderer.debug.onShaderError` throws and records compiler/linker diagnostics in `shaderErrors`.
Context loss suspends frames and drops query handles. While lost, the pipeline invalidates GPU
backing for its targets and resources in its scene (CPU object data survives), removing Three's
old resource-disposal listeners before restoration. Three then re-uploads lazily. A custom pass
owning extra targets must release those in `onContextLost` and rebuild them if needed in
`onContextRestore`. Avoid sharing managed scene resources with unrelated renderers. Final
`dispose()` removes pipeline targets, materials, geometry, queries, overlay, observer and listeners;
final disposal of caller scene objects remains caller-owned.

## Verification

```sh
node --test tests/gfx/*.test.js
npm test
npm run build
npx vite build --config tests/gfx/vite.config.js
```

The root build intentionally remains unchanged and does not bundle the sandbox. Its separate
build is in ignored `.local/gfx-dist/`; preview with
`npx vite preview --config tests/gfx/vite.config.js --port 4174`.

For browser acceptance, install Playwright outside this checkout if it is not already available.
Set `GFX_PLAYWRIGHT` to its absolute package directory; optionally set `GFX_BROWSER` to the Chrome
or Chromium executable and `GFX_BASE_URL` to the dev/preview origin. With the server running:

```sh
node tests/gfx/browser.mjs
```

The runner fails on console errors, shader warnings and WebGL errors. It checks pass toggles,
scene state preservation, visible custom-post changes and bypass, resize, forced context recovery,
GPU samples, disposal and the no-overlay mode. Screenshots and measured timing data are written
only to `artifacts/gfx/`. See that directory's handoff for actual results and remaining work.
