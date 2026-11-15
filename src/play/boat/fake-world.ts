import { PerspectiveCamera, Scene } from 'three';
import type { Hud, Input, World } from '../api';

/** Test fixture implements the actual shared API without creating a renderer. */
export function createFakeWorld(): World {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(62, 16 / 9, 0.1, 2000),
    heightAt: () => -20,
    oceanHeight: () => 0,
    windAt: (_x, _z, out) => out.set(-8, 0, 0),
    roadNearest: () => ({ dist: 0, progress: 0, x: 0, z: 0, heading: 0 }),
    roadPoint: () => ({ x: 0, z: 0, heading: 0 }),
    storm: 0,
    wet: 0,
    time: 0,
    burst: () => {},
    places: {
      bikeStart: { x: 0, z: 0, heading: 0 },
      harbour: { x: 0, z: 0 },
      boatStart: { x: 0, z: 0, heading: 0 },
      cove: { x: 500, z: -200 },
    },
  };
}

export function createFakeInput(
  keys = new Set<string>(),
  pressed = new Set<string>(),
): Input {
  return {
    steer: 0,
    throttle: 0,
    lookX: 0,
    lookY: 0,
    down: (key) => keys.has(key),
    pressed: (key) => pressed.has(key),
    pointer: { x: 0, y: 0, down: false, pressed: false, released: false },
  };
}

export function createFakeHud() {
  const values = new Map<string, number | string>();
  const hud: Hud = {
    set: (name, value) => {
      values.set(name, value);
    },
    objective: (value) => {
      values.set('objective', value);
    },
    prompt: (value) => {
      values.set('prompt', value);
    },
    toast: (value) => {
      values.set('toast', value);
    },
  };
  return { hud, values };
}
