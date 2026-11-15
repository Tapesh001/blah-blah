import * as THREE from 'three';
import { gearGeometry } from './gear-mesh';
import { radiusOf, type BenchDef, type BoardResult } from './rules';

export const GEAR_Y = 0.962;
export function buildBenchModel(def: BenchDef) {
  const root = new THREE.Group();
  root.name = `${def.kind}-repair-bench`;
  const brass = new THREE.MeshStandardMaterial({
    color: 0xc49a50,
    metalness: 0.88,
    roughness: 0.29,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x9aaeb9,
    metalness: 0.92,
    roughness: 0.3,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x18262c,
    metalness: 0.5,
    roughness: 0.48,
  });
  const wood = new THREE.MeshStandardMaterial({
    color: 0x593b29,
    roughness: 0.75,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0x806244,
    metalness: 0.65,
    roughness: 0.4,
  });
  const glow = new THREE.MeshStandardMaterial({
    color: 0xffdc9e,
    emissive: 0xffc574,
    emissiveIntensity: 4,
  });
  const good = new THREE.MeshStandardMaterial({
    color: 0x73dab6,
    emissive: 0x3bb394,
    emissiveIntensity: 0.5,
    metalness: 0.4,
    roughness: 0.4,
  });
  const bad = new THREE.MeshStandardMaterial({
    color: 0xef916e,
    emissive: 0xcb542e,
    emissiveIntensity: 0.5,
  });
  const invisible = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
  });
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>([
      brass,
      steel,
      dark,
      wood,
      trim,
      glow,
      good,
      bad,
      invisible,
    ]),
    textures = new Set<THREE.Texture>();
  const up = new THREE.Vector3(0, 1, 0);
  const mesh = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    parent: THREE.Object3D = root,
  ) => {
    geometries.add(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const tube = (
    a: number[],
    b: number[],
    r: number,
    mat: THREE.Material = steel,
  ) => {
    const start = new THREE.Vector3(a[0], a[1], a[2]),
      end = new THREE.Vector3(b[0], b[1], b[2]),
      delta = end.clone().sub(start);
    const m = mesh(new THREE.CylinderGeometry(r, r, delta.length(), 10), mat);
    m.position.copy(start).add(end).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, delta.normalize());
    return m;
  };
  function roundedSlab(width: number, length: number, depth: number) {
    const shape = new THREE.Shape(),
      x = -width / 2,
      y = -length / 2,
      r = 0.02;
    shape.moveTo(x + r, y);
    shape.lineTo(x + width - r, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + r);
    shape.lineTo(x + width, y + length - r);
    shape.quadraticCurveTo(x + width, y + length, x + width - r, y + length);
    shape.lineTo(x + r, y + length);
    shape.quadraticCurveTo(x, y + length, x, y + length - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    return new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSize: 0.006,
      bevelThickness: 0.006,
      bevelSegments: 3,
      curveSegments: 8,
    });
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#8c6541';
    c.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 180; i++) {
      c.strokeStyle = `rgba(${i % 2 ? '30,20,12' : '200,158,102'},${0.06 + (i % 7) * 0.012})`;
      c.lineWidth = 0.5 + (i % 3) * 0.5;
      c.beginPath();
      for (let y = 0; y <= 512; y += 8) {
        const x =
          (i * 256) / 180 +
          Math.sin(y * 0.017 + i) * 2.5 +
          Math.sin(y * 0.048 + i * 0.7) * 1.3;
        if (y === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    wood.map = texture;
  }
  for (let i = 0; i < 4; i++) {
    const plank = mesh(roundedSlab(0.344, 1.12, 0.05), wood);
    plank.rotation.x = -Math.PI / 2;
    plank.position.set((i - 1.5) * 0.352, 0.88, 0);
  }
  for (const x of [-0.57, 0.57])
    for (const z of [-0.43, 0.43]) {
      const leg = mesh(
        new THREE.LatheGeometry(
          [
            new THREE.Vector2(0.045, 0),
            new THREE.Vector2(0.04, 0.08),
            new THREE.Vector2(0.027, 0.18),
            new THREE.Vector2(0.03, 0.62),
            new THREE.Vector2(0.05, 0.78),
            new THREE.Vector2(0.05, 0.88),
          ],
          14,
        ),
        wood,
      );
      leg.position.set(x, 0, z);
      const screw = mesh(
        new THREE.CylinderGeometry(0.008, 0.008, 0.004, 8),
        brass,
      );
      screw.position.set(x, 0.937, z);
    }
  for (const z of [-0.43, 0.43])
    tube([-0.57, 0.64, z], [0.57, 0.64, z], 0.015, dark);
  // Recessed tray rail and circular part seats.
  const tray = mesh(roundedSlab(1.28, 0.33, 0.012), dark);
  tray.rotation.x = -Math.PI / 2;
  tray.position.set(0, 0.932, 0.34);
  const parts = new Map<
    string,
    {
      group: THREE.Group;
      pick: THREE.Mesh;
      home: THREE.Vector3;
      teeth: number;
      selection: THREE.Mesh;
    }
  >();
  const picks: THREE.Mesh[] = [];
  function label(text: string, x: number, z: number, width: number = 0.2) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 80;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#ead5a9';
    c.font = '600 34px system-ui';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 256, 40);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      roughness: 0.9,
      emissive: 0x8f7450,
      emissiveIntensity: 0.4,
    });
    materials.add(mat);
    const plane = mesh(new THREE.PlaneGeometry(width, (width * 80) / 512), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(x, 0.946, z);
    plane.castShadow = false;
  }
  function part(
    id: string,
    teeth: number,
    position: THREE.Vector3,
    loose: boolean,
  ) {
    const group = new THREE.Group();
    group.name = `bench-part-${id}`;
    group.position.copy(position);
    root.add(group);
    const body = mesh(
      gearGeometry(teeth),
      id === 'output' && def.kind === 'engine'
        ? brass
        : teeth % 8 === 0
          ? steel
          : brass,
      group,
    );
    body.rotation.x = -Math.PI / 2;
    const hub = mesh(
      new THREE.CylinderGeometry(
        radiusOf(teeth) * 0.22,
        radiusOf(teeth) * 0.22,
        0.045,
        16,
      ),
      brass,
      group,
    );
    const bore = mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.047, 12),
      dark,
      group,
    );
    bore.position.y = 0.001;
    const selection = mesh(
      new THREE.TorusGeometry(radiusOf(teeth) + 0.017, 0.002, 5, 48),
      good,
      group,
    );
    selection.rotation.x = Math.PI / 2;
    selection.position.y = -0.02;
    selection.visible = false;
    const pick = mesh(
      new THREE.CylinderGeometry(
        radiusOf(teeth) + 0.008,
        radiusOf(teeth) + 0.008,
        0.07,
        32,
      ),
      invisible,
      group,
    );
    pick.userData.partId = id;
    pick.castShadow = pick.receiveShadow = false;
    if (loose) picks.push(pick);
    parts.set(id, { group, pick, home: position.clone(), teeth, selection });
    hub.name = `${teeth}-tooth-hub`;
  }
  for (const axle of def.axles) {
    const collar = mesh(new THREE.TorusGeometry(0.025, 0.004, 8, 24), trim);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(axle.x, 0.939, axle.z);
    const peg = mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.08, 12), steel);
    peg.position.set(axle.x, 0.966, axle.z);
    if (axle.fixed)
      part(
        axle.fixed.id,
        axle.fixed.teeth,
        new THREE.Vector3(axle.x, GEAR_Y, axle.z),
        false,
      );
    label(
      axle.id === 'output' && def.kind === 'engine'
        ? '40T KEYSTONE'
        : axle.fixed
          ? `${axle.fixed.teeth}T ${axle.id.toUpperCase()}`
          : axle.id.toUpperCase(),
      axle.x,
      axle.z - (axle.fixed ? radiusOf(axle.fixed.teeth) : 0.05) - 0.055,
      0.21,
    );
  }
  def.tray.forEach((p, i) => {
    const x = (i - 1.5) * 0.3;
    const seat = mesh(
      new THREE.TorusGeometry(radiusOf(p.teeth) + 0.012, 0.003, 7, 48),
      trim,
    );
    seat.rotation.x = Math.PI / 2;
    seat.position.set(x, 0.95, 0.34);
    part(p.id, p.teeth, new THREE.Vector3(x, 0.977, 0.34), true);
    label(`${p.teeth} TEETH`, x, 0.5, 0.16);
  });
  label(
    def.kind === 'bike'
      ? 'CHAIN REPAIR · 2.5× SAME'
      : 'KEYSTONE · 0.5× REVERSE',
    0,
    -0.49,
    0.59,
  );
  // Brass task lamp with articulated arm, a shaded bulb, and an actual warm light.
  const base = mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.025, 24), brass);
  base.position.set(-0.57, 0.953, -0.38);
  tube([-0.57, 0.97, -0.38], [-0.6, 1.31, -0.38], 0.009, dark);
  tube([-0.6, 1.31, -0.38], [-0.37, 1.56, -0.31], 0.009, brass);
  const shade = mesh(new THREE.ConeGeometry(0.105, 0.13, 24, 1, true), dark);
  shade.position.set(-0.37, 1.53, -0.31);
  const bulb = mesh(new THREE.SphereGeometry(0.025, 12, 8), glow);
  bulb.position.set(-0.37, 1.49, -0.31);
  const lamp = new THREE.SpotLight(0xffd69a, 8, 4, 0.75, 0.7, 2);
  lamp.position.copy(bulb.position);
  lamp.target.position.set(0, 0.94, 0);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  lamp.shadow.bias = -0.0002;
  root.add(lamp, lamp.target);
  const dial = new THREE.Group();
  dial.position.set(0.47, 0.965, -0.13);
  root.add(dial);
  dial.visible = def.kind === 'bike';
  const dialBase = mesh(
    new THREE.CylinderGeometry(0.062, 0.062, 0.012, 32),
    dark,
    dial,
  );
  const dialRim = mesh(
    new THREE.TorusGeometry(0.064, 0.004, 7, 48),
    brass,
    dial,
  );
  dialRim.rotation.x = Math.PI / 2;
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI * 1.25 - (i / 20) * Math.PI * 1.5;
    const tick = mesh(
      new THREE.CylinderGeometry(0.0018, 0.0018, 0.006, 5),
      i >= 11 && i <= 14 ? good : steel,
      dial,
    );
    tick.position.set(Math.cos(a) * 0.073, 0.004, Math.sin(a) * 0.073);
  }
  const pointer = mesh(
    new THREE.CapsuleGeometry(0.003, 0.049, 3, 6),
    brass,
    dial,
  );
  pointer.rotation.z = Math.PI / 2;
  pointer.position.y = 0.013;
  const greenArc = new THREE.CatmullRomCurve3(
    Array.from({ length: 15 }, (_, i) => {
      const a = Math.PI * 1.25 - (0.55 + (i / 14) * 0.17) * Math.PI * 1.5;
      return new THREE.Vector3(Math.cos(a) * 0.079, 0.006, Math.sin(a) * 0.079);
    }),
  );
  mesh(new THREE.TubeGeometry(greenArc, 20, 0.003, 5, false), good, dial);
  dialBase.name = 'chain-tensioner';
  if (def.kind === 'bike') label('TENSION A / D', 0.47, 0.015, 0.22);
  const ghost = mesh(new THREE.TorusGeometry(0.04, 0.003, 7, 32), good);
  ghost.rotation.x = Math.PI / 2;
  ghost.visible = false;
  function arrange(
    placement: Readonly<Record<string, string | undefined>>,
    dragging: string | null,
  ) {
    for (const [id, p] of parts) {
      if (id === dragging || !def.tray.some((t) => t.id === id)) continue;
      const axle = def.axles.find((a) => placement[a.id] === id);
      if (axle) p.group.position.set(axle.x, GEAR_Y, axle.z);
      else p.group.position.copy(p.home);
    }
  }
  function turn(
    angle: number,
    result: BoardResult,
    tension: number,
    selected: string | null,
  ) {
    for (const [id, p] of parts) {
      p.group.rotation.y =
        (result.phases[id] ?? 0) + angle * (result.rates[id] ?? 0);
      p.selection.visible = id === selected;
    }
    const a = Math.PI * 1.25 - tension * Math.PI * 1.5;
    pointer.position.x = Math.cos(a) * 0.026;
    pointer.position.z = Math.sin(a) * 0.026;
    pointer.rotation.set(0, -a, Math.PI / 2);
  }
  function preview(axleId: string | null, legal: boolean) {
    const axle = def.axles.find((a) => a.id === axleId);
    ghost.visible = !!axle;
    if (axle) ghost.position.set(axle.x, GEAR_Y + 0.055, axle.z);
    ghost.material = legal ? good : bad;
  }
  function dispose() {
    root.removeFromParent();
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    lamp.shadow.map?.dispose();
    lamp.dispose();
  }
  return { root, parts, picks, arrange, turn, preview, dispose };
}
