import {
  DataTexture,
  LinearMipmapLinearFilter,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';

/** Deterministic 512px PBR surfaces generated in memory: no image assets or IO. */
export function surfaceMaps(
  kind: 'metal' | 'wood' | 'cloth' | 'leather',
  size = 512,
) {
  const height = new Float32Array(size * size),
    color = new Uint8Array(size * size * 4),
    normal = new Uint8Array(size * size * 4),
    roughness = new Uint8Array(size * size * 4);
  const hash = (x: number, y: number) => {
    let n = Math.imul(x + 73, 374761393) ^ Math.imul(y + 131, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size,
        n = hash(x, y),
        wave = Math.sin(u * 195 + Math.sin(v * 17) * 1.7 + Math.sin(v * 4) * 3);
      let h = 0.5,
        value = 1,
        r = 0.7;
      if (kind === 'metal') {
        h =
          0.5 +
          Math.sin(v * size * 1.5 + Math.sin(u * 31) * 0.3) * 0.025 +
          (n - 0.5) * 0.02;
        value = 0.84 + 0.12 * n;
        r = 0.48 + 0.24 * n;
      } else if (kind === 'wood') {
        h =
          0.5 +
          wave * 0.12 +
          Math.sin(u * 450 + Math.sin(v * 17) * 3) * 0.04 +
          (n - 0.5) * 0.02;
        value = 0.7 + 0.22 * (wave * 0.5 + 0.5) + n * 0.08;
        r = 0.7 + n * 0.2;
      } else if (kind === 'cloth') {
        const a = Math.sin(u * Math.PI * 256),
          b = Math.sin(v * Math.PI * 256);
        h = 0.5 + a * b * 0.12;
        value = 0.82 + (a * b + 1) * 0.07;
        r = 0.86 + n * 0.12;
      } else {
        const cell = hash(Math.floor(x / 5), Math.floor(y / 5));
        h = 0.5 + cell * 0.1 + Math.sin(x * 1.6) * Math.sin(y * 1.3) * 0.025;
        value = 0.78 + cell * 0.18;
        r = 0.65 + cell * 0.24;
      }
      const i = y * size + x,
        o = i * 4;
      height[i] = h;
      color[o] = color[o + 1] = color[o + 2] = Math.round(value * 255);
      color[o + 3] = 255;
      roughness[o] = roughness[o + 1] = roughness[o + 2] = Math.round(r * 255);
      roughness[o + 3] = 255;
    }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx =
        (height[y * size + ((x + 1) % size)]! -
          height[y * size + ((x + size - 1) % size)]!) *
        2;
      const dy =
        (height[((y + 1) % size) * size + x]! -
          height[((y + size - 1) % size) * size + x]!) *
        2;
      const length = Math.hypot(dx, dy, 1),
        o = (y * size + x) * 4;
      normal[o] = Math.round((0.5 - (dx / length) * 0.5) * 255);
      normal[o + 1] = Math.round((0.5 - (dy / length) * 0.5) * 255);
      normal[o + 2] = Math.round((0.5 + 0.5 / length) * 255);
      normal[o + 3] = 255;
    }
  const texture = (data: Uint8Array) => {
    const t = new DataTexture(data, size, size, RGBAFormat);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = LinearMipmapLinearFilter;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  const map = texture(color),
    normalMap = texture(normal),
    roughnessMap = texture(roughness);
  map.colorSpace = SRGBColorSpace;
  return {
    parameters: { map, normalMap, roughnessMap },
    dispose() {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
    },
  };
}
