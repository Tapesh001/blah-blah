export type BenchKind = 'bike' | 'engine';
export interface BenchPart {
  id: string;
  teeth: number;
}
export interface BenchAxle {
  id: string;
  x: number;
  z: number;
  fixed?: BenchPart;
}
export interface BenchDef {
  kind: BenchKind;
  axles: BenchAxle[];
  tray: BenchPart[];
  target: number;
}
export const radiusOf = (teeth: number) => teeth * 0.004;
export function benchDefinition(kind: BenchKind): BenchDef {
  return kind === 'bike'
    ? {
        kind,
        target: 2.5,
        axles: [
          {
            id: 'crank',
            x: -0.18,
            z: -0.13,
            fixed: { id: 'driver', teeth: 30 },
          },
          { id: 'idler', x: 0.036, z: -0.13 },
          {
            id: 'output',
            x: 0.18,
            z: -0.13,
            fixed: { id: 'output', teeth: 12 },
          },
        ],
        tray: [
          { id: 'gear-16', teeth: 16 },
          { id: 'gear-20', teeth: 20 },
          { id: 'gear-24', teeth: 24 },
          { id: 'gear-32', teeth: 32 },
        ],
      }
    : {
        kind,
        target: -0.5,
        axles: [
          {
            id: 'driver',
            x: -0.36,
            z: -0.13,
            fixed: { id: 'driver', teeth: 20 },
          },
          { id: 'idler-a', x: -0.184, z: -0.13 },
          { id: 'idler-b', x: 0.04, z: -0.13 },
          {
            id: 'output',
            x: 0.328,
            z: -0.13,
            fixed: { id: 'output', teeth: 40 },
          },
        ],
        tray: [
          { id: 'gear-16', teeth: 16 },
          { id: 'gear-24', teeth: 24 },
          { id: 'gear-28', teeth: 28 },
          { id: 'gear-32', teeth: 32 },
        ],
      };
}
export interface BoardResult {
  legal: boolean;
  solved: boolean;
  ratio: number | null;
  rates: Record<string, number>;
  phases: Record<string, number>;
  meshes: [string, string][];
  errors: string[];
}
/** Gear plane is X/-Z; phases align each tooth with the neighbouring tooth gap. */
export function evaluateBoard(
  def: BenchDef,
  placement: Readonly<Record<string, string | undefined>>,
): BoardResult {
  const result: BoardResult = {
    legal: true,
    solved: false,
    ratio: null,
    rates: { driver: 1 },
    phases: { driver: 0 },
    meshes: [],
    errors: [],
  };
  const used = new Set<string>();
  const mounted = def.axles.flatMap((axle) => {
    const id = placement[axle.id];
    if (axle.fixed) {
      if (id) result.errors.push(`Fixed axle ${axle.id}`);
      return [{ ...axle, part: axle.fixed }];
    }
    if (!id) return [];
    const part = def.tray.find((p) => p.id === id);
    if (!part || used.has(id)) {
      result.errors.push('Unknown or reused gear');
      return [];
    }
    used.add(id);
    return [{ ...axle, part }];
  });
  for (const id of Object.keys(placement))
    if (!def.axles.some((a) => a.id === id))
      result.errors.push(`Unknown axle ${id}`);
  const adjacency = new Map<
    string,
    { id: string; ratio: number; phase: number }[]
  >();
  for (let i = 0; i < mounted.length; i++)
    for (let j = i + 1; j < mounted.length; j++) {
      const a = mounted[i]!,
        b = mounted[j]!,
        distance = Math.hypot(a.x - b.x, a.z - b.z),
        sum = radiusOf(a.part.teeth + b.part.teeth);
      if (Math.abs(distance - sum) <= 0.001) {
        result.meshes.push([a.part.id, b.part.id]);
        for (const [from, to] of [
          [a, b],
          [b, a],
        ] as const) {
          const ratio = -from.part.teeth / to.part.teeth,
            theta = Math.atan2(-(to.z - from.z), to.x - from.x);
          const phase = (1 - ratio) * theta + Math.PI - Math.PI / to.part.teeth;
          adjacency.set(from.part.id, [
            ...(adjacency.get(from.part.id) ?? []),
            { id: to.part.id, ratio, phase },
          ]);
        }
      } else if (distance < sum - 0.001)
        result.errors.push(`Overlap: ${a.part.teeth}T and ${b.part.teeth}T`);
    }
  const queue = ['driver'];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!;
    for (const edge of adjacency.get(current) ?? []) {
      const rate = result.rates[current]! * edge.ratio;
      if (result.rates[edge.id] !== undefined) {
        if (Math.abs(result.rates[edge.id]! - rate) > 1e-8)
          result.errors.push('Seized gear loop');
      } else {
        result.rates[edge.id] = rate;
        result.phases[edge.id] =
          edge.phase + edge.ratio * result.phases[current]!;
        queue.push(edge.id);
      }
    }
  }
  result.legal = result.errors.length === 0;
  result.ratio = result.rates.output ?? null;
  result.solved =
    result.legal &&
    result.ratio !== null &&
    Math.abs(result.ratio - def.target) < 0.001;
  return result;
}
