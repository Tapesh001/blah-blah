import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, ROADS } from './terrain';

/** Shared instanced-tree geometry: overlapping boughs break up the silhouette. */
export function createCoastalPine(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const paint = (geometry: THREE.BufferGeometry, color: number) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    const p = g.getAttribute('position');
    const colors = new Float32Array(p.count * 3);
    const base = new THREE.Color(color);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      c.copy(base).multiplyScalar(0.8 + Math.max(0, p.getY(i)) * 0.045);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(g);
  };
  paint(
    new THREE.CylinderGeometry(0.06, 0.23, 7.6, 9).translate(0, 3.8, 0),
    0x594633,
  );
  for (let tier = 0; tier < 6; tier++) {
    const height = 2.1 + tier * 0.9;
    const spread = 1.7 - tier * 0.23;
    for (let branch = 0; branch < 6; branch++) {
      const angle = (branch * Math.PI) / 3 + tier * 2.4;
      const direction = new THREE.Vector3(
        Math.cos(angle),
        0.22,
        Math.sin(angle),
      ).normalize();
      const length = spread * 1.25;
      const rotation = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction,
      );
      paint(
        new THREE.CylinderGeometry(0.015, 0.045, length, 5)
          .applyQuaternion(rotation)
          .translate(
            (direction.x * length) / 2,
            height + (direction.y * length) / 2,
            (direction.z * length) / 2,
          ),
        0x594633,
      );
      // Flattened irregular needle masses, distinct from a solid stacked cone.
      const tuft = new THREE.IcosahedronGeometry(1, 1);
      const p = tuft.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const ripple = 1 + 0.13 * Math.sin(p.getX(i) * 17 + p.getZ(i) * 23);
        p.setXYZ(i, p.getX(i) * ripple, p.getY(i) * ripple, p.getZ(i) * ripple);
      }
      tuft.scale(spread * 0.72, 0.45 + spread * 0.16, spread * 0.42);
      tuft.rotateZ(0.22);
      tuft.rotateY(-angle);
      tuft.translate(
        Math.cos(angle) * spread * 0.62,
        height + 0.3,
        Math.sin(angle) * spread * 0.62,
      );
      tuft.computeVertexNormals();
      paint(tuft, branch % 2 ? 0x34533d : 0x294b36);
    }
  }
  paint(new THREE.ConeGeometry(0.55, 1.7, 9).translate(0, 7.25, 0), 0x456247);
  const result = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return result;
}

/** Paint is real terrain-conforming geometry, rather than coarse vertex colors. */
export function createRoadDetails(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Coastal road markings';
  const positions: number[] = [];
  for (const road of ROADS) {
    let distance = 0;
    for (let i = 1; i < road.length; i++) {
      const a = road[i - 1]!;
      const b = road[i]!;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.max(1, Math.ceil(length / 0.6));
      for (let j = 0; j < steps; j++) {
        const start = j / steps;
        const end = (j + 1) / steps;
        const along = distance + (start + end) * 0.5 * length;
        for (const offset of [-2.85, 0, 2.85]) {
          if (offset === 0 && along % 12 > 4.5) continue;
          const width = offset === 0 ? 0.12 : 0.09;
          const corners: number[][] = [];
          for (const t of [start, end]) {
            const x = THREE.MathUtils.lerp(a.x, b.x, t);
            const z = THREE.MathUtils.lerp(a.z, b.z, t);
            if (heightAt(x, z) < 2.5) break;
            const nx = -(b.z - a.z) / Math.max(length, 0.001);
            const nz = (b.x - a.x) / Math.max(length, 0.001);
            for (const side of [-1, 1]) {
              const px = x + nx * (offset + width * side);
              const pz = z + nz * (offset + width * side);
              corners.push([px, heightAt(px, pz) + 0.045, pz]);
            }
          }
          if (corners.length === 4) {
            for (const k of [0, 2, 1, 1, 2, 3]) positions.push(...corners[k]!);
          }
        }
      }
      distance += length;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  const paint = new THREE.MeshStandardMaterial({
    color: 0xc9c5a8,
    roughness: 0.89,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const markings = new THREE.Mesh(geometry, paint);
  markings.receiveShadow = true;
  group.add(markings);
  return group;
}
