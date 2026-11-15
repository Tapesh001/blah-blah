import { describe, it, expect } from 'vitest';
import {
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Texture,
  Vector3,
} from 'three';
import { buildBikeModel } from './model';
import { createRideState } from './ride';
import { createBikeMode } from './index';
import { fakeWorld, fakeHud, fakeInput } from './fake-world';
import { createBench } from '../bench';
import { buildBenchModel } from '../bench/model';
import { benchDefinition } from '../bench/rules';

describe('detailed procedural graphics', () => {
  it('bike has finite geometry, tread instances, moving rollers and disposed PBR maps', () => {
    const model = buildBikeModel(),
      world = fakeWorld();
    const state = createRideState(
      { x: 0, z: 0, heading: 0, dist: 0, progress: 0 },
      {
        heightAt: () => 2,
        windAt: () => ({ x: 0, z: 0 }),
        roadAt: (x, z) => world.roadNearest(x, z),
        wet: 0,
      },
    );
    const textures = new Set<Texture>();
    let meshCount = 0,
      vertices = 0;
    model.root.traverse((o) => {
      if (o instanceof Mesh) {
        meshCount++;
        const positions = o.geometry.getAttribute('position');
        vertices += positions.count;
        expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
        expect(o.castShadow).toBe(true);
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of materials)
          if (m instanceof MeshStandardMaterial)
            for (const texture of [m.map, m.normalMap, m.roughnessMap])
              if (texture) textures.add(texture);
      }
    });
    expect(meshCount).toBeGreaterThan(100);
    expect(vertices).toBeGreaterThan(20000);
    expect(textures.size).toBe(9);
    model.update(state, 0);
    const rollers = model.root.getObjectByName(
        'chain-rollers',
      ) as InstancedMesh,
      plates = model.root.getObjectByName('chain-link-plates') as InstancedMesh;
    expect(rollers.count).toBeGreaterThan(90);
    expect(plates.count).toBe(rollers.count * 2);
    const before = new Matrix4(),
      after = new Matrix4();
    rollers.getMatrixAt(0, before);
    state.crankAngle = 0.8;
    state.gear = 7;
    model.update(state, 0);
    rollers.getMatrixAt(0, after);
    expect(after.equals(before)).toBe(false);
    expect(after.elements.every(Number.isFinite)).toBe(true);
    state.lean = 0.3;
    model.update(state, 0);
    expect(
      new Vector3(0, 1, 0).applyQuaternion(model.root.children[0]!.quaternion)
        .x,
    ).toBeGreaterThan(0);
    state.broken = true;
    model.update(state, 1);
    rollers.getMatrixAt(0, after);
    expect(after.elements.every(Number.isFinite)).toBe(true);
    let disposed = 0;
    for (const t of textures) t.addEventListener('dispose', () => disposed++);
    model.dispose();
    expect(disposed).toBe(textures.size);
  });
  it.each(['bike', 'engine'] as const)(
    '%s bench has physical surfaces and owns all lights/resources',
    (kind) => {
      const model = buildBenchModel(benchDefinition(kind));
      let meshes = 0,
        maps = 0;
      const textures = new Set<Texture>();
      model.root.traverse((o) => {
        if (o instanceof Mesh) {
          meshes++;
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            if (m instanceof MeshStandardMaterial) {
              if (m.normalMap) maps++;
              for (const t of [m.map, m.normalMap, m.roughnessMap])
                if (t) textures.add(t);
            }
        }
      });
      expect(meshes).toBeGreaterThan(80);
      expect(maps).toBeGreaterThan(40);
      let disposed = 0;
      for (const t of textures) t.addEventListener('dispose', () => disposed++);
      model.dispose();
      expect(disposed).toBe(textures.size);
    },
  );
  it('real bike-to-bench lifecycle repairs, resumes drive and restores the ride objective', () => {
    const world = fakeWorld(),
      hud = fakeHud(),
      bike = createBikeMode();
    world.roadNearest = (x, z) => ({
      x: 0,
      z,
      heading: 0,
      dist: Math.abs(x),
      progress: 0.6,
    });
    bike.enter(world, hud);
    for (let i = 0; i < 30; i++)
      bike.update(1 / 60, fakeInput([], [], 0, 1), world, hud);
    bike.update(1 / 60, fakeInput([], ['KeyE']), world, hud);
    expect(bike.needsBench).toBe(true);
    bike.needsBench = false;
    const bench = createBench('bike');
    bench.enter(world, hud);
    bench.update(1 / 60, fakeInput([], ['Digit3', 'Enter']), world, hud);
    for (let i = 0; i < 65; i++)
      bench.update(1 / 60, fakeInput([], [], 1), world, hud);
    for (let i = 0; i < 65; i++)
      bench.update(1 / 60, fakeInput(['Space']), world, hud);
    expect(bench.done()).toBe(true);
    bench.exit(world);
    bike.repaired();
    for (let i = 0; i < 90; i++)
      bike.update(1 / 60, fakeInput([], [], 0, 1), world, hud);
    expect(hud.objectiveText).toBe('Ride to the harbour');
    expect(hud.values.get('speed')).toBeGreaterThan(1);
    expect(Number(hud.values.get('chain'))).toBeLessThan(0.1);
    bike.exit(world);
    expect(world.scene.children).toHaveLength(0);
  });
});
