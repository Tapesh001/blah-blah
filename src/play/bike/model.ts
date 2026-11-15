import * as THREE from 'three';
import { chainPath, pitchRadius } from '../../mech/sim/chain';
import { gearGeometry } from '../bench/gear-mesh';
import { surfaceMaps } from '../bench/surfaces';
import { COGS, type RideState } from './ride';

/** Every component is modelled locally; +Y up, front wheel towards local -Z. */
export function buildBikeModel() {
  const root = new THREE.Group(),
    leanRoot = new THREE.Group();
  root.name = 'ride-bicycle';
  root.add(leanRoot);
  const brushed = surfaceMaps('metal'),
    hide = surfaceMaps('leather'),
    weave = surfaceMaps('cloth');
  const paint = new THREE.MeshPhysicalMaterial({
    color: 0x166d73,
    metalness: 0.58,
    roughness: 0.27,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
    normalMap: brushed.parameters.normalMap,
    normalScale: new THREE.Vector2(0.08, 0.08),
  });
  const brass = new THREE.MeshPhysicalMaterial({
    color: 0xd5ac63,
    metalness: 0.85,
    roughness: 0.28,
    ...brushed.parameters,
    normalScale: new THREE.Vector2(0.3, 0.3),
    anisotropy: 0.6,
    clearcoat: 0.25,
  });
  const steel = new THREE.MeshPhysicalMaterial({
    color: 0xb5c3c9,
    metalness: 0.9,
    roughness: 0.26,
    ...brushed.parameters,
    normalScale: new THREE.Vector2(0.25, 0.25),
    anisotropy: 0.72,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x171e21,
    roughness: 0.88,
    normalMap: hide.parameters.normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
  });
  const leather = new THREE.MeshStandardMaterial({
    color: 0x51382a,
    roughness: 0.65,
    ...hide.parameters,
    normalScale: new THREE.Vector2(0.55, 0.55),
  });
  const jacket = new THREE.MeshStandardMaterial({
    color: 0xc57e3e,
    roughness: 0.76,
    ...weave.parameters,
    normalScale: new THREE.Vector2(0.4, 0.4),
  });
  const pants = new THREE.MeshStandardMaterial({
    color: 0x263a43,
    roughness: 0.85,
    ...weave.parameters,
    normalScale: new THREE.Vector2(0.35, 0.35),
  });
  const skin = new THREE.MeshStandardMaterial({
    color: 0xbe9273,
    roughness: 0.8,
  });
  const helper = new THREE.Object3D(),
    up = new THREE.Vector3(0, 1, 0);
  const materials = [paint, brass, steel, rubber, leather, jacket, pants, skin];
  const geometries = new Set<THREE.BufferGeometry>();
  const mesh = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D = leanRoot,
  ) => {
    geometries.add(geometry);
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const vector = (p: readonly number[]) =>
    new THREE.Vector3(p[0]!, p[1]!, p[2]!);
  const tube = (
    a: readonly number[],
    b: readonly number[],
    radius: number,
    material: THREE.Material = paint,
    parent: THREE.Object3D = leanRoot,
  ) => {
    const start = vector(a),
      end = vector(b),
      direction = end.clone().sub(start);
    const m = mesh(
      new THREE.CylinderGeometry(radius, radius, direction.length(), 10),
      material,
      parent,
    );
    m.position.copy(start).add(end).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, direction.normalize());
    return m;
  };
  const curve = (
    points: number[][],
    radius: number,
    material: THREE.Material,
    parent: THREE.Object3D = leanRoot,
  ) =>
    mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points.map(vector)),
        30,
        radius,
        8,
        false,
      ),
      material,
      parent,
    );
  const ellipsoid = (
    position: number[],
    scale: number[],
    material: THREE.Material,
    parent: THREE.Object3D = leanRoot,
  ) => {
    const m = mesh(new THREE.SphereGeometry(1, 16, 12), material, parent);
    m.position.copy(vector(position));
    m.scale.copy(vector(scale));
    return m;
  };
  const rear = [0, 0.34, 0.54],
    bottom = [0, 0.33, 0.03],
    seat = [0, 0.92, 0.22],
    head = [0, 0.91, -0.38];
  tube(seat, bottom, 0.026);
  tube(seat, head, 0.024);
  tube(bottom, head, 0.032);
  for (const p of [seat, head, bottom])
    for (let i = 0; i < 3; i++) {
      const bead = mesh(
        new THREE.TorusGeometry(0.029 + i * 0.001, 0.0015, 5, 24),
        steel,
      );
      bead.position.copy(vector(p));
      bead.position.y += (i - 1) * 0.004;
      bead.rotation.x = Math.PI / 2;
    }
  for (const side of [-1, 1]) {
    tube([side * 0.06, 0.34, 0.54], [side * 0.04, 0.33, 0.03], 0.014);
    tube([side * 0.06, 0.34, 0.54], seat, 0.012);
  }
  for (const p of [bottom, seat, head])
    ellipsoid(p, [0.037, 0.04, 0.04], brass);
  tube(seat, [0, 1.01, 0.23], 0.013, steel);
  ellipsoid([0, 1.02, 0.25], [0.105, 0.027, 0.15], leather);
  // Fine seat/top tube bands and bottle cage add readable silhouettes at ride distance.
  tube([0, 0.6, 0.13], [0, 0.69, 0.16], 0.034, brass);
  const bottle = mesh(new THREE.CapsuleGeometry(0.035, 0.15, 4, 10), steel);
  bottle.position.set(0, 0.59, -0.02);
  bottle.rotation.x = -0.25;
  curve(
    [
      [0.045, 0.47, 0.03],
      [0.06, 0.55, -0.06],
      [0.06, 0.68, -0.05],
      [0.045, 0.72, 0.03],
    ],
    0.004,
    brass,
  );
  const steering = new THREE.Group();
  steering.position.set(0, 0.91, -0.38);
  leanRoot.add(steering);
  for (const side of [-1, 1])
    curve(
      [
        [side * 0.035, 0, 0],
        [side * 0.05, -0.3, -0.08],
        [side * 0.055, -0.57, -0.16],
      ],
      0.014,
      steel,
      steering,
    );
  tube([0, 0, 0], [0, 0.12, -0.045], 0.015, steel, steering);
  curve(
    [
      [-0.26, 0.1, 0.02],
      [-0.23, 0.13, -0.08],
      [-0.12, 0.13, -0.1],
      [0.12, 0.13, -0.1],
      [0.23, 0.13, -0.08],
      [0.26, 0.1, 0.02],
    ],
    0.012,
    steel,
    steering,
  );
  for (const side of [-1, 1]) {
    curve(
      [
        [side * 0.24, 0.12, -0.07],
        [side * 0.26, 0.1, 0.02],
        [side * 0.245, 0.045, 0.07],
      ],
      0.02,
      rubber,
      steering,
    );
    tube(
      [side * 0.225, 0.065, -0.06],
      [side * 0.23, 0.005, -0.02],
      0.006,
      brass,
      steering,
    );
    curve(
      [
        [side * 0.2, 0.08, -0.08],
        [side * 0.12, -0.04, -0.18],
        [side * 0.04, -0.23, -0.16],
      ],
      0.002,
      rubber,
      steering,
    );
  }
  function wheel(parent: THREE.Object3D, position: THREE.Vector3) {
    const group = new THREE.Group();
    group.position.copy(position);
    parent.add(group);
    for (const [r, t, mat] of [
      [0.314, 0.026, rubber],
      [0.288, 0.009, steel],
      [0.329, 0.003, brass],
    ] as const) {
      const ring = mesh(new THREE.TorusGeometry(r, t, 12, 96), mat, group);
      ring.rotation.y = Math.PI / 2;
    }
    const hub = mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.12, 12),
      steel,
      group,
    );
    hub.rotation.z = Math.PI / 2;
    const treadGeo = new THREE.CapsuleGeometry(0.0033, 0.014, 2, 5);
    geometries.add(treadGeo);
    const treads = new THREE.InstancedMesh(treadGeo, rubber, 144);
    treads.name = 'tyre-tread';
    treads.castShadow = treads.receiveShadow = true;
    group.add(treads);
    for (let i = 0; i < 144; i++) {
      const a = ((i % 72) * Math.PI) / 36,
        side = i < 72 ? -1 : 1;
      helper.position.set(
        side * 0.012,
        Math.cos(a) * 0.336,
        Math.sin(a) * 0.336,
      );
      helper.quaternion.setFromUnitVectors(
        up,
        new THREE.Vector3(side * 0.8, -Math.sin(a) * 0.6, Math.cos(a) * 0.6),
      );
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      treads.setMatrixAt(i, helper.matrix);
    }
    const rotorShape = new THREE.Shape();
    rotorShape.absarc(0, 0, 0.083, 0, Math.PI * 2, false);
    const centerHole = new THREE.Path();
    centerHole.absarc(0, 0, 0.023, 0, Math.PI * 2, true);
    rotorShape.holes.push(centerHole);
    for (let i = 0; i < 18; i++) {
      const a = (i * Math.PI) / 9,
        hole = new THREE.Path();
      hole.absellipse(
        Math.cos(a) * 0.062,
        Math.sin(a) * 0.062,
        0.01,
        0.004,
        0,
        Math.PI * 2,
        true,
        a,
      );
      rotorShape.holes.push(hole);
    }
    const rotor = mesh(
      new THREE.ExtrudeGeometry(rotorShape, {
        depth: 0.002,
        bevelEnabled: false,
        curveSegments: 8,
      }),
      steel,
      group,
    );
    rotor.rotation.y = Math.PI / 2;
    rotor.position.x = -0.075;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const bolt = mesh(
        new THREE.CylinderGeometry(0.003, 0.003, 0.006, 6),
        brass,
        group,
      );
      bolt.rotation.z = Math.PI / 2;
      bolt.position.set(-0.078, Math.cos(a) * 0.032, Math.sin(a) * 0.032);
    }
    const spokeGeo = new THREE.CylinderGeometry(0.0014, 0.0014, 1, 5);
    geometries.add(spokeGeo);
    const spokes = new THREE.InstancedMesh(spokeGeo, steel, 32);
    spokes.castShadow = true;
    spokes.receiveShadow = true;
    group.add(spokes);
    for (let i = 0; i < 32; i++) {
      const angle = (i * Math.PI) / 16,
        end = new THREE.Vector3(
          0,
          Math.cos(angle) * 0.285,
          Math.sin(angle) * 0.285,
        ),
        start = new THREE.Vector3(i % 2 ? 0.043 : -0.043, 0, 0);
      const delta = end.clone().sub(start);
      helper.position.copy(start).add(end).multiplyScalar(0.5);
      helper.quaternion.setFromUnitVectors(up, delta.clone().normalize());
      helper.scale.set(1, delta.length(), 1);
      helper.updateMatrix();
      spokes.setMatrixAt(i, helper.matrix);
    }
    const valve = mesh(
      new THREE.CylinderGeometry(0.003, 0.003, 0.028, 6),
      brass,
      group,
    );
    valve.position.y = 0.269;
    return group;
  }
  const rearWheel = wheel(leanRoot, vector(rear));
  const frontWheel = wheel(steering, new THREE.Vector3(0, -0.57, -0.16));
  const rearCaliper = ellipsoid(
    [-0.08, 0.41, 0.59],
    [0.018, 0.03, 0.026],
    paint,
  );
  rearCaliper.name = 'rear-disc-caliper';
  ellipsoid([-0.08, -0.5, -0.11], [0.018, 0.03, 0.026], paint, steering);
  curve(
    [
      [-0.05, 0.91, -0.38],
      [-0.035, 0.92, 0.1],
      [-0.05, 0.8, 0.25],
      [-0.08, 0.41, 0.59],
    ],
    0.0025,
    rubber,
  );
  // Real tooth counts, including each individual cassette sprocket.
  const crank = new THREE.Group();
  crank.position.copy(vector(bottom));
  leanRoot.add(crank);
  const ring = mesh(
    gearGeometry(38, pitchRadius('sprocket', 38), 0.005),
    brass,
    crank,
  );
  ring.rotation.y = Math.PI / 2;
  ring.position.x = 0.105;
  for (let i = 0; i < COGS.length; i++) {
    const cog = mesh(
      gearGeometry(COGS[i]!, pitchRadius('sprocket', COGS[i]!), 0.0028),
      steel,
      rearWheel,
    );
    cog.rotation.y = Math.PI / 2;
    cog.position.x = 0.095 + i * 0.006;
  }
  const pedalOffsets: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    tube(
      [side * 0.1, 0, 0],
      [side * 0.14, 0, side * 0.165],
      0.012,
      steel,
      crank,
    );
    const pedal = ellipsoid(
      [side * 0.16, 0, side * 0.165],
      [0.07, 0.018, 0.045],
      rubber,
      crank,
    );
    pedalOffsets.push(pedal.position.clone());
    for (const dz of [-0.025, 0.025])
      tube(
        [side * 0.12, 0.02, side * 0.165 + dz],
        [side * 0.2, 0.02, side * 0.165 + dz],
        0.003,
        brass,
        crank,
      );
  }
  const derailleur = new THREE.Group();
  derailleur.position.set(0.12, 0.23, 0.56);
  leanRoot.add(derailleur);
  tube([0, 0, 0], [0, -0.12, -0.08], 0.009, steel, derailleur);
  const jockey = mesh(gearGeometry(12, 0.024, 0.008), rubber, derailleur);
  jockey.rotation.y = Math.PI / 2;
  jockey.position.set(0, -0.12, -0.08);
  const chainGeo = new THREE.CapsuleGeometry(0.0017, 0.008, 3, 6);
  const rollerGeo = new THREE.CylinderGeometry(0.0031, 0.0031, 0.011, 8);
  geometries.add(chainGeo);
  geometries.add(rollerGeo);
  const chain = new THREE.InstancedMesh(chainGeo, steel, 256);
  const rollers = new THREE.InstancedMesh(rollerGeo, steel, 128);
  chain.name = 'chain-link-plates';
  rollers.name = 'chain-rollers';
  for (const instances of [chain, rollers]) {
    instances.castShadow = instances.receiveShadow = true;
    instances.frustumCulled = false;
    instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    leanRoot.add(instances);
  }
  let previousGear = -1,
    chainCount = 96,
    chainLength = 1,
    chainTravel = 0,
    lastCrank = 0;
  let chainPoints: THREE.Vector2[] = [],
    chainDistances: number[] = [];
  const chainAxis = new THREE.Vector3(),
    sampleA = new THREE.Vector3(),
    sampleB = new THREE.Vector3(),
    uvA = new THREE.Vector2(),
    uvB = new THREE.Vector2();
  function rebuildChain(gear: number) {
    const path = chainPath([
      { x: 0.03, y: 0.33, radius: pitchRadius('sprocket', 38) },
      { x: 0.54, y: 0.34, radius: pitchRadius('sprocket', COGS[gear]!) },
    ])!;
    const points: THREE.Vector2[] = [];
    for (let i = 0; i < 2; i++) {
      const arc = path.arcs[i]!,
        seg = path.segments[i]!;
      for (let k = 0; k < 64; k++) {
        const a = arc.start + (arc.sweep * k) / 64;
        points.push(
          new THREE.Vector2(
            arc.x + Math.cos(a) * arc.radius,
            arc.y + Math.sin(a) * arc.radius,
          ),
        );
      }
      for (let k = 0; k < 96; k++)
        points.push(
          new THREE.Vector2().lerpVectors(
            new THREE.Vector2(seg.from.x, seg.from.y),
            new THREE.Vector2(seg.to.x, seg.to.y),
            k / 96,
          ),
        );
    }
    chainPoints = points;
    chainDistances = [0];
    chainLength = 0;
    for (let i = 0; i < points.length; i++) {
      chainLength += points[i]!.distanceTo(points[(i + 1) % points.length]!);
      chainDistances.push(chainLength);
    }
    chainCount = Math.min(128, Math.round(chainLength / 0.0127));
    chain.count = chainCount * 2;
    rollers.count = chainCount;
    previousGear = gear;
  }
  function sampleChain(fraction: number, out: THREE.Vector2) {
    const distance = (((fraction % 1) + 1) % 1) * chainLength;
    let lo = 0,
      hi = chainPoints.length;
    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (chainDistances[mid]! <= distance) lo = mid;
      else hi = mid;
    }
    const span = chainDistances[lo + 1]! - chainDistances[lo]!;
    return out.lerpVectors(
      chainPoints[lo]!,
      chainPoints[(lo + 1) % chainPoints.length]!,
      span > 0 ? (distance - chainDistances[lo]!) / span : 0,
    );
  }
  const rider = new THREE.Group();
  leanRoot.add(rider);
  const torso = mesh(
    new THREE.CapsuleGeometry(0.145, 0.3, 5, 12),
    jacket,
    rider,
  );
  torso.position.set(0, 1.28, 0.06);
  torso.rotation.x = -0.35;
  torso.scale.x = 1.14;
  // Seam, collar and small pack are curved geometry rather than flat silhouettes.
  curve(
    [
      [0, 1.07, -0.07],
      [0, 1.25, -0.12],
      [0, 1.48, -0.05],
    ],
    0.004,
    brass,
    rider,
  );
  ellipsoid([0, 1.32, 0.2], [0.12, 0.21, 0.065], leather, rider);
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.56, -0.08);
  rider.add(headGroup);
  ellipsoid([0, 0, 0], [0.1, 0.12, 0.095], skin, headGroup);
  ellipsoid([0, -0.018, -0.098], [0.019, 0.028, 0.022], skin, headGroup);
  for (const side of [-1, 1]) {
    ellipsoid(
      [side * 0.096, -0.015, 0],
      [0.016, 0.028, 0.018],
      skin,
      headGroup,
    );
    curve(
      [
        [side * 0.085, 0.02, -0.045],
        [side * 0.06, -0.1, -0.025],
        [0, -0.113, -0.05],
      ],
      0.004,
      leather,
      headGroup,
    );
  }
  const helmet = mesh(
    new THREE.SphereGeometry(0.116, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
    paint,
    headGroup,
  );
  helmet.position.y = 0.035;
  for (const x of [-0.05, 0, 0.05])
    curve(
      [
        [x, 0.01, -0.104],
        [x, 0.12, -0.04],
        [x, 0.13, 0.03],
        [x, 0.02, 0.103],
      ],
      0.006,
      brass,
      headGroup,
    );
  ellipsoid([0, 0.01, -0.086], [0.086, 0.026, 0.025], rubber, headGroup);
  const eye = new THREE.Object3D();
  eye.position.set(0, 1.6, -0.17);
  leanRoot.add(eye);
  const limbGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
  geometries.add(limbGeometry);
  const limbs = Array.from({ length: 8 }, (_, i) =>
    mesh(limbGeometry, i < 4 ? pants : jacket, rider),
  );
  const shoes = [-1, 1].map((side) =>
    ellipsoid([side * 0.16, 0.3, 0], [0.052, 0.035, 0.1], leather, rider),
  );
  const hands = [-1, 1].map((side) =>
    ellipsoid([side * 0.25, 1.02, -0.38], [0.027, 0.026, 0.04], rubber, rider),
  );
  const putLimb = (
    m: THREE.Mesh,
    a: THREE.Vector3,
    b: THREE.Vector3,
    r: number,
  ) => {
    chainAxis.copy(b).sub(a);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.scale.set(r, chainAxis.length(), r);
    m.quaternion.setFromUnitVectors(up, chainAxis.normalize());
  };
  const hip = new THREE.Vector3(),
    knee = new THREE.Vector3(),
    foot = new THREE.Vector3(),
    shoulder = new THREE.Vector3(),
    elbow = new THREE.Vector3();
  function update(state: RideState, firstPerson: number) {
    root.position.set(state.x, state.y, state.z);
    root.rotation.y = -state.heading;
    leanRoot.rotation.set(state.pitch, 0, -state.lean, 'YXZ');
    steering.rotation.y = -state.steer;
    rearWheel.rotation.x = frontWheel.rotation.x = -state.wheelAngle;
    crank.rotation.x = -state.crankAngle;
    derailleur.position.x = 0.095 + state.gear * 0.006;
    if (previousGear !== state.gear) rebuildChain(state.gear);
    const crankDelta = Math.atan2(
      Math.sin(state.crankAngle - lastCrank),
      Math.cos(state.crankAngle - lastCrank),
    );
    if (!state.broken) chainTravel += crankDelta * pitchRadius('sprocket', 38);
    lastCrank = state.crankAngle;
    const chainX = (z: number) =>
      0.105 +
      (0.095 + state.gear * 0.006 - 0.105) *
        THREE.MathUtils.clamp((z - 0.03) / 0.51, 0, 1);
    for (let i = 0; i < chainCount; i++) {
      const fraction = i / chainCount + chainTravel / chainLength;
      sampleChain(fraction, uvA);
      sampleChain(fraction + 0.004 / chainLength, uvB);
      sampleA.set(chainX(uvA.x), uvA.y, uvA.x);
      sampleB.set(chainX(uvB.x), uvB.y, uvB.x);
      if (state.broken) {
        const drop = 0.08 + Math.sin((i / (chainCount - 1)) * Math.PI) * 0.23;
        sampleA.y -= drop;
        sampleB.y -= drop;
      }
      helper.position.copy(sampleA);
      helper.quaternion.setFromUnitVectors(
        up,
        chainAxis.copy(sampleB).sub(sampleA).normalize(),
      );
      helper.scale.set(1, 1, 1);
      for (let side = 0; side < 2; side++) {
        helper.position.x = sampleA.x + (side === 0 ? -0.004 : 0.004);
        helper.updateMatrix();
        chain.setMatrixAt(i * 2 + side, helper.matrix);
      }
      helper.position.copy(sampleA);
      helper.rotation.set(0, 0, Math.PI / 2);
      helper.updateMatrix();
      rollers.setMatrixAt(i, helper.matrix);
    }
    chain.instanceMatrix.needsUpdate = true;
    rollers.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      hip.set(side * 0.105, 1.02, 0.22);
      foot
        .copy(pedalOffsets[i]!)
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), -state.crankAngle)
        .add(vector(bottom));
      // Two equal bones: intersection of the hip/foot spheres, bent forward.
      const delta = foot.clone().sub(hip),
        distance = Math.min(0.86, delta.length()),
        middle = hip.clone().add(foot).multiplyScalar(0.5);
      const bend = new THREE.Vector3(0, delta.z, -delta.y).normalize();
      if (bend.z > 0) bend.negate();
      knee
        .copy(middle)
        .addScaledVector(
          bend,
          Math.sqrt(Math.max(0, 0.44 ** 2 - (distance / 2) ** 2)),
        );
      putLimb(limbs[i * 2]!, hip, knee, 0.047);
      putLimb(limbs[i * 2 + 1]!, knee, foot, 0.035);
      shoes[i]!.position.copy(foot);
      shoes[i]!.rotation.x = -state.pitch;
      const hand = hands[i]!;
      hand.position
        .set(side * 0.25, 1.01, -0.39)
        .sub(steering.position)
        .applyAxisAngle(up, steering.rotation.y)
        .add(steering.position);
      shoulder.set(side * 0.17, 1.43, -0.01);
      elbow.copy(shoulder).lerp(hand.position, 0.52);
      elbow.x += side * 0.06;
      elbow.y -= 0.05;
      putLimb(limbs[4 + i * 2]!, shoulder, elbow, 0.034);
      putLimb(limbs[5 + i * 2]!, elbow, hand.position, 0.028);
    }
    torso.visible = headGroup.visible = firstPerson < 0.65;
    root.updateMatrixWorld(true);
  }
  function dispose() {
    root.removeFromParent();
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    brushed.dispose();
    hide.dispose();
    weave.dispose();
  }
  return { root, eye, update, dispose };
}
