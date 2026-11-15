import * as THREE from 'three';
import type { RoadHit } from '../api';

/* ---------- noise ---------- */
function hash(ix: number, iz: number): number {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, z: number, oct = 5): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

/* ---------- islands ---------- */
export interface Isle {
  x: number;
  z: number;
  r: number;
  peak: number;
  seed: number;
}
export const ISLE_A: Isle = { x: 0, z: 0, r: 430, peak: 120, seed: 11 };
export const ISLE_B: Isle = { x: 1500, z: -220, r: 300, peak: 100, seed: 47 };
const SEABED = -22;

function isleBase(x: number, z: number, I: Isle): number {
  const dx = x - I.x;
  const dz = z - I.z;
  const d = Math.sqrt(dx * dx + dz * dz) / I.r;
  if (d > 1.3) return SEABED;
  const n = fbm(x / 170 + I.seed, z / 170 - I.seed, 5);
  const ridge = 1 - Math.abs(fbm(x / 90 - I.seed, z / 90 + I.seed, 4) * 2 - 1);
  const shape = Math.pow(Math.max(0, 1 - d * d), 1.5);
  let h = I.peak * shape * (0.55 + 0.75 * n) + 14 * ridge * shape + 3 * fbm(x / 22, z / 22, 3) * shape;
  h += (0.92 - d) * 9;
  if (d > 0.9) h -= (d - 0.9) * 70;
  return Math.max(SEABED, h);
}
function baseHeight(x: number, z: number): number {
  return Math.max(isleBase(x, z, ISLE_A), isleBase(x, z, ISLE_B));
}

/* ---------- roads ---------- */
interface RoadSample {
  x: number;
  z: number;
  h: number;
  heading: number;
  s: number;
}
function catmull(p: number[][], step: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)]!;
    const p1 = p[i]!;
    const p2 = p[i + 1]!;
    const p3 = p[Math.min(p.length - 1, i + 2)]!;
    const len = Math.hypot(p2[0]! - p1[0]!, p2[1]! - p1[1]!);
    const n = Math.max(2, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0[0]!, p1[0]!, p2[0]!, p3[0]!), z: f(p0[1]!, p1[1]!, p2[1]!, p3[1]!) });
    }
  }
  const last = p[p.length - 1]!;
  out.push({ x: last[0]!, z: last[1]! });
  return out;
}
function buildRoad(ctrl: number[][]): RoadSample[] {
  const pts = catmull(ctrl, 3);
  const raw = pts.map((p) => Math.max(1.6, baseHeight(p.x, p.z)));
  const W = 14;
  const out: RoadSample[] = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    let sum = 0;
    let c = 0;
    for (let k = -W; k <= W; k++) {
      const j = Math.min(pts.length - 1, Math.max(0, i + k));
      sum += raw[j]!;
      c++;
    }
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    if (i > 0) s += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z);
    out.push({ x: pts[i]!.x, z: pts[i]!.z, h: sum / c, heading: Math.atan2(b.x - a.x, -(b.z - a.z)), s });
  }
  return out;
}
const ROAD_A = buildRoad([
  [-25, -15], [45, -65], [115, -35], [95, 35], [20, 75], [-65, 110], [-150, 85], [-200, 5], [-170, -95],
  [-80, -170], [40, -200], [160, -170], [250, -90], [285, 10], [255, 110], [310, 165], [372, 120], [408, 62], [452, 55],
]);
const ROAD_B = buildRoad([
  [1218, -205], [1262, -172], [1322, -192], [1372, -250], [1432, -268], [1470, -232], [1492, -222],
]);
export const ROADS = [ROAD_A, ROAD_B];
const CELL = 24;
const grid = new Map<number, number[]>();
ROADS.forEach((road, ri) =>
  road.forEach((p, i) => {
    const key = Math.floor(p.x / CELL) * 4096 + Math.floor(p.z / CELL);
    let a = grid.get(key);
    if (!a) grid.set(key, (a = []));
    a.push(ri * 100000 + i);
  }),
);
/** nearest road sample within ~2 cells; returns [dist, sample, roadIndex, sampleIndex] */
function nearest(x: number, z: number): [number, RoadSample, number, number] | null {
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  let best = 1e9;
  let bs: RoadSample | null = null;
  let br = 0;
  let bi = 0;
  for (let ax = -1; ax <= 1; ax++)
    for (let az = -1; az <= 1; az++) {
      const a = grid.get((cx + ax) * 4096 + (cz + az));
      if (!a) continue;
      for (const id of a) {
        const ri = Math.floor(id / 100000);
        const i = id - ri * 100000;
        const p = ROADS[ri]![i]!;
        const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (d < best) {
          best = d;
          bs = p;
          br = ri;
          bi = i;
        }
      }
    }
  return bs ? [Math.sqrt(best), bs, br, bi] : null;
}
function rawHeight(x: number, z: number): [number, number] {
  const b = baseHeight(x, z);
  const n = nearest(x, z);
  if (!n) return [b, 99];
  const d = n[0];
  const w = 1 - THREE.MathUtils.smoothstep(d, 4.5, 16);
  return [b + (n[1].h - b) * w, d];
}

