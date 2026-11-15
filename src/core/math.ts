export const clamp = (v: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, v));
export const damp = (a: number, b: number, rate: number, dt: number): number =>
  b + (a - b) * Math.exp(-rate * Math.max(0, dt));
export const wrapAngle = (v: number): number =>
  ((((v + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
export const remap = (
  v: number,
  a: number,
  b: number,
  c: number,
  d: number,
): number => (a === b ? c : c + ((v - a) / (b - a)) * (d - c));
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp(remap(v, a, b, 0, 1));
  return t * t * (3 - 2 * t);
};
/** Exact critically damped spring for a stationary target. */
export function spring(
  value: number,
  velocity: number,
  target: number,
  frequency: number,
  dt: number,
): { value: number; velocity: number } {
  const w = 2 * Math.PI * frequency,
    x = value - target,
    c = velocity + w * x,
    e = Math.exp(-w * dt);
  return {
    value: target + (x + c * dt) * e,
    velocity: (velocity - w * c * dt) * e,
  };
}
