import { WORLD, type Terrain, type Vec3 } from '@contracts';
/** Original analytic placeholder; no copied island geometry or terrain code. */
export class StubTerrain implements Terrain {
  constructor(private seed = 7) {}
  height(x: number, z: number): number {
    let h = -12;
    for (const island of WORLD.islands) {
      const distance = Math.hypot(x - island.x, z - island.z);
      const cone = Math.max(0, 1 - distance / island.radius);
      const noise =
        Math.sin(x * 0.043 + this.seed) * Math.cos(z * 0.039 - this.seed);
      h = Math.max(h, -12 + cone * (island.peak + 12) + noise * cone * 3);
    }
    return h;
  }
  normal(x: number, z: number): Vec3 {
    const dx = this.height(x - 0.5, z) - this.height(x + 0.5, z),
      dz = this.height(x, z - 0.5) - this.height(x, z + 0.5),
      length = Math.hypot(dx, 1, dz);
    return { x: dx / length, y: 1 / length, z: dz / length };
  }
  surface(x: number, z: number): 'sand' | 'rock' | 'grass' | 'water' {
    const h = this.height(x, z);
    return h < 0
      ? 'water'
      : h < 3
        ? 'sand'
        : this.normal(x, z).y < 0.79
          ? 'rock'
          : 'grass';
  }
}
