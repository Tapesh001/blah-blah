import {
  BoxGeometry,
  PlaneGeometry,
  SphereGeometry,
  Mesh,
  MeshStandardMaterial,
  ShaderMaterial,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  BackSide,
  Vector3,
} from 'three';
import { createGfx } from './index.ts';
import { fullscreenMaterial } from './fullscreen.js';

const canvas = document.querySelector('#view');
try {
  const gfx = createGfx(canvas, {
    renderScale: 0.75,
    pixelRatio: 1,
    shadows: true,
  });
  const camera = new PerspectiveCamera(48, 1, 0.1, 500);
  camera.position.set(24, 15, 31);
  camera.lookAt(0, 2, 0);
  const scene = gfx.scene;
  const geometry = new BoxGeometry(1, 1, 1);
  const stone = new MeshStandardMaterial({ color: 0x47505a, roughness: 0.77 });
  const metal = new MeshStandardMaterial({
    color: 0x68747c,
    roughness: 0.25,
    metalness: 0.65,
  });
  const lampMaterial = new MeshStandardMaterial({
    color: 0xffc986,
    emissive: 0xff9e38,
    emissiveIntensity: 5,
  });
  function box(x, y, z, sx, sy, sz, material = stone) {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  box(0, -0.6, -3, 23, 1.2, 17);
  box(-5, 2, -5, 7, 4, 5);
  box(-5, 4.2, -5, 7.5, 0.4, 5.5, metal);
  box(3.5, 3.7, -7, 3, 7.4, 3);
  box(3.5, 7.5, -7, 3.4, 0.3, 3.4, metal);
  for (let i = 0; i < 5; i++) {
    box(-9 + i * 4, 0.65, 4.2, 0.3, 1.3, 0.3, metal);
    box(-9 + i * 4, 1.35, 4.2, 0.48, 0.2, 0.48, lampMaterial);
  }
  box(-1, 1, 0, 2, 2, 2, metal);
  const glass = box(
    -4.5,
    2.1,
    -2.45,
    5.5,
    2.5,
    0.1,
    new MeshStandardMaterial({
      color: 0x7bceda,
      transparent: true,
      opacity: 0.4,
      roughness: 0.15,
      depthWrite: false,
    }),
  );
  glass.castShadow = false;
  const water = new Mesh(
    new PlaneGeometry(400, 400),
    new MeshStandardMaterial({
      color: 0x214653,
      roughness: 0.27,
      metalness: 0.35,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.7;
  water.userData.gfxPass = 'ocean';
  scene.add(water);
  const sky = new Mesh(
    new SphereGeometry(220, 24, 12),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      toneMapped: false,
      uniforms: { sun: { value: new Vector3(-0.8, 0.18, -0.5).normalize() } },
      vertexShader:
        'varying vec3 direction; void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 direction; uniform vec3 sun;
      void main() {
        vec3 d = normalize(direction);
        float h = max(d.y, 0.0);
        vec3 c = mix(vec3(0.52, 0.43, 0.33), vec3(0.025, 0.055, 0.10), smoothstep(0.0, 0.55, h));
        c += vec3(2.6, 1.3, 0.5) * pow(max(dot(d, sun), 0.0), 48.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
    }),
  );
  sky.userData.gfxPass = 'sky';
  scene.add(sky);
  const sun = new DirectionalLight(0xffce98, 4.5);
  sun.position.set(-15, 20, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -24,
    right: 24,
    top: 24,
    bottom: -24,
    near: 0.5,
    far: 90,
  });
  sun.shadow.normalBias = 0.04;
  scene.add(sun, new HemisphereLight(0xa5c5e5, 0x242d37, 1.5));

  const history = [];
  let running = true,
    raf;
  function tick() {
    if (!running) return;
    const { canvasWidth, canvasHeight } = gfx.size;
    camera.aspect = canvasWidth / canvasHeight;
    camera.updateProjectionMatrix();
    try {
      if (gfx.render(camera, 1 / 60)) {
        history.push(gfx.stats);
        if (history.length > 240) history.shift();
      }
    } catch (error) {
      document.querySelector('#error').textContent = error.message;
      console.error(error);
      running = false;
    }
    if (running) raf = requestAnimationFrame(tick);
  }
  for (const name of [
    'clear',
    'shadows',
    'opaque',
    'sky',
    'ocean',
    'transparents',
    'post',
    'upscale',
  ]) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = true;
    input.dataset.pass = name;
    input.addEventListener('change', () =>
      gfx.setPassEnabled(name, input.checked),
    );
    label.append(input, ` ${name}`);
    document.querySelector('#passes').append(label);
  }
  document
    .querySelector('#scale')
    .addEventListener('change', (event) =>
      gfx.setRenderScale(Number(event.target.value)),
    );
  window.gfxHarness = {
    gfx,
    camera,
    scene,
    history,
    addTestPost() {
      const material = fullscreenMaterial(
        'uniform sampler2D source; varying vec2 vUv; void main() { gl_FragColor = texture2D(source, vUv) * vec4(0.4, 0.4, 0.4, 1.0); }',
        { source: { value: null } },
      );
      gfx.registerPostPass({
        name: 'test-gain',
        render({ renderer, fullscreen, input, output }) {
          material.uniforms.source.value = input;
          fullscreen.render(renderer, material, output);
        },
        dispose() {
          material.dispose();
        },
      });
    },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      const geometries = new Set(),
        materials = new Set();
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material])
          if (material) materials.add(material);
        object.shadow?.dispose();
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      gfx.dispose();
    },
  };
  tick();
} catch (error) {
  document.querySelector('#error').textContent = error.message;
  console.error(error);
}
