import * as THREE from 'three';
import { createBench } from '../bench';
import type { GameMode, Input } from '../api';
import { createBikeMode, type BikeMode } from './index';
import { fakeHud, fakeWorld } from './fake-world';

const canvas = document.querySelector('canvas')!,
  world = fakeWorld(),
  hud = fakeHud();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
world.scene.background = new THREE.Color(0x263b48);
world.scene.fog = new THREE.Fog(0x263b48, 35, 100);
world.scene.add(new THREE.HemisphereLight(0xcde5ff, 0x8b7160, 2));
const sun = new THREE.DirectionalLight(0xffe2b5, 3);
sun.position.set(-8, 15, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -15;
sun.shadow.camera.right = sun.shadow.camera.top = 15;
sun.shadow.normalBias = 0.015;
world.scene.add(sun, sun.target);
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000),
  new THREE.MeshStandardMaterial({ color: 0x384b4d, roughness: 0.88 }),
);
plane.rotation.x = -Math.PI / 2;
plane.position.y = 1.995;
plane.receiveShadow = true;
world.scene.add(plane);
const grid = new THREE.GridHelper(200, 100, 0x7f9294, 0x495f65);
grid.position.y = 2.002;
world.scene.add(grid);
const road = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 1200),
  new THREE.MeshStandardMaterial({ color: 0x253039, roughness: 0.9 }),
);
road.rotation.x = -Math.PI / 2;
road.position.set(0, 2.003, -500);
road.receiveShadow = true;
world.scene.add(road);
world.camera.position.set(0, 5, 6);
world.camera.lookAt(0, 3, 0);
const keys = new Set<string>(),
  pressed = new Set<string>();
const pointer = { x: 0, y: 0, down: false, pressed: false, released: false };
window.addEventListener('keydown', (event) => {
  if ((event.target as HTMLElement).matches('select,input')) return;
  if (!keys.has(event.code)) pressed.add(event.code);
  keys.add(event.code);
  if (
    [
      'Space',
      'Tab',
      'Backspace',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
    ].includes(event.code)
  )
    event.preventDefault();
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => {
  keys.clear();
  pressed.clear();
  pointer.down = false;
});
canvas.addEventListener('pointermove', (event) => {
  const r = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = 1 - ((event.clientY - r.top) / r.height) * 2;
});
canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  pointer.down = pointer.pressed = true;
});
canvas.addEventListener('pointerup', () => {
  pointer.down = false;
  pointer.released = true;
});
canvas.addEventListener('pointercancel', () => {
  pointer.down = false;
  pointer.released = true;
});
const input: Input = {
  steer: 0,
  throttle: 0,
  lookX: 0,
  lookY: 0,
  down: (k) => keys.has(k),
  pressed: (k) => pressed.has(k),
  pointer,
};
let mode: GameMode = createBikeMode(),
  suspended: BikeMode | null = null;
mode.enter(world, hud);
const selector = document.querySelector<HTMLSelectElement>('#mode')!;
selector.onchange = () => {
  mode.exit(world);
  suspended?.exit(world);
  suspended = null;
  keys.clear();
  pressed.clear();
  hud.values.clear();
  mode =
    selector.value === 'ride'
      ? createBikeMode()
      : createBench(selector.value === 'engine' ? 'engine' : 'bike');
  mode.enter(world, hud);
  selector.blur();
};
document.querySelector<HTMLButtonElement>('#ridge')!.onclick = (event) => {
  const nearest = world.roadNearest;
  world.roadNearest = (x, z) => ({ ...nearest(x, z), progress: 0.5 });
  hud.toast('Ridge armed. W snaps the chain; E opens the bench.');
  (event.currentTarget as HTMLElement).blur();
};
const resize = () => {
  renderer.setSize(innerWidth, innerHeight, false);
  world.camera.aspect = innerWidth / innerHeight;
  world.camera.updateProjectionMatrix();
};
addEventListener('resize', resize);
resize();
let last = 0,
  toast = '',
  toastTime = 0;
function frame(now: number) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 0;
  last = now;
  world.time += dt;
  input.steer =
    Number(keys.has('KeyD') || keys.has('ArrowRight')) -
    Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  input.throttle =
    Number(keys.has('KeyW') || keys.has('ArrowUp')) -
    Number(keys.has('KeyS') || keys.has('ArrowDown'));
  mode.update(dt, input, world, hud);
  if (suspended && mode.done()) {
    mode.exit(world);
    mode = suspended;
    suspended.repaired();
    suspended = null;
  } else if (!suspended && (mode as BikeMode).needsBench) {
    suspended = mode as BikeMode;
    suspended.needsBench = false;
    mode = createBench('bike');
    mode.enter(world, hud);
  }
  sun.target.position.copy(world.camera.position);
  sun.position.copy(world.camera.position).add(new THREE.Vector3(-8, 12, 5));
  renderer.render(world.scene, world.camera);
  document.querySelector('#objective')!.textContent = hud.objectiveText;
  document.querySelector('#prompt')!.textContent = hud.promptText;
  const gauges = document.querySelector('#gauges')!;
  gauges.replaceChildren(
    ...[...hud.values].map(([key, value]) => {
      const row = document.createElement('div');
      row.textContent = `${key}  ${typeof value === 'number' ? value.toFixed(2) : value}`;
      return row;
    }),
  );
  if (hud.messages.at(-1) !== toast) {
    toast = hud.messages.at(-1) ?? '';
    toastTime = 3;
  }
  toastTime -= dt;
  document.querySelector('#toast')!.textContent = toastTime > 0 ? toast : '';
  pressed.clear();
  pointer.pressed = pointer.released = false;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
