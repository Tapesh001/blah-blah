import * as THREE from 'three';
import type { GameMode, Hud, Input } from './api';
import { createWorld } from './world/world';
import { dynamic } from './world/graphics';

const canvas = document.createElement('canvas');
canvas.style.cssText =
  'position:fixed;inset:0;width:100vw;height:100vh;display:block';
document.body.style.cssText =
  'margin:0;overflow:hidden;background:#000;font-family:system-ui,sans-serif';
document.body.append(canvas);
const ui = document.createElement('div');
ui.style.cssText =
  'position:fixed;inset:0;pointer-events:none;color:#f3efe6;text-shadow:0 1px 4px #000a';
ui.innerHTML = `
<div id="obj" style="position:absolute;top:18px;left:22px;max-width:calc(100% - 190px);font-size:15px;letter-spacing:.08em;text-transform:uppercase"></div>
<div style="position:absolute;right:14px;top:14px;pointer-events:auto;background:#10222dd9;border:1px solid #aec4cf44;border-radius:8px;padding:9px 12px;font-size:12px">
 <label for="graphics">Graphics </label><select id="graphics" style="font:inherit;background:#203945;color:#fff5dd;border:1px solid #8aa6b4;border-radius:4px;padding:3px"><option value="ultra">Ultra</option><option value="high">High</option></select>
 <div id="render-stats" style="margin-top:5px;font-variant-numeric:tabular-nums;color:#c9dce4"></div>
</div>
<div id="gauges" style="position:absolute;bottom:20px;left:22px;font:14px/1.6 ui-monospace,monospace"></div>
<div id="prompt" style="position:absolute;bottom:14%;width:100%;text-align:center;font-size:18px"></div>
<div id="toast" style="position:absolute;top:22%;width:100%;text-align:center;font-size:22px;transition:opacity .6s;opacity:0"></div>`;
document.body.append(ui);
const $ = (id: string) => ui.querySelector('#' + id) as HTMLElement;
const gauges = new Map<string, number | string>();
let toastT = 0;
const hud: Hud = {
  objective: (t) => ($('obj').textContent = t),
  prompt: (t) => ($('prompt').textContent = t),
  set: (n, v) => gauges.set(n, v),
  toast: (t) => {
    $('toast').textContent = t;
    $('toast').style.opacity = '1';
    toastT = 3;
  },
};

/* ---- input ---- */
const keys = new Set<string>();
const hit = new Set<string>();
const ptr = { x: 0, y: 0, down: false, pressed: false, released: false };
let lx = 0;
let ly = 0;
addEventListener('keydown', (e) => {
  if (
    e.target instanceof HTMLSelectElement ||
    e.target instanceof HTMLInputElement
  )
    return;
  if (!keys.has(e.code)) hit.add(e.code);
  keys.add(e.code);
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('pointermove', (e) => {
  ptr.x = (e.clientX / innerWidth) * 2 - 1;
  ptr.y = -(e.clientY / innerHeight) * 2 + 1;
  if (document.pointerLockElement === canvas || ptr.down) {
    lx += e.movementX * 0.0025;
    ly += e.movementY * 0.0025;
  }
});
canvas.addEventListener(
  'pointerdown',
  () => ((ptr.down = true), (ptr.pressed = true)),
);
addEventListener(
  'pointerup',
  () => ((ptr.down = false), (ptr.released = true)),
);
const ax = (n: string, p: string, n2: string, p2: string) =>
  (keys.has(p) || keys.has(p2) ? 1 : 0) - (keys.has(n) || keys.has(n2) ? 1 : 0);
const input: Input = {
  steer: 0,
  throttle: 0,
  lookX: 0,
  lookY: 0,
  down: (c) => keys.has(c),
  pressed: (c) => hit.has(c),
  pointer: ptr,
};

/* ---- world + modes ---- */
const world = createWorld(canvas);
const graphicsSelect = $('graphics') as HTMLSelectElement;
graphicsSelect.value = world.quality;
graphicsSelect.addEventListener('change', () =>
  world.setQuality(graphicsSelect.value === 'high' ? 'high' : 'ultra'),
);
let lastGraphicsReport = 0;
Object.assign(window, { world, renderer: world.renderer, scene: world.scene });

type Factory = Record<string, unknown>;
const found = import.meta.glob<Factory>(
  ['./bike/index.ts', './bench/index.ts', './boat/index.ts'],
  { eager: true },
);
const bikeF = found['./bike/index.ts']?.['createBikeMode'] as
  (() => GameMode) | undefined;
const benchF = found['./bench/index.ts']?.['createBench'] as
  ((k: 'bike' | 'engine') => GameMode) | undefined;
const boatF = found['./boat/index.ts']?.['createBoatMode'] as
  (() => GameMode) | undefined;

/** Fallback until a mode exists: a cinematic flight along a path. */
function tour(
  label: string,
  pts: [number, number, number][],
  seconds: number,
  s0: number,
  s1: number,
): GameMode {
  let t = 0;
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
  );
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  return {
    enter: (_w, h) => (
      h.objective(label),
      h.prompt('Preview flight — N skips')
    ),
    update(dt, inp, w) {
      t += (dt / seconds) * (inp.down('ShiftLeft') ? 4 : 1);
      const u = Math.min(1, t);
      curve.getPointAt(u, a);
      curve.getPointAt(Math.min(1, u + 0.02), b);
      a.y = Math.max(
        a.y,
        Math.max(w.heightAt(a.x, a.z), w.oceanHeight(a.x, a.z)) + 2.2,
      );
      b.y = Math.max(b.y, Math.max(w.heightAt(b.x, b.z), 0) + 1.6);
      w.camera.position.lerp(a, Math.min(1, dt * 4));
      w.camera.lookAt(b);
      w.storm = THREE.MathUtils.lerp(s0, s1, u);
    },
    done: () => t >= 1,
    exit() {},
  };
}
const road = (
  from: number,
  to: number,
  n: number,
  lift: number,
): [number, number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const p = world.roadPoint(from + ((to - from) * i) / (n - 1));
    return [p.x, world.heightAt(p.x, p.z) + lift, p.z];
  });
