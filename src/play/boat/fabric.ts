import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

/** Small-step distance constraints, with reusable typed buffers and moving pins. */
class Net {
  readonly position: Float32Array;
  readonly previous: Float32Array;
  readonly pinned: Uint8Array;
  readonly edges: Uint16Array;
  readonly lengths: Float32Array;

  constructor(points: number[], edges: number[]) {
    this.position = new Float32Array(points);
    this.previous = this.position.slice();
    this.pinned = new Uint8Array(points.length / 3);
    this.edges = new Uint16Array(edges);
    this.lengths = new Float32Array(edges.length / 2);
    this.measure();
  }

  measure() {
    for (let e = 0; e < this.lengths.length; e++) {
      const a = this.edges[e * 2]! * 3,
        b = this.edges[e * 2 + 1]! * 3;
      this.lengths[e] = Math.hypot(
        this.position[a]! - this.position[b]!,
        this.position[a + 1]! - this.position[b + 1]!,
        this.position[a + 2]! - this.position[b + 2]!,
      );
    }
  }

  pin(index: number, x: number, y: number, z: number) {
    this.pinned[index] = 1;
    const i = index * 3;
    this.position[i] = this.previous[i] = x;
    this.position[i + 1] = this.previous[i + 1] = y;
    this.position[i + 2] = this.previous[i + 2] = z;
  }

  integrate(h: number, ax: number, ay: number, az: number) {
    const damping = Math.exp(-2.5 * h);
    for (let i = 0; i < this.pinned.length; i++) {
      if (this.pinned[i]) continue;
      const k = i * 3;
      for (let axis = 0; axis < 3; axis++) {
        const old = this.position[k + axis]!;
        const acceleration = axis === 0 ? ax : axis === 1 ? ay : az;
        const velocity = Math.max(
          -0.08,
          Math.min(0.08, (old - this.previous[k + axis]!) * damping),
        );
        this.position[k + axis] = old + velocity + acceleration * h * h;
        this.previous[k + axis] = old;
      }
    }
  }

  solve(h: number, compliance = 0.0000001) {
    const alpha = compliance / (h * h);
    for (let e = 0; e < this.lengths.length; e++) {
      const ia = this.edges[e * 2]!,
        ib = this.edges[e * 2 + 1]!;
      const wa = this.pinned[ia] ? 0 : 1,
        wb = this.pinned[ib] ? 0 : 1;
      if (wa + wb === 0) continue;
      const a = ia * 3,
        b = ib * 3;
      const dx = this.position[b]! - this.position[a]!;
      const dy = this.position[b + 1]! - this.position[a + 1]!;
      const dz = this.position[b + 2]! - this.position[a + 2]!;
      const length = Math.hypot(dx, dy, dz);
      if (length < 0.000001) continue;
      const correction =
        (length - this.lengths[e]!) / (length * (wa + wb + alpha));
      this.position[a]! += dx * correction * wa;
      this.position[a + 1]! += dy * correction * wa;
      this.position[a + 2]! += dz * correction * wa;
      this.position[b]! -= dx * correction * wb;
      this.position[b + 1]! -= dy * correction * wb;
      this.position[b + 2]! -= dz * correction * wb;
    }
  }
}

export const MAST_Z = -0.85;
export const BOOM_Y = 1.25;
export const BOOM_LENGTH = 2.6;
export const SAIL_HEIGHT = 5.1;

export class SailCloth {
  readonly columns = 12;
  readonly rows = 16;
  readonly geometry = new BufferGeometry();
  readonly net: Net;
  private readonly baseLengths: Float32Array;
  private reefScale = 1;
  private time = 0;

