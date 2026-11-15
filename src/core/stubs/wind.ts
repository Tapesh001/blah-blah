import type { Vec3, WindBake, WindField } from '@contracts';
export class StubWind implements WindField {
  private grid: WindBake = {
    width: 64,
    height: 64,
    size: 512,
    origin: { x: 0, z: 0 },
    data: new Float32Array(64 * 64 * 3),
    channels: 3,
    sampleHeight: 10,
  };
  sample(position: Vec3, time: number): Vec3 {
    const gust = 2 * Math.sin((position.x - time * 8) / 40);
    return { x: 8 + gust, y: 0, z: 2 };
  }
  bake(center: Vec3, time: number): WindBake {
    const grid = this.grid;
    grid.origin.x = center.x - grid.size / 2;
    grid.origin.z = center.z - grid.size / 2;
    for (let z = 0; z < grid.height; z++)
      for (let x = 0; x < grid.width; x++) {
        const v = this.sample(
          {
            x: grid.origin.x + ((x + 0.5) * grid.size) / grid.width,
            y: grid.sampleHeight,
            z: grid.origin.z + ((z + 0.5) * grid.size) / grid.height,
          },
          time,
        );
        const i = (z * grid.width + x) * 3;
        grid.data[i] = v.x;
        grid.data[i + 1] = v.y;
        grid.data[i + 2] = v.z;
      }
    return grid;
  }
}
