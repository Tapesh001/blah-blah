# Tria Prima source findings

Inspected 2026-11-14. Source: https://github.com/winchxyz/tria-prima at `acce14089aeee01f3225a09a3a8a9532612359fb`, shallow clone in `references/tria-prima`. This is ordinary source inspection, not REA runtime evidence.

## Licence and dependencies

- MIT, copyright (c) 2026 winchxyz. Preserve the complete `LICENSE` in copies/substantial adaptations and identify upstream provenance in the game's credits.
- Runtime dependencies in upstream package: `three@0.170.0`, `cannon-es@0.20.0`.
- The terrain height function requires no npm package; only `core/math.js`, `core/noise.js`, and `core/rng.js`.
- Procedural model kit requires Three and its `BufferGeometryUtils` and `RoundedBoxGeometry` addons. Full game has custom shaders, physics, lighting, water, postprocessing, audio and progression; these are unnecessary for limited map integration.

## Recommended integration

Use the actual deterministic island height function with a lightweight renderer owned by the combined game. Preserve the entire recognizable Morne silhouette, its high northwest peak, eastern Mere lake and northeast volcanic Scar. Place the island within the sailing ocean, translating/scaling from upstream local coordinates. This is concrete upstream-map reuse without needing to combine two game loops.

1. Copy `src/world/heightmap.js` and its three `src/core/` dependencies, preserving relative paths and MIT notice.
2. Sample `heightFn(localX, localZ)` into a Three `PlaneGeometry` or custom terrain grid. The upstream domain is 768 m square, centered on zero; Y is up, X east, Z south, water at Y=0. A lower mesh resolution is a deliberate approximation for performance.
3. Use `regionOf(x,z,height)` to tint the six regions (`scar`, `heights`, `saltwood`, `mere`, `shore`, `vale`) and retain recognizable geology. Use the same height function in boat collision/shore checks and foot/bike grounding.
4. Put the arrival dock at local `(0,0,326)` facing +Z, and the sailing approach south of it. A direct source-function evaluation found the shoreline crossing at Z=326, height=-0.00666; upstream `planLayout()` finds this with a 0.5 m march.
5. Add a few actual procedural upstream models (chapel, dock, bell tower, salt trees) for identity, optionally rendered with ordinary vertex-colour materials to match the combined game's art. Sampling only terrain is already actual-map reuse; custom materials are explicitly a visual adaptation.
6. Docking can lead to an on-foot/bike path toward the chapel. The original alchemy campaign is a separate feature and is not needed to embed the map.

## Useful APIs and coordinates

`src/world/heightmap.js` exports:

- `WORLD = {size:768, half:384, n:513, cell:1.5, sea:0, lava:20.2}`.
- `heightFn(x,z): number`, deterministic finished terrain height, including flattened landmarks, rivers, caldera and lake.
- `regionOf(x,z,h): string`, region classifier.
- `landDist(x,z)`, `Poly`, `RIVER` (polyline with distance/position methods).
- `generateTerrain(tick?): Promise<T>` samples a full 513² grid and creates masks. `T` contains `heightAt`, `normalAt`, `mask`, `regionAt`, `surfaceAt`, `riverLevel`, `flat`, distance helpers, height/mask arrays. This is heavier than directly sampling `heightFn` for a compact game.

Landmarks, original coordinates and actual height-function evaluations:

| Landmark | X | Z | Terrain Y | Notes |
| --- | ---: | ---: | ---: | --- |
| Chapel | -10 | 70 | 20.153 | Roofless gothic chapel and alchemical furnace |
| Peak | -170 | -255 | 125.943 | Dominant mountain silhouette |
| Scar | 70 | -255 | 20.662 | Caldera, lava level 20.2 |
| Mere | 215 | 50 | -6.3 | Lake; radius about 76 |
| Islet | 184 | 52 | query | Mercury shrine island in lake |
| Hollow | -245 | 30 | query | Saltwood shrine |
| Gate | -118 | 60 | query | West ridge crossing |
| South dock | 0 | 326 | -0.007 | Waterline Y=0; deck Y=1 |
| Drowned bell tower | 241 | 28 | query | Upstream placement MERE+(26,-22) |

## Procedural model reuse

`src/models/registry.js` exports `buildModel(name, seed=1, opts=null)`, `hasModel`, `listModels`, `modelMeta`. Models register through side-effect imports. Importing selected module files avoids loading the entire registry:

- `src/models/structures/chapel.js` registers `chapel`.
- `src/models/ruins/dock.js` registers `dock` and `boat` (rowing boat; a sail rig would be a new addition).
- `src/models/ruins/tower.js` registers `ruin_tower`, `bell_tower`.
- `src/models/nature/trees.js` registers dead, birch, pine, salt, willow and charred trees.
- `src/models/index.js` imports all major model families; avoid it when only a few are required.

Each `buildModel` result contains merged `BufferGeometry` under `opaque`, optional `glass`, `liquid`, and named geometry `parts`; also `colliders`, `anchors`, `emitters`, `lights`, `size`, `radius`, `min`, `max`. Geometry includes `position`, `normal`, `color`, `aFx`, `aMat`, `aUvw`. Basic `MeshStandardMaterial({vertexColors:true})` can render these geometries, though it omits upstream procedural surface detail, emissive/wind handling. Results are cached and shared: do not mutate their geometry in place.

The minimum model subtree is the chosen model file(s), the corresponding family `_shared.js`, `models/kit.js`, `models/registry.js`, `core/noise.js` and `core/rng.js`; inspect imports before pruning. `kit.js` only imports Three/addons and those two core helpers. Coordinates are metres, ground origin, Y up, +Z front.

Avoid importing `createWorld(engine)` unless deliberately porting the whole renderer. It expects upstream engine fields (`scene`, `renderer`, `camera`, `q.detail`), custom shared shader state, generated terrain textures, water/grass, effect masks, collision and population systems.

## Evidence limits

Source inspected: package, licence, world heightmap/terrain/world/props/populate, model registry/kit, representative chapel/dock/tower modules and model contracts. The CPU height module was executed in Node to verify key heights and dock location. No upstream browser playthrough, render, shader or model-construction execution was performed, and no dependencies were installed.
