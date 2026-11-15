import { test } from 'vitest';
import assert from 'node:assert/strict';
import { SailCloth, SheetRope, MAST_Z } from './fabric';
import { createBoatModel } from './model';

test('cloth and rope stay finite through wind, boom and reef changes', () => {
  const cloth = new SailCloth(),
    rope = new SheetRope();
  for (let frame = 0; frame < 3600; frame++) {
    const time = frame / 60;
    const boom = Math.sin(time * 0.2) * 1.2;
    cloth.update(
      1 / 60,
      boom,
      frame < 1800 ? 1 : 0.45,
      Math.sin(time) * 26,
      12,
      Math.sin(time * 0.3) > 0 ? 1 : 0,
    );
    rope.update(1 / 60, boom, 0.5, 1500 + Math.sin(time) * 1500, 26);
    if (frame % 60 === 0) {
      assert.ok(cloth.net.position.every(Number.isFinite));
      assert.ok(rope.net.position.every(Number.isFinite));
      for (let i = 0; i < cloth.net.pinned.length; i++) {
        const radius = Math.hypot(
          cloth.net.position[i * 3]!,
          cloth.net.position[i * 3 + 2]! - MAST_Z,
        );
        assert.ok(radius >= 0.084, 'cloth remains outside mast');
      }
      assert.ok(Math.max(...cloth.net.position) < 8);
      assert.ok(Math.min(...cloth.net.position) > -4);
    }
  }
  cloth.geometry.dispose();
  rope.geometry.dispose();
}, 60000);

test('procedural model has shadowed meshes, moving mechanisms and disposable geometry', () => {
  const model = createBoatModel();
  let meshes = 0,
    disposed = 0;
  model.root.traverse((object) => {
    if ('geometry' in object) {
      meshes++;
      assert.equal(object.castShadow, true);
    }
  });
  model.cloth.geometry.addEventListener('dispose', () => disposed++);
  assert.ok(meshes > 100);
  model.dispose();
  assert.equal(disposed, 1);
  assert.equal(model.root.children.length, 0);
});