  constructor() {
    const points: number[] = [],
      edges: number[] = [],
      faces: number[] = [],
      uv: number[] = [];
    for (let row = 0; row <= this.rows; row++) {
      for (let col = 0; col <= this.columns; col++) {
        const v = row / this.rows,
          u = col / this.columns;
        points.push(
          0.09,
          BOOM_Y + 0.1 + v * SAIL_HEIGHT,
          MAST_Z + u * BOOM_LENGTH * (1 - v * 0.98),
        );
        uv.push(u, v);
        const i = row * (this.columns + 1) + col;
        if (col > 0) edges.push(i - 1, i);
        if (row > 0) edges.push(i - this.columns - 1, i);
        if (row > 0 && col > 0) {
          edges.push(i - this.columns - 2, i, i - this.columns - 1, i - 1);
          faces.push(
            i,
            i - 1,
            i - this.columns - 2,
            i,
            i - this.columns - 2,
            i - this.columns - 1,
          );
        }
        // Cross-distance bending and three batten rows resist folding.
        if (col > 1) edges.push(i - 2, i);
        if (row > 1) edges.push(i - 2 * (this.columns + 1), i);
        if ([4, 8, 12].includes(row) && col > 2) edges.push(i - 3, i);
      }
    }
    this.net = new Net(points, edges);
    this.baseLengths = this.net.lengths.slice();
    this.geometry.setAttribute(
      'position',
      new BufferAttribute(this.net.position, 3),
    );
    this.geometry.setAttribute(
      'uv',
      new BufferAttribute(new Float32Array(uv), 2),
    );
    this.geometry.setIndex(faces);
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }

  update(
    dt: number,
    boom: number,
    reef: number,
    windRight: number,
    windForward: number,
    luff: number,
  ) {
    if (dt <= 0) return;
    this.time += dt;
    const targetScale = Math.sqrt(reef);
    this.reefScale += (targetScale - this.reefScale) * (1 - Math.exp(-dt * 4));
    const h = Math.min(dt, 1 / 30) / 8;
    const sin = Math.sin(boom),
      cos = Math.cos(boom);
    for (let e = 0; e < this.net.lengths.length; e++)
      this.net.lengths[e] = this.baseLengths[e]! * this.reefScale;
    for (let substep = 0; substep < 8; substep++) {
      for (let row = 0; row <= this.rows; row++) {
        this.net.pin(
          row * (this.columns + 1),
          0.09 * cos,
          BOOM_Y + 0.1 + (row / this.rows) * SAIL_HEIGHT * this.reefScale,
          MAST_Z - 0.09 * sin,
        );
      }
      for (let col = 0; col <= this.columns; col++) {
        const length = (col / this.columns) * BOOM_LENGTH * this.reefScale;
        this.net.pin(
          col,
          length * sin + 0.09 * cos,
          BOOM_Y + 0.1,
          MAST_Z + length * cos - 0.09 * sin,
        );
      }
      // Pressure acts normal to the sail; structural constraints create its belly.
      const normalWind = windRight * cos + windForward * sin;
      const pressure = Math.max(
        -45,
        Math.min(45, normalWind * Math.abs(normalWind) * 0.15),
      );
      this.net.integrate(h, pressure * cos, -2.5, -pressure * sin);
      for (let row = 1; row <= this.rows; row++) {
        for (let col = 1; col <= this.columns; col++) {
          const i = (row * (this.columns + 1) + col) * 3;
          const flutter =
            (Math.sin(this.time * 32 - col * 0.7 + row * 0.3) *
              luff *
              90 *
              col) /
            this.columns;
          this.net.position[i]! += flutter * cos * h * h;
          this.net.position[i + 2]! -= flutter * sin * h * h;
        }
      }
      for (let iteration = 0; iteration < 3; iteration++) this.net.solve(h);
      // Keep free cloth outside the mast's cylindrical envelope.
      for (let i = 0; i < this.net.pinned.length; i++) {
        if (this.net.pinned[i]) continue;
        const k = i * 3,
          x = this.net.position[k]!,
          z = this.net.position[k + 2]! - MAST_Z;
        const radius = Math.hypot(x, z);
        if (radius < 0.085) {
          const scale = 0.086 / Math.max(radius, 0.0001);
          this.net.position[k] = radius < 0.0001 ? 0.086 : x * scale;
          this.net.position[k + 2] = MAST_Z + z * scale;
        }
        this.net.position[k + 1] = Math.max(
          BOOM_Y + 0.075,
          this.net.position[k + 1]!,
        );
      }
    }
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }

  point(row: number, col: number, out: Vector3) {
    return out.fromArray(
      this.net.position,
      (row * (this.columns + 1) + col) * 3,
    );
  }
}

/** Two simulated spans meet at the deck block, including load-dependent sag. */
export class SheetRope {
  readonly net: Net;
  readonly geometry = new BufferGeometry();
  readonly segments = 36;
  private initialized = false;
  private boom = new Vector3();
  private block = new Vector3(0.68, 0.72, 1.75);
  private drum = new Vector3(0.89, 1.04, 1.15);

  constructor() {
    const points: number[] = [],
      edges: number[] = [];
    for (let i = 0; i <= this.segments; i++) {
      points.push(i * 0.1, 1, 0);
      if (i > 0) edges.push(i - 1, i);
    }
    this.net = new Net(points, edges);
    // A narrow six-sided tube follows the rope without recreating geometry.
    const index: number[] = [];
    for (let i = 0; i < this.segments; i++)
      for (let side = 0; side < 6; side++) {
        const a = i * 6 + side,
          b = i * 6 + ((side + 1) % 6);
        index.push(a, b, a + 6, b, b + 6, a + 6);
      }
    this.geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array((this.segments + 1) * 18), 3),
    );
    this.geometry.setIndex(index);
  }

  update(dt: number, angle: number, sheet: number, load: number, wind: number) {
    this.boom.set(
      Math.sin(angle) * BOOM_LENGTH,
      BOOM_Y,
      MAST_Z + Math.cos(angle) * BOOM_LENGTH,
    );
    if (!this.initialized) {
      const point = new Vector3();
      for (let i = 0; i <= this.segments; i++) {
        if (i <= 26) point.lerpVectors(this.boom, this.block, i / 26);
        else point.lerpVectors(this.block, this.drum, (i - 26) / 10);
        point.toArray(this.net.position, i * 3);
      }
      this.net.previous.set(this.net.position);
      this.initialized = true;
    }
    const slack = 1 + (sheet * 0.3) / (1 + load / 80);
    for (let i = 0; i < this.segments; i++)
      this.net.lengths[i] =
        (i < 26
          ? this.boom.distanceTo(this.block) / 26
          : this.block.distanceTo(this.drum) / 10) * slack;
    const h = Math.max(0.0001, Math.min(dt, 1 / 30) / 8);
    for (let step = 0; step < 8; step++) {
      this.net.pin(0, this.boom.x, this.boom.y, this.boom.z);
      this.net.pin(26, this.block.x, this.block.y, this.block.z);
      this.net.pin(36, this.drum.x, this.drum.y, this.drum.z);
      this.net.integrate(h, wind * 0.15, -9.81, 0);
      for (let iteration = 0; iteration < 4; iteration++) this.net.solve(h, 0);
    }
    const positions = this.geometry.attributes.position as BufferAttribute;
    for (let i = 0; i <= this.segments; i++) {
      const before = Math.max(0, i - 1) * 3,
        after = Math.min(this.segments, i + 1) * 3;
      const tx = this.net.position[after]! - this.net.position[before]!;
      const ty = this.net.position[after + 1]! - this.net.position[before + 1]!;
      const tz = this.net.position[after + 2]! - this.net.position[before + 2]!;
      const length = Math.hypot(tx, ty, tz) || 1;
      const horizontal = Math.hypot(tx, tz) || 1;
      const nx = tz / horizontal,
        nz = -tx / horizontal;
      const bx = (ty / length) * nz,
        by = (tz * nx - tx * nz) / length,
        bz = (-ty / length) * nx;
      for (let side = 0; side < 6; side++) {
        const c = Math.cos((side * Math.PI) / 3) * 0.014,
          s = Math.sin((side * Math.PI) / 3) * 0.014;
        positions.setXYZ(
          i * 6 + side,
          this.net.position[i * 3]! + nx * c + bx * s,
          this.net.position[i * 3 + 1]! + by * s,
          this.net.position[i * 3 + 2]! + nz * c + bz * s,
        );
      }
    }
    positions.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }
}
