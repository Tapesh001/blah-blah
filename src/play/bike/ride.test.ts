import { describe, it, expect } from 'vitest';
import {
  createRideState,
  stepRide,
  repairRide,
  type RideWorld,
  type RideInput,
} from './ride';
import { createBikeMode } from './index';
import { fakeWorld, fakeHud, fakeInput } from './fake-world';
const world: RideWorld = {
  heightAt: () => 2,
  windAt: () => ({ x: 0, z: 0 }),
  roadAt: (x, z) => ({ x: 0, z, dist: Math.abs(x), heading: 0, progress: 0 }),
  wet: 0,
};
const neutral: RideInput = {
  pedal: 0,
  brake: 0,
  steer: 0,
  jump: false,
  shift: 0,
};
const start = () =>
  createRideState({ x: 0, z: 0, heading: 0, dist: 0, progress: 0 }, world);
describe('playable ride', () => {
  it('faces -Z and gains speed through rider power', () => {
    const s = start();
    for (let i = 0; i < 180; i++)
      stepRide(s, { ...neutral, pedal: 1 }, world, 1 / 60);
    expect(s.z).toBeLessThan(-2);
    expect(s.speed).toBeGreaterThan(2);
    expect(s.cadence).toBeGreaterThan(0);
  });
  it('headwind reduces and tailwind increases speed', () => {
    const speed = (z: number) => {
      const s = start();
      for (let i = 0; i < 6000; i++)
        stepRide(
          s,
          { ...neutral, pedal: 1 },
          { ...world, windAt: () => ({ x: 0, z }) },
          1 / 60,
        );
      return s.speed;
    };
    expect(speed(5)).toBeLessThan(speed(0) - 1);
    expect(speed(-5)).toBeGreaterThan(speed(0) + 1);
  });
  it('brakes to a halt without reversing', () => {
    const s = start();
    s.speed = 10;
    for (let i = 0; i < 600; i++)
      stepRide(s, { ...neutral, brake: 1 }, world, 1 / 60);
    expect(s.speed).toBe(0);
  });
  it('downhill gravity accelerates a coast', () => {
    const s = start();
    for (let i = 0; i < 300; i++)
      stepRide(
        s,
        neutral,
        { ...world, heightAt: (_x, z) => 2 + z * 0.03 },
        1 / 60,
      );
    expect(s.speed).toBeGreaterThan(1);
  });
  it('shifts once and bounds gears', () => {
    const s = start();
    stepRide(s, { ...neutral, shift: 1 }, world, 1 / 60);
    expect(s.gear).toBe(3);
    stepRide(s, { ...neutral, shift: 1 }, world, 1 / 60);
    expect(s.gear).toBe(3);
    for (let i = 0; i < 600; i++)
      stepRide(s, { ...neutral, shift: -1 }, world, 1 / 60);
    expect(s.gear).toBe(0);
  });
  it('arms after 45%, breaks under hard effort, and does not repeat after repair', () => {
    const s = start(),
      ridge = {
        ...world,
        roadAt: (x: number, z: number) => ({
          ...world.roadAt(x, z),
          progress: 0.5,
        }),
      };
    stepRide(s, neutral, ridge, 1 / 60);
    expect(s.broken).toBe(false);
    for (let i = 0; i < 30; i++)
      stepRide(s, { ...neutral, pedal: 1 }, ridge, 1 / 60);
    expect(s.broken).toBe(true);
    expect(s.chainWear).toBe(1);
    repairRide(s);
    for (let i = 0; i < 90; i++)
      stepRide(s, { ...neutral, pedal: 1 }, ridge, 1 / 60);
    expect(s.broken).toBe(false);
  });
  it('broken chain cannot drive but brakes remain available', () => {
    const s = start();
    s.broken = true;
    for (let i = 0; i < 120; i++)
      stepRide(s, { ...neutral, pedal: 1 }, world, 1 / 60);
    expect(s.speed).toBe(0);
    s.speed = 5;
    for (let i = 0; i < 120; i++)
      stepRide(s, { ...neutral, brake: 1 }, world, 1 / 60);
    expect(s.speed).toBe(0);
  });
  it('hop is edge-triggered and lands', () => {
    const s = start();
    let hops = 0;
    for (let i = 0; i < 180; i++)
      hops += stepRide(s, { ...neutral, jump: true }, world, 1 / 60).filter(
        (e) => e === 'hop',
      ).length;
    expect(hops).toBe(1);
    expect(s.grounded).toBe(true);
    expect(s.y).toBe(2);
  });
  it('fast wet off-road corner crashes and returns to a safe road point', () => {
    const s = start();
    s.speed = 12;
    s.x = 6;
    const loose = { ...world, wet: 1 };
    let crashed = false;
    for (let i = 0; i < 120; i++)
      crashed ||= stepRide(s, { ...neutral, steer: 1 }, loose, 1 / 60).includes(
        'crash',
      );
    expect(crashed).toBe(true);
    for (let i = 0; i < 120; i++) stepRide(s, neutral, world, 1 / 60);
    expect(Math.abs(s.x)).toBeLessThan(4);
  });
  it('water respawns without clearing chain damage', () => {
    const s = start();
    s.x = 20;
    s.broken = true;
    const wet = { ...world, heightAt: (x: number) => (x > 10 ? -2 : 2) };
    const events = stepRide(s, neutral, wet, 1 / 60);
    expect(events).toContain('respawn');
    expect(s.x).toBe(0);
    expect(s.broken).toBe(true);
    expect(s.y).toBeGreaterThan(0.3);
  });
  it('mode exposes repair handshake, builds detailed meshes, and cleans up', () => {
    const w = fakeWorld(),
      hud = fakeHud(),
      mode = createBikeMode();
    w.roadNearest = (x, z) => ({
      x: 0,
      z,
      heading: 0,
      progress: 0.6,
      dist: Math.abs(x),
    });
    mode.enter(w, hud);
    expect(hud.objectiveText).toBe('Ride to the harbour');
    let meshes = 0;
    w.scene.traverse((o) => {
      if ('isMesh' in o) meshes++;
    });
    expect(meshes).toBeGreaterThan(60);
    for (let i = 0; i < 30; i++)
      mode.update(1 / 60, fakeInput([], [], 0, 1), w, hud);
    expect(hud.promptText).toContain('Chain snapped');
    mode.update(1 / 60, fakeInput([], ['KeyE']), w, hud);
    expect(mode.needsBench).toBe(true);
    mode.repaired();
    expect(mode.needsBench).toBe(false);
    mode.update(1 / 60, fakeInput(), w, hud);
    expect(hud.values.get('chain')).toBe(0);
    mode.exit(w);
    expect(w.scene.children.length).toBe(0);
    expect(w.camera.near).toBe(0.3);
  });
  it('finishes inside twelve metres of harbour', () => {
    const w = fakeWorld(),
      hud = fakeHud(),
      mode = createBikeMode();
    w.places.harbour = { x: 0, z: -8 };
    mode.enter(w, hud);
    mode.update(1 / 60, fakeInput(), w, hud);
    expect(mode.done()).toBe(true);
    mode.exit(w);
  });
  it('first-person camera toggles smoothly and all values remain finite', () => {
    const w = fakeWorld(),
      hud = fakeHud(),
      mode = createBikeMode();
    mode.enter(w, hud);
    const before = w.camera.position.clone();
    mode.update(1 / 60, fakeInput([], ['KeyV']), w, hud);
    expect(w.camera.position.distanceTo(before)).toBeLessThan(1);
    for (let i = 0; i < 120; i++)
      mode.update(1 / 60, fakeInput([], [], 0, 0.4), w, hud);
    expect(w.camera.position.toArray().every(Number.isFinite)).toBe(true);
    expect(w.camera.fov).toBeGreaterThan(62);
    mode.exit(w);
  });
});