/* ---------- cached height grids ---------- */
export interface IsleGrid {
  isle: Isle;
  n: number;
  size: number;
  ox: number;
  oz: number;
  h: Float32Array;
  road: Float32Array;
}
function buildGrid(I: Isle, n: number): IsleGrid {
  const size = I.r * 2.7;
  const ox = I.x - size / 2;
  const oz = I.z - size / 2;
  const h = new Float32Array(n * n);
  const road = new Float32Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const r = rawHeight(ox + (i / (n - 1)) * size, oz + (j / (n - 1)) * size);
      h[j * n + i] = r[0];
      road[j * n + i] = r[1];
    }
  return { isle: I, n, size, ox, oz, h, road };
}
export const GRID_A = buildGrid(ISLE_A, 420);
export const GRID_B = buildGrid(ISLE_B, 300);
function sample(G: IsleGrid, x: number, z: number): number {
  const u = ((x - G.ox) / G.size) * (G.n - 1);
  const v = ((z - G.oz) / G.size) * (G.n - 1);
  if (u < 0 || v < 0 || u >= G.n - 1 || v >= G.n - 1) return SEABED;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = u - i;
  const fv = v - j;
  const k = j * G.n + i;
  const a = G.h[k]!;
  const b = G.h[k + 1]!;
  const c = G.h[k + G.n]!;
  const d = G.h[k + G.n + 1]!;
  return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
}
export function heightAt(x: number, z: number): number {
  return Math.max(sample(GRID_A, x, z), sample(GRID_B, x, z));
}
export function roadNearest(x: number, z: number): RoadHit {
  let best = 1e9;
  let bi = 0;
  for (let i = 0; i < ROAD_A.length; i += 2) {
    const p = ROAD_A[i]!;
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  const p = ROAD_A[bi]!;
  return { dist: Math.sqrt(best), progress: bi / (ROAD_A.length - 1), x: p.x, z: p.z, heading: p.heading };
}
export function roadPoint(progress: number, road = 0): { x: number; z: number; heading: number } {
  const R = ROADS[road]!;
  const p = R[Math.round(THREE.MathUtils.clamp(progress, 0, 1) * (R.length - 1))]!;
  return { x: p.x, z: p.z, heading: p.heading };
}

/* ---------- meshes ---------- */
const cGrassA = new THREE.Color(0x4f7a2c);
const cGrassB = new THREE.Color(0x7c8f3a);
const cHeath = new THREE.Color(0x6b5a4a);
const cRock = new THREE.Color(0x6e6a66);
const cRockD = new THREE.Color(0x45413f);
const cSand = new THREE.Color(0xc9b98a);
const cRoad = new THREE.Color(0x2e3034);
const cGravel = new THREE.Color(0x8a8378);
const cBed = new THREE.Color(0x2b4a4a);

export function buildTerrainMesh(G: IsleGrid, mat: THREE.Material): THREE.Mesh {
  const n = G.n;
  const geo = new THREE.PlaneGeometry(G.size, G.size, n - 1, n - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let k = 0; k < n * n; k++) pos.setY(k, G.h[k]!);
  geo.computeVertexNormals();
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(n * n * 3);
  const c = new THREE.Color();
  for (let k = 0; k < n * n; k++) {
    const h = G.h[k]!;
    const ny = nor.getY(k);
    const x = pos.getX(k) + G.isle.x;
    const z = pos.getZ(k) + G.isle.z;
    const nz = fbm(x / 14, z / 14, 3);
    const rd = G.road[k]!;
    if (h < 0.2) c.copy(cBed).lerp(cSand, THREE.MathUtils.smoothstep(h, -3, 0.2));
    else {
      c.copy(cGrassA).lerp(cGrassB, nz);
      c.lerp(cHeath, THREE.MathUtils.smoothstep(h, 55, 105) * 0.8);
      c.lerp(cSand, 1 - THREE.MathUtils.smoothstep(h, 1.2, 3.5));
      const rock = 1 - THREE.MathUtils.smoothstep(ny, 0.72, 0.86);
      c.lerp(nz > 0.5 ? cRock : cRockD, rock);
    }
    if (rd < 9) {
      c.lerp(cGravel, 1 - THREE.MathUtils.smoothstep(rd, 4.2, 9));
      c.lerp(cRoad, 1 - THREE.MathUtils.smoothstep(rd, 3.0, 4.2));
      if (rd < 0.45 && Math.floor((x + z) / 6) % 2 === 0) c.setHex(0xd8d2b0);
    }
    c.multiplyScalar(0.85 + 0.3 * fbm(x / 3.1, z / 3.1, 2));
    col[k * 3] = c.r;
    col[k * 3 + 1] = c.g;
    col[k * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, mat);
  m.position.set(G.isle.x, 0, G.isle.z);
  m.receiveShadow = true;
  m.castShadow = true;
  return m;
}

/** RG half-float texture: R = height, G = grass density (0..1). */
export function buildHeightTexture(G: IsleGrid): THREE.DataTexture {
  const n = G.n;
  const data = new Uint16Array(n * n * 4);
  for (let k = 0; k < n * n; k++) {
    const h = G.h[k]!;
    const i = k % n;
    const j = Math.floor(k / n);
    const hx = G.h[j * n + Math.min(n - 1, i + 1)]! - G.h[j * n + Math.max(0, i - 1)]!;
    const hz = G.h[Math.min(n - 1, j + 1) * n + i]! - G.h[Math.max(0, j - 1) * n + i]!;
    const slope = Math.hypot(hx, hz) / ((2 * G.size) / n);
    let g = THREE.MathUtils.smoothstep(h, 2.5, 5) * (1 - THREE.MathUtils.smoothstep(slope, 0.55, 0.85));
    g *= THREE.MathUtils.smoothstep(G.road[k]!, 4.5, 8);
    g *= 1 - THREE.MathUtils.smoothstep(h, 85, 112) * 0.7;
    data[k * 4] = THREE.DataUtils.toHalfFloat(h);
    data[k * 4 + 1] = THREE.DataUtils.toHalfFloat(g);
    data[k * 4 + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.HalfFloatType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
