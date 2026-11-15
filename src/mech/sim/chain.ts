import type { ChainPath } from './types';

export const CHAIN_PITCH = 0.0127;
export const GEAR_MODULE = 0.0025;
export const pitchRadius = (
  kind: 'gear' | 'sprocket',
  teeth: number,
): number =>
  kind === 'gear'
    ? (GEAR_MODULE * teeth) / 2
    : CHAIN_PITCH / (2 * Math.sin(Math.PI / teeth));
const TAU = 2 * Math.PI;
const positive = (a: number) => ((a % TAU) + TAU) % TAU;
export interface Circle {
  x: number;
  y: number;
  radius: number;
}

export function segmentDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Exact external tangents and wrap arcs, including unequal two-sprocket loops.
 * Three or more sprockets must be in convex perimeter order; crossed/internal
 * wraps are deliberately rejected (they reverse sense and are not this chain model).
 */
export function chainPath(circles: Circle[]): ChainPath | null {
  if (
    circles.length < 2 ||
    circles.some(
      (c) => ![c.x, c.y, c.radius].every(Number.isFinite) || c.radius <= 0,
    )
  )
    return null;
  let cs = circles;
  if (cs.length > 2) {
    const area = cs.reduce((a, c, i) => {
      const n = cs[(i + 1) % cs.length]!;
      return a + c.x * n.y - n.x * c.y;
    }, 0);
    if (Math.abs(area) < 1e-12) return null;
    if (area < 0) cs = [...cs].reverse();
  }
  const angles: number[] = [];
  const segments: ChainPath['segments'] = [];
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i]!,
      b = cs[(i + 1) % cs.length]!;
    const dx = b.x - a.x,
      dy = b.y - a.y,
      d = Math.hypot(dx, dy);
    if (d <= a.radius + b.radius) return null;
    const angle = Math.atan2(dy, dx) - Math.acos((a.radius - b.radius) / d);
    const nx = Math.cos(angle),
      ny = Math.sin(angle);
    // Every other sprocket must lie inside this external support line.
    if (
      cs.some(
        (c) => (c.x - a.x) * nx + (c.y - a.y) * ny + c.radius > a.radius + 1e-9,
      )
    )
      return null;
    angles.push(angle);
    segments.push({
      from: { x: a.x + a.radius * nx, y: a.y + a.radius * ny },
      to: { x: b.x + b.radius * nx, y: b.y + b.radius * ny },
    });
  }
  const arcs = cs.map((c, i) => {
    const start = angles[(i + cs.length - 1) % cs.length]!;
    return { ...c, start, sweep: positive(angles[i]! - start) };
  });
  // Reject self-intersecting/star routes and repeated wraps around the board.
  if (Math.abs(arcs.reduce((sum, a) => sum + a.sweep, 0) - TAU) > 1e-7)
    return null;
  const length =
    segments.reduce(
      (sum, s) => sum + Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y),
      0,
    ) + arcs.reduce((sum, a) => sum + a.radius * a.sweep, 0);
  return { length, segments, arcs };
}

export function pathHitsStud(path: ChainPath, stud: Circle): boolean {
  if (
    path.segments.some(
      (s) => segmentDistance(stud, s.from, s.to) <= stud.radius + 0.0015,
    )
  )
    return true;
  return path.arcs.some((a) => {
    const angle = Math.atan2(stud.y - a.y, stud.x - a.x);
    if (positive(angle - a.start) > a.sweep + 1e-9) return false;
    return (
      Math.abs(Math.hypot(stud.x - a.x, stud.y - a.y) - a.radius) <=
      stud.radius + 0.0015
    );
  });
}
