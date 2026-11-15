import * as THREE from 'three';
import { createBoatMode } from './index';
import { createFakeInput, createFakeWorld } from './fake-world';
import type { Hud } from '../api';

const canvas = document.querySelector('canvas')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const world = createFakeWorld();
world.scene.background = new THREE.Color(0x9dbcc8);
world.scene.fog = new THREE.FogExp2(0x9dbcc8, 0.0012);
world.scene.add(new THREE.HemisphereLight(0xcde6ff, 0x4f6659, 2));
const sun = new THREE.DirectionalLight(0xffe2b0, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -14,
  right: 14,
  top: 14,
  bottom: -14,
  far: 100,
});
sun.shadow.bias = -0.0003;
world.scene.add(sun, sun.target);
const waterGeometry = new THREE.PlaneGeometry(4000, 4000);
waterGeometry.rotateX(-Math.PI / 2);
const waterMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x246b78,
  roughness: 0.32,
  metalness: 0.18,
});
const water = new THREE.Mesh(waterGeometry, waterMaterial);
water.receiveShadow = true;
world.scene.add(water);
const markerMaterial = new THREE.MeshStandardMaterial({
  color: 0xeab358,
  roughness: 0.6,
});
for (let i = 0; i < 6; i++) {
  const buoy = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.6, 1.5, 12),
    markerMaterial,
  );
  buoy.position.set(20 + i * 35, 0.4, -20 - i * 20);
  buoy.castShadow = true;
  world.scene.add(buoy);
}
const values = new Map<string, string | number>();
let toastUntil = 0;
const element = (id: string) => document.getElementById(id)!;
const hud: Hud = {
  set: (key, value) => {
    values.set(key, value);
  },
  objective: (text) => {
    element('objective').textContent = text;
  },
  prompt: (text) => {
    element('prompt').textContent = text;
  },
  toast: (text) => {
    element('toast').textContent = text;
    toastUntil = performance.now() + 4000;
  },
};
let windSpeed = 8;
world.windAt = (_x, _z, out) => out.set(-windSpeed, 0, 0);
element('wind').addEventListener('input', (event) => {
  windSpeed = Number((event.target as HTMLInputElement).value);
  element('wind-value').textContent = `${windSpeed} m/s`;
});
const keys = new Set<string>(),
  pressed = new Set<string>();
const input = createFakeInput(keys, pressed);
const mode = createBoatMode();
world.camera.position.set(8, 5, 12);
world.camera.lookAt(0, 2, 0);
mode.enter(world, hud);
element('reset').addEventListener('click', () => {
  mode.exit(world);
  mode.enter(world, hud);
});
const onKeyDown = (event: KeyboardEvent) => {
  if (event.target instanceof HTMLInputElement) return;
  if (!keys.has(event.code)) pressed.add(event.code);
  keys.add(event.code);
  if (
    ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyV', 'KeyE', 'KeyQ', 'KeyR'].includes(
      event.code,
    )
  )
    event.preventDefault();
};
const onKeyUp = (event: KeyboardEvent) => {
  keys.delete(event.code);
};
const onBlur = () => {
  keys.clear();
  pressed.clear();
  input.pointer.down = false;
};
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('blur', onBlur);
canvas.addEventListener('pointerdown', (event) => {
  input.pointer.down = true;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointerup', () => {
  input.pointer.down = false;
});
canvas.addEventListener('pointermove', (event) => {
  if (!input.pointer.down) return;
  input.lookX += event.movementX * 0.0025;
  input.lookY += event.movementY * 0.0025;
});
const resize = () => {
  renderer.setSize(innerWidth, innerHeight);
  world.camera.aspect = innerWidth / innerHeight;
  world.camera.updateProjectionMatrix();
};
resize();
window.addEventListener('resize', resize);
const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 1 / 30);
  world.time += dt;
  element('toast').style.opacity = performance.now() < toastUntil ? '1' : '0';
  input.steer = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  mode.update(dt, input, world, hud);
  sun.position.copy(world.camera.position).add(new THREE.Vector3(-12, 25, -10));
  sun.target.position.copy(world.camera.position);
  const units: Record<string, string> = {
    speed: ' m/s',
    heel: '°',
    load: ' N',
  };
  element('gauges').textContent = [...values]
    .map(
      ([key, value]) =>
        `${key}  ${typeof value === 'number' ? (key === 'trim' ? Math.round(value * 100) + '%' : value.toFixed(1)) : value}${units[key] ?? ''}`,
    )
    .join('\n');
  if (mode.done()) hud.prompt('Cove reached · Reset boat to sail again');
  renderer.render(world.scene, world.camera);
  pressed.clear();
  input.lookX = input.lookY = 0;
});
window.addEventListener(
  'pagehide',
  () => {
    renderer.setAnimationLoop(null);
    mode.exit(world);
    timer.dispose();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', resize);
    waterGeometry.dispose();
    waterMaterial.dispose();
    markerMaterial.dispose();
    renderer.dispose();
  },
  { once: true },
);
