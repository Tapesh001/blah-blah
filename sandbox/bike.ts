import * as THREE from 'three';
import { BIKE, createBike, stepBike, stateHash } from '../src/land/index.ts';
import type { BikeWorld, Surface } from '../src/land/index.ts';
const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const value = (id: string) => Number(element<HTMLInputElement>(id).value);
let bike = createBike(),
  paused = false,
  accumulator = 0,
  previous = 0,
  telemetryTime = 0;
const keys = new Set<string>(),
  stage = element('bike-stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#14212a');
scene.fog = new THREE.Fog('#14212a', 45, 130);
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stage.append(renderer.domElement);
renderer.domElement.setAttribute(
  'aria-label',
  'Grey bicycle on a grid plane and ramp',
);
scene.add(new THREE.HemisphereLight(0xc2d9e7, 0x485649, 2));
const light = new THREE.DirectionalLight(0xffd8a1, 3);
light.position.set(-5, 12, -3);
scene.add(light);
const grid = new THREE.GridHelper(240, 120, 0x6f818a, 0x304651);
scene.add(grid);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600),
  new THREE.MeshStandardMaterial({ color: 0x1e3037, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.015;
scene.add(ground);
const rampGeometry = new THREE.BufferGeometry();
const vertices = new Float32Array([
  30, 0, -12, 30, 0, 12, 60, 2.4, -12, 60, 2.4, -12, 30, 0, 12, 60, 2.4, 12, 60,
  2.4, -12, 60, 2.4, 12, 300, 2.4, -12, 300, 2.4, -12, 60, 2.4, 12, 300, 2.4,
  12,
]);
rampGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
rampGeometry.computeVertexNormals();
const ramp = new THREE.Mesh(
  rampGeometry,
  new THREE.MeshStandardMaterial({
    color: 0x637575,
    roughness: 1,
    side: THREE.DoubleSide,
  }),
);
scene.add(ramp);
const bikeRoot = new THREE.Group();
scene.add(bikeRoot);
const frame = new THREE.MeshStandardMaterial({
  color: 0xc4a777,
  metalness: 0.4,
  roughness: 0.5,
});
const tyre = new THREE.MeshStandardMaterial({
  color: 0x13191c,
  roughness: 0.9,
});
const metal = new THREE.MeshStandardMaterial({
  color: 0xb6c2c7,
  metalness: 0.6,
  roughness: 0.4,
});
function tube(from: number[], to: number[], radius = 0.025) {
  const a = new THREE.Vector3(...from),
    b = new THREE.Vector3(...to),
    delta = b.clone().sub(a);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, delta.length(), 8),
    frame,
  );
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  bikeRoot.add(mesh);
}
const rear = [-0.48, 0.34, 0],
  front = [0.6, 0.34, 0],
  crank = [0, 0.33, 0],
  seat = [-0.12, 0.91, 0],
  head = [0.43, 0.88, 0];
for (const [a, b] of [
  [rear, crank],
  [rear, seat],
  [seat, crank],
  [seat, head],
  [crank, head],
  [head, front],
] as const)
  tube(a, b);
tube([0.43, 0.96, -0.22], [0.43, 0.96, 0.22]);
const wheels = [-0.48, 0.6].map((x) => {
  const group = new THREE.Group();
  group.position.set(x, 0.34, 0);
  const rubber = new THREE.Mesh(
    new THREE.TorusGeometry(0.315, 0.025, 8, 40),
    tyre,
  );
  group.add(rubber);
  for (let i = 0; i < 12; i++) {
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.61, 0.007, 0.007),
      metal,
    );
    spoke.rotation.z = (i * Math.PI) / 12;
    group.add(spoke);
  }
  bikeRoot.add(group);
  return group;
});
const rider = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.12, 0.43, 4, 8),
  new THREE.MeshStandardMaterial({ color: 0x9fb5ba }),
);
rider.position.set(0, 1.12, 0);
rider.rotation.z = -0.35;
bikeRoot.add(rider);
const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), metal);
headMesh.position.set(0.17, 1.51, 0);
bikeRoot.add(headMesh);
function height(x: number) {
  return element<HTMLSelectElement>('terrain').value === 'ramp'
    ? Math.max(0, Math.min(2.4, (x - 30) * 0.08))
    : 0;
}
const world: BikeWorld = {
  sample(x) {
    const slope =
        element<HTMLSelectElement>('terrain').value === 'ramp' &&
        x > 30 &&
        x < 60
          ? 0.08
          : 0,
      n = Math.hypot(1, slope);
    return {
      height: height(x),
      normal: { x: -slope / n, y: 1 / n, z: 0 },
      surface: element<HTMLSelectElement>('surface').value as Surface,
      wetness: element<HTMLInputElement>('wet').checked ? 1 : 0,
    };
  },
  wind: () => ({ x: value('wind'), y: 0, z: value('crosswind') }),
};
function reset() {
  bike = createBike();
  keys.clear();
  accumulator = 0;
  element('events').textContent = 'Reset. Press W to pedal.';
}
element('reset').onclick = reset;
element('coast').onclick = () => {
  reset();
  bike.velocity.x = 10;
  element('events').textContent =
    'Coasting from 10 m/s — leave the controls untouched to measure the stopping distance.';
};
element('pause').onclick = () => {
  paused = !paused;
  keys.clear();
  element('pause').textContent = paused ? 'Resume' : 'Pause';
};
element('terrain').onchange = reset;
element('wind').oninput = () => {
  element('wind-value').textContent = `${value('wind')} m/s`;
};
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).matches('input,select,button,textarea')) return;
  if (
    [
      'KeyW',
      'KeyS',
      'KeyA',
      'KeyD',
      'Space',
      'ShiftLeft',
      'ShiftRight',
      'KeyR',
    ].includes(e.code)
  ) {
    e.preventDefault();
    keys.add(e.code);
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => {
  keys.clear();
  accumulator = 0;
  previous = 0;
});
new ResizeObserver(() => {
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  camera.aspect = stage.clientWidth / stage.clientHeight;
  camera.updateProjectionMatrix();
}).observe(stage);
const look = new THREE.Vector3(),
  desired = new THREE.Vector3();
