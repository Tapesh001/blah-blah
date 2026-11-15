import * as THREE from 'three';
import { BOOM_LENGTH, BOOM_Y, MAST_Z, SailCloth, SheetRope } from './fabric';
import { REEFS, type BoatPhysics } from './physics';

const up = new THREE.Vector3(0, 1, 0);

export function createBoatModel() {
  const root = new THREE.Group();
  root.name = 'sailing-boat';
  root.rotation.order = 'YXZ';
  const wood = new THREE.MeshStandardMaterial({
    color: 0x784626,
    roughness: 0.58,
  });
  const lightWood = new THREE.MeshStandardMaterial({
    color: 0xc79351,
    roughness: 0.5,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x182e32,
    roughness: 0.57,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: 0xc9a14c,
    metalness: 0.85,
    roughness: 0.27,
  });
  const iron = new THREE.MeshStandardMaterial({
    color: 0x34444a,
    metalness: 0.8,
    roughness: 0.37,
  });
  const ropeMaterial = new THREE.MeshStandardMaterial({
    color: 0xd0ba8a,
    roughness: 0.94,
  });
  const sailMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf1dfb5,
    side: THREE.DoubleSide,
    roughness: 0.88,
    sheen: 0.45,
    sheenColor: 0xffedcc,
  });
  const red = new THREE.MeshStandardMaterial({
    color: 0xaf4934,
    side: THREE.DoubleSide,
    roughness: 0.8,
  });
  const materials = [
    wood,
    lightWood,
    dark,
    brass,
    iron,
    ropeMaterial,
    sailMaterial,
    red,
  ];

  function mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D = root,
  ) {
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function spar(
    a: THREE.Vector3,
    b: THREE.Vector3,
    radius: number,
    material: THREE.Material,
    parent: THREE.Object3D = root,
  ) {
    const direction = b.clone().sub(a);
    const object = mesh(
      new THREE.CylinderGeometry(radius * 0.85, radius, direction.length(), 12),
      material,
      parent,
    );
    object.position.copy(a).add(b).multiplyScalar(0.5);
    object.quaternion.setFromUnitVectors(up, direction.normalize());
    return object;
  }
  function curve(
    points: THREE.Vector3[],
    radius: number,
    material: THREE.Material,
    parent: THREE.Object3D = root,
  ) {
    return mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        points.length * 3,
        radius,
        6,
        false,
      ),
      material,
      parent,
    );
  }
  function board(
    width: number,
    depth: number,
    thickness: number,
    material: THREE.Material,
  ) {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, -depth / 2);
    shape.lineTo(width / 2, -depth / 2);
    shape.lineTo(width / 2, depth / 2);
    shape.lineTo(-width / 2, depth / 2);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.025,
      bevelThickness: 0.018,
    });
    geometry.rotateX(-Math.PI / 2);
    return mesh(geometry, material);
  }

  const stations = 24,
    ribs = 20;
  const positions: number[] = [],
    indices: number[] = [];
  function hullPoint(station: number, angle: number, inner = false) {
    const u = station / stations;
    const width = Math.max(
      0.035,
      1.08 * Math.sin(Math.PI * (u * 0.82 + 0.015)) ** 0.7,
    );
    const rise = 0.18 * Math.cos(u * Math.PI * 2);
    return new THREE.Vector3(
      width * Math.sin(angle) * (inner ? 0.95 : 1),
      -0.4 + 1.15 * (1 - Math.cos(angle)) + rise + (inner ? 0.055 : 0),
      -2.75 + u * 5.5,
    );
  }
  for (let station = 0; station <= stations; station++) {
    for (let rib = 0; rib <= ribs; rib++) {
      positions.push(
        ...hullPoint(station, -Math.PI / 2 + (rib / ribs) * Math.PI).toArray(),
      );
      if (station < stations && rib < ribs) {
        const i = station * (ribs + 1) + rib;
        indices.push(i, i + 1, i + ribs + 1, i + 1, i + ribs + 2, i + ribs + 1);
      }
    }
  }
  const hullGeometry = new THREE.BufferGeometry();
  hullGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  hullGeometry.setIndex(indices);
  hullGeometry.computeVertexNormals();
  wood.side = THREE.DoubleSide;
  mesh(hullGeometry, wood);
  // Clinker laps follow the loft, and brass fasteners follow the frames.
  for (const side of [-1, 1]) {
    for (let plank = 1; plank <= 6; plank++) {
      const points = Array.from({ length: stations + 1 }, (_, i) =>
        hullPoint(i, (((side * plank) / 6) * Math.PI) / 2),
      );
      curve(
        points,
        plank === 6 ? 0.035 : 0.012,
        plank === 6 ? lightWood : dark,
      );
    }
    for (let station = 3; station < stations; station += 3) {
      for (let plank = 2; plank <= 6; plank++) {
        const nail = mesh(new THREE.SphereGeometry(0.013, 6, 4), brass);
        nail.position.copy(
          hullPoint(station, (((side * plank) / 6) * Math.PI) / 2),
        );
      }
    }
  }
  for (let station = 3; station < stations; station += 3) {
    curve(
      Array.from({ length: 13 }, (_, i) =>
        hullPoint(station, -Math.PI / 2 + (i / 12) * Math.PI, true),
      ),
      0.028,
      lightWood,
    );
  }
  for (let i = -3; i <= 3; i++) {
    const plank = board(
      0.18,
      3.5 - Math.abs(i) * 0.22,
      0.04,
      i % 2 ? wood : lightWood,
    );
    plank.position.set(i * 0.205, -0.02, 0.35);
  }
  for (const z of [-1.25, 0.15, 1.9]) {
    const seat = board(z < -1 ? 1.45 : 1.8, 0.32, 0.08, lightWood);
    seat.position.set(0, 0.63, z);
  }
  // Lofted transom, centreboard case, mooring cleats and braced coaming.
  const transom = new THREE.Shape();
  transom.moveTo(-0.74, 0.84);
  transom.quadraticCurveTo(-0.6, -0.22, 0, -0.22);
  transom.quadraticCurveTo(0.6, -0.22, 0.74, 0.84);
  transom.closePath();
  const stern = mesh(
    new THREE.ExtrudeGeometry(transom, {
      depth: 0.08,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.025,
      bevelThickness: 0.025,
    }),
    wood,
  );
  stern.position.z = 2.68;
  const caseTop = board(0.2, 1.4, 0.42, dark);
  caseTop.position.set(0, 0.08, -0.2);
  spar(
    new THREE.Vector3(0, -0.2, MAST_Z),
    new THREE.Vector3(0, 6.75, MAST_Z),
    0.075,
    lightWood,
  );
  for (const x of [-0.86, 0.86]) {
    spar(
      new THREE.Vector3(0, 5.8, MAST_Z),
      new THREE.Vector3(x, 0.8, 0),
      0.012,
      iron,
    );
    spar(
      new THREE.Vector3(x, 0.85, 1.4),
      new THREE.Vector3(x, 0.85, 1.7),
      0.032,
      brass,
    );
  }
  const boom = new THREE.Group();
  root.add(boom);
  boom.position.set(0, BOOM_Y, MAST_Z);
  spar(
    new THREE.Vector3(0, 0, -0.12),
    new THREE.Vector3(0, 0, BOOM_LENGTH + 0.15),
    0.055,
    lightWood,
    boom,
  );
  const boomBlock = mesh(
    new THREE.TorusGeometry(0.09, 0.027, 8, 18),
    brass,
    boom,
  );
  boomBlock.position.set(0, -0.11, BOOM_LENGTH);
  const deckBlock = mesh(new THREE.TorusGeometry(0.095, 0.025, 8, 18), brass);
  deckBlock.position.set(0.68, 0.72, 1.75);
  const tiller = new THREE.Group();
  root.add(tiller);
  tiller.position.set(0, 0.88, 2.6);
  curve(
    [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.03, 0.08, -0.5),
      new THREE.Vector3(0, 0.13, -1.25),
    ],
    0.045,
    lightWood,
    tiller,
  );
  const blade = new THREE.Shape();
  blade.moveTo(-0.13, 0);
  blade.lineTo(0.16, 0);
  blade.quadraticCurveTo(0.35, -0.8, 0, -1.35);
  blade.quadraticCurveTo(-0.2, -1.1, -0.13, 0);
  const rudder = mesh(
    new THREE.ExtrudeGeometry(blade, {
      depth: 0.045,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 2,
    }),
    dark,
    tiller,
  );
  rudder.rotation.y = Math.PI / 2;
  rudder.position.y = -0.5;

  const winch = new THREE.Group();
  root.add(winch);
  winch.position.set(0.89, 0.93, 1.15);
  const base = mesh(
    new THREE.CylinderGeometry(0.17, 0.19, 0.11, 32),
    brass,
    winch,
  );
  base.position.y = -0.04;
  const drum = new THREE.Group();
  winch.add(drum);
  mesh(
    new THREE.CylinderGeometry(0.105, 0.14, 0.22, 32),
    iron,
    drum,
  ).position.y = 0.1;
  for (let i = 0; i < 3; i++) {
    const wrap = mesh(
      new THREE.TorusGeometry(0.121, 0.012, 6, 32),
      ropeMaterial,
      drum,
    );
    wrap.rotation.x = Math.PI / 2;
    wrap.position.y = 0.035 + i * 0.032;
  }
  const handle = new THREE.Group();
  winch.add(handle);
  handle.position.y = 0.26;
  spar(
    new THREE.Vector3(),
    new THREE.Vector3(0.25, 0, 0),
    0.018,
    brass,
    handle,
  );
  const grip = mesh(new THREE.CapsuleGeometry(0.027, 0.1, 5, 12), dark, handle);
  grip.position.set(0.25, 0.06, 0);
  const gears: THREE.Group[] = [];
  for (let i = 0; i < 2; i++) {
    const gear = new THREE.Group();
    winch.add(gear);
    gears.push(gear);
    gear.position.set(i === 0 ? -0.18 : -0.32, -0.015, 0);
    const radius = i === 0 ? 0.09 : 0.045;
    mesh(new THREE.CylinderGeometry(radius, radius, 0.035, 24), brass, gear);
    for (let tooth = 0; tooth < (i === 0 ? 24 : 12); tooth++) {
      const angle = (tooth / (i === 0 ? 24 : 12)) * Math.PI * 2;
      const toothMesh = mesh(
        new THREE.CylinderGeometry(0.009, 0.009, 0.04, 5),
        iron,
        gear,
      );
      toothMesh.position.set(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius,
      );
    }
  }
  const pawl = mesh(new THREE.CapsuleGeometry(0.012, 0.09, 3, 6), iron, winch);
  pawl.rotation.z = Math.PI / 2;
  pawl.position.set(-0.16, 0.04, 0.09);

  const glow = new THREE.MeshStandardMaterial({
    color: 0xffd997,
    emissive: 0xffa333,
    emissiveIntensity: 4,
    roughness: 0.2,
  });
  materials.push(glow);
  mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.23, 12), glow).position.set(
    0,
    6.65,
    MAST_Z,
  );
  for (const y of [6.48, 6.82])
    mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.045, 12), brass).position.set(
      0,
      y,
      MAST_Z,
    );
  const lanternLight = new THREE.PointLight(0xffba61, 2.5, 12, 2);
  lanternLight.position.set(0, 6.6, MAST_Z);
  root.add(lanternLight);

  const cloth = new SailCloth(),
    rope = new SheetRope();
  const sailMesh = mesh(cloth.geometry, sailMaterial);
  sailMesh.frustumCulled = false;
  const sheetMesh = mesh(rope.geometry, ropeMaterial);
  sheetMesh.frustumCulled = false;
  const ribbons: THREE.Mesh[] = [];
  for (let ribbon = 0; ribbon < 3; ribbon++) {
    const geometry = new THREE.PlaneGeometry(0.55, 0.045, 10, 1);
    const telltale = mesh(geometry, red);
    telltale.frustumCulled = false;
    ribbons.push(telltale);
  }
  const anchor = new THREE.Vector3();
  let time = 0;

  return {
    root,
    cloth,
    rope,
    update(dt: number, state: BoatPhysics) {
      time += dt;
      root.position.set(state.x, state.y, state.z);
      root.rotation.set(
        state.pitch,
        -state.heading,
        state.waveRoll - state.heel,
        'YXZ',
      );
      boom.rotation.y = state.force.boom;
      tiller.rotation.y = -state.rudder * 0.5;
      handle.rotation.y = -state.winch.handle;
      drum.rotation.y = -state.winch.drum;
      gears[0]!.rotation.y = state.winch.drum;
      gears[1]!.rotation.y = -state.winch.drum * 2;
      pawl.rotation.x = Math.sin(state.winch.drum * 24) * 0.13;
      cloth.update(
        dt,
        state.force.boom,
        REEFS[state.reef]!,
        state.apparentRight,
        state.apparentForward,
        state.force.luff,
      );
      rope.update(
        dt,
        state.force.boom,
        state.winch.sheet,
        state.force.load,
        state.apparentRight,
      );
      for (let ribbon = 0; ribbon < ribbons.length; ribbon++) {
        cloth.point(4 + ribbon * 4, 3, anchor);
        const attribute = ribbons[ribbon]!.geometry.attributes
          .position as THREE.BufferAttribute;
        const windLength =
          Math.hypot(state.apparentRight, state.apparentForward) || 1;
        for (let vertex = 0; vertex < attribute.count; vertex++) {
          const u = (vertex % 11) / 10;
          const flutter =
            (1 - state.trim) * Math.sin(time * 25 - u * 8 + ribbon) * 0.11 * u;
          attribute.setXYZ(
            vertex,
            anchor.x + (state.apparentRight / windLength) * u * 0.55 + flutter,
            anchor.y +
              (vertex < 11 ? 0.022 : -0.022) -
              (1 - state.trim) * u * u * 0.18,
            anchor.z - (state.apparentForward / windLength) * u * 0.55 + 0.03,
          );
        }
        attribute.needsUpdate = true;
        ribbons[ribbon]!.geometry.computeVertexNormals();
      }
    },
    dispose() {
      root.removeFromParent();
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      for (const material of materials) material.dispose();
      root.clear();
    },
  };
}
