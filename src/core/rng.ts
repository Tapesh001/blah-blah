import type { Rng } from '@contracts';
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
const rotl = (v: number, n: number): number => (v << n) | (v >>> (32 - n));
export class SeededRng implements Rng {
  private state: [number, number, number, number];
  private readonly key: string;
  constructor(seed: string | number) {
    this.key = String(seed);
    let value = hash(this.key);
    const split = (): number => {
      value = (value + 0x9e3779b9) >>> 0;
      let z = value;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
      return (z ^ (z >>> 15)) >>> 0;
    };
    this.state = [split(), split(), split(), split()];
    if (this.state.every((v) => v === 0)) this.state[0] = 1;
  }
  next(): number {
    let [a, b, c, d] = this.state;
    const result = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = rotl(d, 11);
    this.state = [a >>> 0, b >>> 0, c >>> 0, d >>> 0];
    return result / 4294967296;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  fork(label: string): Rng {
    return new SeededRng(this.key.length + ':' + this.key + ':' + label);
  }
}