function frameLoop(now: number) {
  const elapsed = previous ? Math.min(0.1, (now - previous) / 1000) : 0;
  previous = now;
  if (!paused && !document.hidden) accumulator += elapsed;
  while (accumulator >= BIKE.fixedDt) {
    const events = stepBike(
      bike,
      {
        throttle: Number(keys.has('KeyW')) - Number(keys.has('KeyS')),
        steer: Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
        jump: keys.has('Space'),
        run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        sprint: keys.has('KeyR'),
        assist: element<HTMLInputElement>('assist').checked,
      },
      world,
    );
    for (const event of events)
      element('events').textContent =
        event.type === 'bike:crash'
          ? `Crash: ${event.reason}. Returning to the last safe point…`
          : event.type === 'bike:landing'
            ? `Landing: ${event.impulse.toFixed(0)} N·s`
            : event.type;
    accumulator -= BIKE.fixedDt;
  }
  ramp.visible = element<HTMLSelectElement>('terrain').value === 'ramp';
  const p = bike.position;
  bikeRoot.position.set(p.x, p.y - BIKE.height, p.z);
  bikeRoot.rotation.set(0, -bike.heading, 0);
  bikeRoot.rotateZ(bike.pitch);
  bikeRoot.rotateX(bike.lean);
  wheels[0]!.rotation.z = -bike.wheelSpin[1];
  wheels[1]!.rotation.z = -bike.wheelSpin[0];
  rider.rotation.z =
    keys.has('ShiftLeft') || keys.has('ShiftRight') ? -0.8 : -0.35;
  desired.set(
    p.x - Math.cos(bike.heading) * 4.5,
    p.y + 2.2,
    p.z - Math.sin(bike.heading) * 4.5 + 2.2,
  );
  camera.position.lerp(
    desired,
    previous === now && now < 100 ? 1 : 1 - Math.exp(-elapsed * 7),
  );
  look.set(
    p.x + Math.cos(bike.heading) * 2,
    p.y + 0.15,
    p.z + Math.sin(bike.heading) * 2,
  );
  camera.lookAt(look);
  const speed = Math.hypot(bike.velocity.x, bike.velocity.z);
  camera.fov = 60 + Math.min(18, speed);
  camera.updateProjectionMatrix();
  grid.position.x = Math.round(p.x / 20) * 20;
  grid.position.z = Math.round(p.z / 20) * 20;
  ground.position.x = p.x;
  ground.position.z = p.z;
  renderer.render(scene, camera);
  if (now - telemetryTime > 100) {
    const metrics = [
      `${speed.toFixed(2)} m/s`,
      `${bike.distance.toFixed(1)} m`,
      `${bike.cadence.toFixed(0)} rpm`,
      `Lean ${((bike.lean * 180) / Math.PI).toFixed(1)}° / ${((bike.leanLimit * 180) / Math.PI).toFixed(1)}°`,
      `Load ${bike.normalLoad.map((n) => n.toFixed(0)).join(' / ')} N`,
      `Stamina ${(bike.stamina * 100).toFixed(0)}%`,
      `Hash ${stateHash(bike)}`,
    ];
    element('telemetry').replaceChildren(
      ...metrics.map((text) => {
        const span = document.createElement('span');
        span.className = 'gauge metric';
        span.textContent = text;
        return span;
      }),
    );
    telemetryTime = now;
  }
  requestAnimationFrame(frameLoop);
}
camera.position.set(-4.5, 3.2, 2.2);
requestAnimationFrame(frameLoop);
