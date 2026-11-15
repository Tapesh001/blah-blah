import type { Ocean } from '@contracts';
export const STUB_WAVES = [
  { amplitude: 0.35, wavelength: 28, direction: 0.2, steepness: 0.25 },
  { amplitude: 0.18, wavelength: 15, direction: 1.1, steepness: 0.2 },
  { amplitude: 0.09, wavelength: 8, direction: 2.3, steepness: 0.15 },
  { amplitude: 0.04, wavelength: 4, direction: -0.7, steepness: 0.1 },
] as const;
/** Provisional Gerstner equation. Inverts horizontal displacement for world-space queries. */
export class StubOcean implements Ocean {
  private displacement(u: number, v: number, time: number) {
    let x = u,
      z = v,
      height = 0,
      dx = 0,
      dz = 0,
      vx = 0,
      vy = 0,
      vz = 0,
      xx = 1,
      xz = 0,
      zz = 1;
    for (const wave of STUB_WAVES) {
      const k = (2 * Math.PI) / wave.wavelength,
        omega = Math.sqrt(9.81 * k),
        a = wave.amplitude,
        q = wave.steepness;
      const sx = Math.cos(wave.direction),
        sz = Math.sin(wave.direction),
        phase = k * (sx * u + sz * v) - omega * time,
        s = Math.sin(phase),
        c = Math.cos(phase);
      x += q * a * sx * c;
      z += q * a * sz * c;
      height += a * s;
      dx += a * k * sx * c;
      dz += a * k * sz * c;
      xx -= q * a * k * sx * sx * s;
      xz -= q * a * k * sx * sz * s;
      zz -= q * a * k * sz * sz * s;
      vx += q * a * sx * omega * s;
      vz += q * a * sz * omega * s;
      vy -= a * omega * c;
    }
    return { x, z, height, dx, dz, vx, vy, vz, xx, xz, zz };
  }
  sample(x: number, z: number, time: number) {
    let u = x,
      v = z;
    for (let i = 0; i < 4; i++) {
      const p = this.displacement(u, v, time);
      u += x - p.x;
      v += z - p.z;
    }
    const p = this.displacement(u, v, time),
      det = p.xx * p.zz - p.xz * p.xz;
    const nx = -(p.dx * p.zz - p.dz * p.xz) / det,
      nz = -(p.dz * p.xx - p.dx * p.xz) / det,
      length = Math.hypot(nx, 1, nz);
    return {
      height: p.height,
      normal: { x: nx / length, y: 1 / length, z: nz / length },
      velocity: { x: p.vx, y: p.vy, z: p.vz },
    };
  }
}
