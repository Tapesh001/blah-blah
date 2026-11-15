import { PerspectiveCamera, Scene, Vector3 } from 'three';
import type { Hud, Input, World } from '../api';

/** Flat, dry, six-hundred-metre road; no renderer or DOM needed in tests. */
export function fakeWorld(): World & { bursts: string[]; wind: Vector3 } {
  const bursts: string[] = [],
    wind = new Vector3();
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(62, 1, 0.3, 1000),
    heightAt: () => 2,
    oceanHeight: () => 0,
    windAt: (_x, _z, out) => out.copy(wind),
    roadNearest: (x, z) => ({
      x: 0,
      z,
      dist: Math.abs(x),
      progress: Math.max(0, Math.min(1, -z / 600)),
      heading: 0,
    }),
    roadPoint: (p) => ({ x: 0, z: -p * 600, heading: 0 }),
    storm: 0,
    wet: 0,
    time: 0,
    burst: (kind) => {
      bursts.push(kind);
    },
    places: {
      bikeStart: { x: 0, z: 0, heading: 0 },
      harbour: { x: 0, z: -600 },
      boatStart: { x: 0, z: -620, heading: 0 },
      cove: { x: 500, z: -800 },
    },
    bursts,
    wind,
  };
}
export function fakeHud(): Hud & {
  values: Map<string, number | string>;
  objectiveText: string;
  promptText: string;
  messages: string[];
} {
  return {
    values: new Map(),
    objectiveText: '',
    promptText: '',
    messages: [],
    objective(t) {
      this.objectiveText = t;
    },
    prompt(t) {
      this.promptText = t;
    },
    set(k, v) {
      this.values.set(k, v);
    },
    toast(t) {
      this.messages.push(t);
    },
  };
}
export function fakeInput(
  keys: string[] = [],
  pressed: string[] = [],
  steer = 0,
  throttle = 0,
): Input {
  return {
    steer,
    throttle,
    lookX: 0,
    lookY: 0,
    down: (c) => keys.includes(c),
    pressed: (c) => pressed.includes(c),
    pointer: { x: 0, y: 0, down: false, pressed: false, released: false },
  };
}
