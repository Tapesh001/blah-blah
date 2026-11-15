/**
 * Shared API for the playable game (src/play). Written by Claude. DO NOT EDIT.
 * Claude builds the world and the main loop. Codex 1 builds the bike + bench.
 * Codex 2 builds the boat + sail + winch. Each exports one factory returning a GameMode.
 *
 * Units: metres, seconds, radians. +Y up, +X east, +Z south.
 * Heading h: forward = (sin h, 0, -cos h). Mesh models face local -Z; set rotation.y = -h.
 * Wind is a velocity (direction the air moves TOWARD), m/s.
 */
import type * as THREE from 'three';

export interface RoadHit {
  /** Distance from the road centre line in metres. */
  dist: number;
  /** 0 at the summit start, 1 at the harbour pier end. */
  progress: number;
  /** Closest point on the centre line and the road direction (heading) there. */
  x: number;
  z: number;
  heading: number;
}

export interface World {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Ground height (below 0 = seabed). */
  heightAt(x: number, z: number): number;
  /** Sea surface height at time now. */
  oceanHeight(x: number, z: number): number;
  /** Wind velocity at a point; writes out.x / out.z, returns out. */
  windAt(x: number, z: number, out: THREE.Vector3): THREE.Vector3;
  /** Nearest point on the bike road (island A). */
  roadNearest(x: number, z: number): RoadHit;
  /** Point on the road at progress 0..1. */
  roadPoint(progress: number): { x: number; z: number; heading: number };
  /** 0 calm .. 1 full storm. Modes may read it; main loop sets it. */
  storm: number;
  /** 0..1 rain wetness (lower grip). */
  wet: number;
  /** Sim time in seconds. */
  time: number;
  /** Spray / dust / sparks burst. */
  burst(kind: 'spray' | 'dust' | 'sparks', pos: THREE.Vector3, vel: THREE.Vector3, count: number): void;
  /** Fixed places. */
  places: {
    bikeStart: { x: number; z: number; heading: number };
    harbour: { x: number; z: number };
    boatStart: { x: number; z: number; heading: number };
    cove: { x: number; z: number };
  };
}

export interface Input {
  /** -1 left .. 1 right (A/D, arrows). */
  steer: number;
  /** -1 brake/back .. 1 pedal/forward (W/S). */
  throttle: number;
  /** Mouse look deltas this frame, radians. */
  lookX: number;
  lookY: number;
  /** key codes like 'KeyE', 'Space', 'KeyV'. */
  down(code: string): boolean;
  pressed(code: string): boolean;
  /** Pointer in normalised device coords (-1..1, +y up) and button state. */
  pointer: { x: number; y: number; down: boolean; pressed: boolean; released: boolean };
}

export interface Hud {
  objective(text: string): void;
  prompt(text: string): void;
  /** Named gauges 0..1 or raw numbers, shown bottom-left. e.g. set('speed', 12.3) */
  set(name: string, value: number | string): void;
  toast(text: string): void;
}

export interface GameMode {
  /** Add meshes to world.scene, place the player. */
  enter(world: World, hud: Hud): void;
  /** Called every frame, dt clamped to <= 1/30. Do sim + mesh update + world.camera placement. */
  update(dt: number, input: Input, world: World, hud: Hud): void;
  /** True when this part of the game is finished (main loop moves on). */
  done(): boolean;
  /** Remove everything you added. */
  exit(world: World): void;
}
