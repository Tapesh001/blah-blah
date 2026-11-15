import { test } from 'vitest';
import assert from 'node:assert/strict';
import { BoatPhysics, Winch, sailForce, type BoatControls } from './physics';
import { createFakeWorld } from './fake-world';

const controls: BoatControls = {
  steer: 0,
  firstPerson: true,
  haul: false,
  low: false,
  ease: false,
};

test('aerodynamics luff head to wind, reward reaching trim and drive downwind', () => {
  assert.ok(sailForce(-8, 0, 0, 9.5).drive <= 0);
  const ideal = sailForce(0, -8, 0.75, 9.5);
  assert.ok(ideal.drive > sailForce(0, -8, 0, 9.5).drive * 1.6);
  assert.ok(ideal.drive > sailForce(0, -8, 1, 9.5).drive * 1.6);
  assert.ok(sailForce(8, 0, 1, 9.5).drive > 0);
  assert.equal(sailForce(-8, 0, 0, 9.5).luff, 1);
});

test('winch gears stall at their rated loads, reverse the handle, and lock outside cockpit', () => {
  const winch = new Winch();
  winch.update(1, 1000, { ...controls, haul: true });
  assert.equal(winch.sheet, 0.45);
  assert.equal(winch.stalled, true);
  winch.update(1, 1000, { ...controls, low: true });
  assert.ok(winch.sheet < 0.45);
  assert.ok(winch.handle < 0);
  assert.ok(winch.drum > 0);
  const sheet = winch.sheet;
  winch.update(1, 2501, { ...controls, low: true });
  assert.equal(winch.sheet, sheet);
  winch.update(1, 0, {
    ...controls,
    firstPerson: false,
    ease: true,
    haul: true,
  });
  assert.equal(winch.sheet, sheet);
  winch.update(1, 0, { ...controls, ease: true });
  assert.ok(winch.sheet > sheet);
});

test('boat grounds, reefs and follows all four ocean samples', () => {
  const world = createFakeWorld();
  const boat = new BoatPhysics(world.places.boatStart);
  world.heightAt = () => 0;
  boat.step(1 / 120, controls, world);
  assert.equal(boat.speed, 0);
  assert.equal(boat.grounded, true);
  assert.ok(boat.z > 0);
  boat.changeReef(1);
  boat.changeReef(1);
  boat.changeReef(1);
  assert.equal(boat.reef, 2);
  world.heightAt = () => -20;
  world.oceanHeight = (x, z) => 0.1 * x - 0.1 * z + 2;
  for (let i = 0; i < 300; i++) boat.step(1 / 120, controls, world);
  assert.ok(boat.pitch > 0.05);
  assert.ok(boat.waveRoll > 0.05);
  assert.ok(boat.y > 1);
});

test('ten-minute gust simulation is finite and deterministic', () => {
  const world = createFakeWorld();
  world.windAt = (_x, _z, out) =>
    out.set(-15 - 11 * Math.sin(world.time * 0.3), 0, 5);
  const a = new BoatPhysics(world.places.boatStart),
    b = new BoatPhysics(world.places.boatStart);
  for (let step = 0; step < 600 * 120; step++) {
    world.time = step / 120;
    controls.steer = Math.sin(world.time * 0.07);
    a.step(1 / 120, controls, world);
    b.step(1 / 120, controls, world);
  }
  controls.steer = 0;
  for (const key of ['x', 'z', 'heading', 'speed', 'slip', 'heel'] as const) {
    assert.ok(Number.isFinite(a[key]));
    assert.equal(a[key], b[key]);
  }
  assert.ok(Math.abs(a.heel) < Math.PI / 2);
});
