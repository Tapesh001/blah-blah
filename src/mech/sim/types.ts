/** M0-local contracts. All distances are metres; speeds are signed RPM. */
export type Sense = -1 | 0 | 1;
export type Part =
  | { id: string; kind: 'gear' | 'sprocket'; teeth: number }
  | { id: string; kind: 'ratchet'; direction: -1 | 1 };
export interface Axle {
  id: string;
  x: number;
  y: number;
}
export interface MechPuzzleDef {
  id: string;
  context: 'bike' | 'winch' | 'engine';
  axles: Axle[];
  tiers: number;
  tray: Part[];
  driver: string;
  driverRpm: number;
  goals: { axle: string; ratio: number; sense: -1 | 1; tolerance: number }[];
  chainLinks: number;
  /** Remaining slack, in metres, after tensioner take-up. Inclusive. */
  tension: { min: number; max: number; takeUp: number };
  studs?: { x: number; y: number; radius: number }[];
}
export interface Mount {
  part: string;
  axle: string;
  tier: number;
}
export interface MechPlacement {
  parts: Mount[];
  /** A closed external chain loop; do not repeat its first sprocket. */
  chains?: { sprockets: string[]; links: number; tensioner: number }[];
  /** A ratchet hub between a mounted part and its shaft; otherwise stacks are rigid. */
  ratchets?: { part: string; mount: string }[];
  inventory?: Part[];
}
export interface ChainPath {
  length: number;
  segments: { from: { x: number; y: number }; to: { x: number; y: number } }[];
  arcs: {
    x: number;
    y: number;
    radius: number;
    start: number;
    sweep: number;
  }[];
}
export interface ChainResult {
  length: number;
  minimumLinks: number;
  links: number;
  slack: number;
  tension: 'tight' | 'ok' | 'loose' | 'invalid';
  path: ChainPath | null;
}
export interface MechEvaluation {
  valid: boolean;
  solved: boolean;
  errors: string[];
  /** Signed speed divided by driverRpm; null means disconnected/freewheeling. */
  ratios: Record<string, number | null>;
  rpm: Record<string, number | null>;
  senses: Record<string, Sense>;
  partRpm: Record<string, number | null>;
  idle: string[];
  seized: boolean;
  seizureLoop: string[];
  unmetGoals: string[];
  chains: ChainResult[];
  chainLengthUsed: number;
  efficiency: number;
  durability: number;
  drivetrain: {
    chainring: number;
    cogs: number[];
    efficiency: number;
    durability: number;
  } | null;
}
