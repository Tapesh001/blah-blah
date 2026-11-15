import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createBoatMode } from './index';
import { createFakeHud, createFakeInput, createFakeWorld } from './fake-world';

test('public GameMode mounts, publishes HUD, reaches the cove and cleans up on repeat entry', () => {
  const mode = createBoatMode(),
    world = createFakeWorld();
  const { hud, values } = createFakeHud();
  const input = createFakeInput();
  mode.enter(world, hud);
  assert.equal(world.scene.children.length, 1);
  assert.equal(values.get('objective'), 'Sail to the far island');
  for (let frame = 0; frame < 30; frame++)
    mode.update(1 / 60, input, world, hud);
  for (const name of ['speed', 'trim', 'load', 'heel', 'sail'])
    assert.ok(values.has(name));
  assert.equal(mode.done(), false);
  world.places.cove = { x: 0, z: 0 };
  mode.update(1 / 60, input, world, hud);
  assert.equal(mode.done(), true);
  mode.enter(world, hud);
  assert.equal(world.scene.children.length, 1);
  mode.exit(world);
  mode.exit(world);
  assert.equal(world.scene.children.length, 0);
  assert.equal(world.camera.fov, 62);
});

test('V blends camera without a cut and W/S step through the three sail sizes', () => {
  const world = createFakeWorld(),
    mode = createBoatMode();
  const { hud, values } = createFakeHud();
  const pressed = new Set<string>();
  const input = createFakeInput(new Set(), pressed);
  mode.enter(world, hud);
  for (let frame = 0; frame < 60; frame++)
    mode.update(1 / 60, input, world, hud);
  const start = world.camera.position.clone();
  const rotation = world.camera.quaternion.clone();
  pressed.add('KeyV');
  pressed.add('KeyS');
  mode.update(1 / 60, input, world, hud);
  pressed.clear();
  assert.equal(values.get('sail'), '70%');
  assert.ok(start.distanceTo(world.camera.position) < 0.3);
  assert.ok(rotation.angleTo(world.camera.quaternion) < 0.1);
  for (let frame = 0; frame < 120; frame++)
    mode.update(1 / 60, input, world, hud);
  assert.ok(world.camera.fov > 77);
  pressed.add('KeyS');
  mode.update(1 / 60, input, world, hud);
  pressed.clear();
  assert.equal(values.get('sail'), '45%');
  pressed.add('KeyW');
  mode.update(1 / 60, input, world, hud);
  pressed.clear();
  assert.equal(values.get('sail'), '70%');
  mode.exit(world);
});
