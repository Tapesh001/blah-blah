/**
 * PROVISIONAL M0 contracts: original shared contract was absent at 243495d.
 * Reconcile with the team's authoritative file before integrating real systems.
 */
import type { Camera, Material, Object3D, Scene, Vector3 } from 'three';
export const CONTRACT_VERSION = '0.0.0-provisional';
export const CHAPTERS = ['title', 'ride', 'sail', 'isle', 'ending'] as const;
export type ChapterId = (typeof CHAPTERS)[number];
export type Quality = 'low' | 'medium' | 'high';
export const WORLD = {
  islands: [
    { id: 'home', x: -160, z: 80, radius: 120, peak: 35 },
    { id: 'destination', x: 240, z: -220, radius: 150, peak: 55 },
  ],
  squallLine: 0,
} as const;
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  fork(label: string): Rng;
}
export interface EnvState {
  storm: number;
  time: number;
  timeOfDay: number;
  rain: number;
  wetness: number;
  lightning: number;
  sunDir: Vec3;
}
export interface WindBake {
  width: number;
  height: number;
  size: number;
  origin: { x: number; z: number };
  data: Float32Array;
  channels: 3;
  sampleHeight: number;
}
export interface WindField {
  sample(position: Vec3, time: number): Vec3;
  bake(center: Vec3, time: number): WindBake;
}
export interface Terrain {
  height(x: number, z: number): number;
  normal(x: number, z: number): Vec3;
  surface(x: number, z: number): 'sand' | 'rock' | 'grass' | 'water';
}
export interface Ocean {
  sample(
    x: number,
    z: number,
    time: number,
  ): { height: number; normal: Vec3; velocity: Vec3 };
}
export type ActionId =
  | 'interact'
  | 'jump'
  | 'run'
  | 'haulLow'
  | 'ease'
  | 'shiftDown'
  | 'shiftUp'
  | 'camera'
  | 'hint'
  | 'undo'
  | 'map'
  | 'pause'
  | 'reefUp'
  | 'reefDown';
export interface InputState {
  throttle: number;
  steer: number;
  look: { x: number; y: number };
  down: ReadonlySet<ActionId>;
  pressed: ReadonlySet<ActionId>;
  released: ReadonlySet<ActionId>;
}
export interface Input {
  snapshot(): InputState;
  clear(): void;
  dispose(): void;
}
export interface CameraRig {
  camera: Camera;
  update(dt: number): void;
  position(): Vec3;
  dispose(): void;
}
export interface Physics {
  step(dt: number): void;
  dispose(): void;
}
export type AudioShot = 'click' | 'complete' | 'thunder';
export interface AudioBus {
  set(name: string, value: number): void;
  play(shot: AudioShot): void;
  dispose(): void;
}
export interface HudModel {
  chapter: ChapterId;
  objective: string;
  prompt: string;
  speed: number;
  checkpoint: string | null;
  loading: boolean;
  paused: boolean;
}
export interface Ui {
  update(model: HudModel): void;
  toast(text: string): void;
  dispose(): void;
}
export interface SaveStore {
  checkpoint(id: string): void;
  dispose(): void;
}
export interface MaterialKit {
  standard(color: number): Material;
}
export interface Fx {
  update(dt: number): void;
  dispose(): void;
}
export interface Gfx {
  scene: Scene;
  materials: MaterialKit;
  fx: Fx;
  setEnvironment(env: EnvState): void;
  render(camera: Camera): void;
  resize(): void;
  dispose(): void;
}
export interface Bench {
  solve(signal?: AbortSignal): Promise<{ solved: true }>;
}
export interface GameEvents {
  'chapter:enter': { chapter: ChapterId };
  'chapter:complete': { chapter: ChapterId };
  checkpoint: { id: string };
  error: { message: string };
}
export interface EventBus {
  on<K extends keyof GameEvents>(
    event: K,
    handler: (payload: GameEvents[K]) => void,
  ): () => void;
  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void;
  clear(): void;
}
export interface Chapter {
  id: ChapterId;
  load(ctx: GameContext): Promise<void>;
  enter(ctx: GameContext): void;
  fixedUpdate(ctx: GameContext, dt: number): void;
  frameUpdate(ctx: GameContext, dt: number, alpha: number): void;
  exit(ctx: GameContext): void;
  dispose(): void;
}
export type ChapterFactory = () => Chapter;
export interface GameContext {
  rng: Rng;
  events: EventBus;
  env: EnvState;
  wind: WindField;
  windBake: WindBake;
  terrain: Terrain;
  ocean: Ocean;
  gfx: Gfx;
  camera: CameraRig;
  physics: Physics;
  audio: AudioBus;
  ui: Ui;
  save: SaveStore;
  bench: Bench;
  input: InputState;
  chapter: ChapterId;
  checkpoint: string | null;
  quality: Quality;
  seed: string;
  timeScale: number;
  routeProgress: number;
  paused: boolean;
  setRouteProgress(value: number): void;
  completeChapter(): void;
  setStorm(value: number | null): void;
}
export interface DebugApi {
  version: string;
  ready: boolean;
  chapter(): ChapterId;
  goTo(chapter: ChapterId): Promise<void>;
  setStorm(value: number | null): void;
  setTimeScale(value: number): void;
  setRouteProgress(value: number): void;
  checkpoint(id: string): void;
  stats(): {
    steps: number;
    frames: number;
    time: number;
    storm: number;
    alpha: number;
    droppedSteps: number;
  };
  events: GameEvents['chapter:complete'][];
  dispose(): void;
}
export interface SandboxOptions {
  container?: HTMLElement;
  chapter?: ChapterId;
  seed?: string;
  quality?: Quality;
  mount?: (
    ctx: GameContext,
  ) => void | (() => void) | Promise<void | (() => void)>;
  services?: Partial<Services>;
  chapters?: Partial<Record<ChapterId, ChapterFactory>>;
}
export interface Services {
  wind: WindField;
  terrain: Terrain;
  ocean: Ocean;
  gfx: Gfx;
  camera: CameraRig;
  physics: Physics;
  audio: AudioBus;
  ui: Ui;
  save: SaveStore;
  bench: Bench;
}
export type SandboxFactory = (options?: SandboxOptions) => Promise<GameContext>;
export interface MountModule {
  mount?: (
    ctx: GameContext,
  ) => void | (() => void) | Promise<void | (() => void)>;
}
export type SceneAnchor = Object3D | Vector3;
declare global {
  interface Window {
    __cg: DebugApi;
  }
}