const P = world.places;
const order: (() => GameMode)[] = [
  () =>
    bikeF?.() ?? tour('The Descent', road(0.02, 0.97, 40, 3.2), 70, 0.08, 0.45),
  () =>
    boatF?.() ??
    tour(
      'The Crossing',
      [
        [P.boatStart.x, 4, P.boatStart.z],
        [700, 5, 150],
        [900, 6, -60],
        [1080, 5, -100],
        [P.cove.x, 4, P.cove.z],
      ],
      45,
      0.45,
      0.95,
    ),
  () =>
    tour(
      'The Climb',
      [
        [P.cove.x, 5, P.cove.z],
        [1262, 22, -172],
        [1322, 40, -192],
        [1372, 60, -250],
        [1432, 80, -268],
        [1480, 110, -226],
      ],
      30,
      1,
      0.05,
    ),
];
let idx = 0;
let mode = order[0]!();
let bench: GameMode | null = null;
world.camera.position.set(
  P.bikeStart.x,
  world.heightAt(P.bikeStart.x, P.bikeStart.z) + 6,
  P.bikeStart.z + 10,
);
mode.enter(world, hud);

const timer = new THREE.Timer();
timer.connect(document);
world.renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(Math.max(timer.getDelta(), 0), 1 / 30);
  input.steer = ax('KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight');
  input.throttle = ax('KeyS', 'KeyW', 'ArrowDown', 'ArrowUp');
  input.lookX = lx;
  input.lookY = ly;
  lx = ly = 0;

  if (bench) {
    bench.update(dt, input, world, hud);
    if (bench.done()) {
      bench.exit(world);
      bench = null;
      (mode as unknown as { repaired?: () => void }).repaired?.();
      hud.toast('Chain repaired');
    }
  } else {
    mode.update(dt, input, world, hud);
    // the storm builds with progress through the journey
    const cp = world.camera.position;
    if (idx === 0 && bikeF)
      world.storm = 0.1 + 0.35 * world.roadNearest(cp.x, cp.z).progress;
    else if (idx === 1 && boatF)
      world.storm = THREE.MathUtils.clamp(
        0.45 + (0.5 * (cp.x - 478)) / 727,
        0.45,
        0.95,
      );
    const m = mode as unknown as { needsBench?: boolean };
    if (m.needsBench && benchF) {
      m.needsBench = false;
      bench = benchF('bike');
      bench.enter(world, hud);
    }
    if (mode.done() || input.pressed('KeyN')) {
      mode.exit(world);
      idx = (idx + 1) % order.length;
      mode = order[idx]!();
      mode.enter(world, hud);
    }
  }
  world.update(dt);
  world.render();
  if (performance.now() - lastGraphicsReport > 500) {
    const stats = world.graphicsStats();
    $('render-stats').textContent =
      `${Math.round(stats.fps)} fps · ${stats.gpuMs === null ? 'WebGL2' : stats.gpuMs.toFixed(1) + ' ms GPU'}`;
    $('render-stats').title =
      `${stats.width} × ${stats.height} render pixels · ${stats.triangles.toLocaleString()} triangles · ${stats.calls} draws`;
    lastGraphicsReport = performance.now();
    // dynamic resolution toward 60 fps
    const prev = dynamic.scale;
    if (stats.fps < 54) dynamic.scale = Math.max(0.5, dynamic.scale * 0.9);
    else if (stats.fps > 59 && dynamic.scale < 1)
      dynamic.scale = Math.min(1, dynamic.scale * 1.04);
    if (dynamic.scale !== prev) world.resize();
  }

  $('gauges').innerHTML = [...gauges]
    .map(([k, v]) => `${k} <b>${typeof v === 'number' ? v.toFixed(1) : v}</b>`)
    .join('<br>');
  if ((toastT -= dt) < 0) $('toast').style.opacity = '0';
  hit.clear();
  ptr.pressed = ptr.released = false;
});
