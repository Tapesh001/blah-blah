import { CHAIN_PITCH, chainPath, pathHitsStud, pitchRadius } from './chain';
import type {
  MechEvaluation,
  MechPlacement,
  MechPuzzleDef,
  Part,
  Sense,
} from './types';

interface Edge {
  a: string;
  b: string;
  ratio: number;
  loss: number;
  gate?: { port: string; sense: number };
}
const EPS = 1e-9;
const close = (a: number, b: number) =>
  Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));
const shaft = (id: string) => `axle:${id}`;
const port = (id: string) => `part:${id}`;

/** Pure, deterministic static kinematics; invalid placements never solve a puzzle. */
export function evaluate(
  def: MechPuzzleDef,
  placement: MechPlacement,
): MechEvaluation {
  const result: MechEvaluation = {
    valid: false,
    solved: false,
    errors: [],
    ratios: {},
    rpm: {},
    senses: {},
    partRpm: {},
    idle: [],
    seized: false,
    seizureLoop: [],
    unmetGoals: [],
    chains: [],
    chainLengthUsed: 0,
    efficiency: 1,
    durability: 1,
    drivetrain: null,
  };
  const error = (s: string) => {
    if (!result.errors.includes(s)) result.errors.push(s);
  };
  const axles = new Map(def.axles.map((a) => [a.id, a]));
  if (axles.size !== def.axles.length || !axles.has(def.driver))
    error('Invalid or duplicate driver/axle');
  if (!Number.isFinite(def.driverRpm) || def.driverRpm === 0)
    error('Driver RPM must be finite and nonzero');
  if (
    !Number.isInteger(def.tiers) ||
    def.tiers < 1 ||
    !Number.isInteger(def.chainLinks) ||
    def.chainLinks < 0
  )
    error('Invalid tier/link budget');
  if (
    ![def.tension.min, def.tension.max, def.tension.takeUp].every(
      Number.isFinite,
    ) ||
    def.tension.min < 0 ||
    def.tension.max < def.tension.min ||
    def.tension.takeUp < 0
  )
    error('Invalid tension range');
  if (def.axles.some((a) => !Number.isFinite(a.x) || !Number.isFinite(a.y)))
    error('Invalid axle position');
  if (
    (def.studs ?? []).some(
      (s) => ![s.x, s.y, s.radius].every(Number.isFinite) || s.radius <= 0,
    )
  )
    error('Invalid stud');
  for (const g of def.goals)
    if (
      !axles.has(g.axle) ||
      !Number.isFinite(g.ratio) ||
      g.ratio <= 0 ||
      !Number.isFinite(g.tolerance) ||
      g.tolerance < 0 ||
      ![-1, 1].includes(g.sense)
    )
      error('Invalid goal');
  const available = [...def.tray, ...(placement.inventory ?? [])];
  const catalog = new Map<string, Part>();
  for (const p of available) {
    if (catalog.has(p.id)) error(`Duplicate part ID: ${p.id}`);
    if (
      p.kind === 'ratchet'
        ? ![-1, 1].includes(p.direction)
        : !['gear', 'sprocket'].includes(p.kind) ||
          !Number.isInteger(p.teeth) ||
          p.teeth < 6 ||
          p.teeth > 200
    )
      error(`Invalid part: ${p.id}`);
    catalog.set(p.id, p);
  }
  const mounted = new Map<
    string,
    {
      part: Exclude<Part, { kind: 'ratchet' }>;
      axle: string;
      tier: number;
      x: number;
      y: number;
      radius: number;
    }
  >();
  const occupied = new Set<string>();
  for (const m of placement.parts) {
    const p = catalog.get(m.part),
      a = axles.get(m.axle);
    if (
      !p ||
      p.kind === 'ratchet' ||
      !a ||
      !Number.isInteger(m.tier) ||
      m.tier < 0 ||
      m.tier >= def.tiers
    ) {
      error(`Invalid mount: ${m.part}`);
      continue;
    }
    if (mounted.has(m.part) || occupied.has(`${m.axle}:${m.tier}`)) {
      error(`Occupied axle/tier or reused part: ${m.part}`);
      continue;
    }
    occupied.add(`${m.axle}:${m.tier}`);
    mounted.set(m.part, {
      part: p,
      axle: m.axle,
      tier: m.tier,
      x: a.x,
      y: a.y,
      radius: pitchRadius(p.kind, p.teeth),
    });
  }
  const ratchets = new Map<string, number>(),
    usedRatchets = new Set<string>();
  for (const r of placement.ratchets ?? []) {
    const p = catalog.get(r.part);
    if (
      !p ||
      p.kind !== 'ratchet' ||
      !mounted.has(r.mount) ||
      ratchets.has(r.mount) ||
      usedRatchets.has(r.part)
    ) {
      error(`Invalid ratchet: ${r.part}`);
      continue;
    }
    ratchets.set(r.mount, p.direction);
    usedRatchets.add(r.part);
  }
  const edges: Edge[] = [];
  for (const [id, m] of mounted) {
    edges.push({
      a: shaft(m.axle),
      b: port(id),
      ratio: 1,
      loss: 1,
      ...(ratchets.has(id)
        ? { gate: { port: port(id), sense: ratchets.get(id)! } }
        : {}),
    });
    if (
      m.tier === 0 &&
      (def.studs ?? []).some(
        (s) => Math.hypot(m.x - s.x, m.y - s.y) < m.radius + s.radius - EPS,
      )
    )
      error(`Stud blocks ${id}`);
  }
  const mounts = [...mounted.entries()];
  for (let i = 0; i < mounts.length; i++)
    for (let j = i + 1; j < mounts.length; j++) {
      const [idA, a] = mounts[i]!,
        [idB, b] = mounts[j]!;
      if (a.axle === b.axle || a.tier !== b.tier) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y),
        sum = a.radius + b.radius;
      const mesh =
        a.part.kind === 'gear' &&
        b.part.kind === 'gear' &&
        Math.abs(d - sum) <= 0.02 * sum + EPS;
      if (mesh)
        edges.push({
          a: port(idA),
          b: port(idB),
          ratio: -a.part.teeth / b.part.teeth,
          loss: 0.97,
        });
      else if (d < sum - EPS) error(`Overlap: ${idA}, ${idB}`);
    }
  const chainParts = new Set<string>();
  let linksUsed = 0,
    chainSize = 0,
    chainCount = 0;
  for (const chain of placement.chains ?? []) {
    const ms = chain.sprockets.map((id) => mounted.get(id));
    const linksValid = Number.isInteger(chain.links) && chain.links > 0;
    if (linksValid) linksUsed += chain.links;
    const valid =
      chain.sprockets.length >= 2 &&
      new Set(chain.sprockets).size === chain.sprockets.length &&
      ms.every((m) => m?.part.kind === 'sprocket' && m.tier === ms[0]?.tier) &&
      linksValid &&
      Number.isFinite(chain.tensioner) &&
      chain.tensioner >= 0 &&
      chain.tensioner <= 1 &&
      !chain.sprockets.some((id) => chainParts.has(id));
    const path = valid
      ? chainPath(ms.map((m) => ({ x: m!.x, y: m!.y, radius: m!.radius })))
      : null;
    if (!path) {
      error('Invalid chain route, tier, link count or tensioner');
      result.chains.push({
        length: 0,
        minimumLinks: 0,
        links: linksValid ? chain.links : 0,
        slack: 0,
        tension: 'invalid',
        path: null,
      });
      continue;
    }
    chain.sprockets.forEach((id) => chainParts.add(id));
    const slack =
      chain.links * CHAIN_PITCH -
      path.length -
      chain.tensioner * def.tension.takeUp;
    const tension =
      slack < def.tension.min - EPS
        ? 'tight'
        : slack > def.tension.max + EPS
          ? 'loose'
          : 'ok';
    result.chains.push({
      length: path.length,
      minimumLinks: Math.ceil(
        (path.length + def.tension.min - EPS) / CHAIN_PITCH,
      ),
      links: chain.links,
      slack,
      tension,
      path,
    });
    if (tension !== 'ok') error(`Chain ${tension}`);
    if (
      ms[0]!.tier === 0 &&
      (def.studs ?? []).some((s) => pathHitsStud(path, s))
    )
      error('Stud blocks chain');
    for (let i = 0; i < ms.length; i++) {
      const j = (i + 1) % ms.length;
      edges.push({
        a: port(chain.sprockets[i]!),
        b: port(chain.sprockets[j]!),
        ratio: ms[i]!.part.teeth / ms[j]!.part.teeth,
        loss: 0.98,
      });
      chainSize += ms[i]!.part.teeth;
      chainCount++;
    }
  }
  if (linksUsed > def.chainLinks) error('Chain link budget exceeded');
  result.chainLengthUsed = linksUsed * CHAIN_PITCH;
  const graph = new Map<
    string,
    { node: string; ratio: number; edge: Edge }[]
  >();
  for (const e of edges) {
    graph.set(e.a, [
      ...(graph.get(e.a) ?? []),
      { node: e.b, ratio: e.ratio, edge: e },
    ]);
    graph.set(e.b, [
      ...(graph.get(e.b) ?? []),
      { node: e.a, ratio: 1 / e.ratio, edge: e },
    ]);
  }
  const speeds = new Map<string, number>([[shaft(def.driver), 1]]),
    parents = new Map<string, string>();
  const queue = [shaft(def.driver)],
    active = new Set<Edge>();
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!,
      speed = speeds.get(current)!;
    for (const link of graph.get(current) ?? []) {
      const next = speed * link.ratio,
        gate = link.edge.gate;
      const gateSpeed = gate?.port === current ? speed : next;
      if (gate && gateSpeed * def.driverRpm * gate.sense <= 0) continue;
      active.add(link.edge);
      if (speeds.has(link.node)) {
        if (!close(speeds.get(link.node)!, next) && !result.seized) {
          result.seized = true;
          const ancestry = (n: string) => {
            const path = [n];
            while (parents.has(n)) {
              n = parents.get(n)!;
              path.push(n);
            }
            return path;
          };
          const a = ancestry(current),
            b = ancestry(link.node),
            shared = a.find((n) => b.includes(n))!;
          result.seizureLoop = [
            ...a.slice(0, a.indexOf(shared) + 1),
            ...b.slice(0, b.indexOf(shared)).reverse(),
            current,
          ];
        }
      } else {
        speeds.set(link.node, next);
        parents.set(link.node, current);
        queue.push(link.node);
      }
    }
  }
  for (const a of def.axles) {
    const ratio = speeds.get(shaft(a.id)) ?? null;
    result.ratios[a.id] = ratio;
    result.rpm[a.id] = ratio === null ? null : ratio * def.driverRpm;
    result.senses[a.id] = Math.sign(result.rpm[a.id] ?? 0) as Sense;
    if (ratio === null) result.idle.push(a.id);
  }
  for (const [id] of mounted)
    result.partRpm[id] = speeds.has(port(id))
      ? speeds.get(port(id))! * def.driverRpm
      : null;
  // Each driven mesh and chain span contributes once, even if two paths reach it.
  for (const e of active) result.efficiency *= e.loss;
  // Legal chains are coplanar. More/smaller wrap sprockets lower fatigue life.
  result.durability = chainCount
    ? Math.max(0.25, Math.min(2, chainSize / chainCount / 24))
    : 1;
  result.unmetGoals = def.goals
    .filter((g) => {
      const r = result.ratios[g.axle];
      return (
        r === null ||
        r === undefined ||
        result.senses[g.axle] !== g.sense ||
        Math.abs(Math.abs(r) - g.ratio) > g.tolerance + EPS
      );
    })
    .map((g) => g.axle);
  result.valid = result.errors.length === 0 && !result.seized;
  result.solved = result.valid && result.unmetGoals.length === 0;
  if (result.solved && def.context === 'bike') {
    const input = mounts.find(
      ([id, m]) => m.axle === def.driver && chainParts.has(id),
    );
    const output = mounts.find(
      ([id, m]) => m.axle === def.goals[0]?.axle && chainParts.has(id),
    );
    if (input && output) {
      // Equivalent final cog also represents compound gearing correctly.
      const ratio = Math.abs(result.ratios[output[1].axle]!);
      result.drivetrain = {
        chainring: input[1].part.teeth,
        cogs: [input[1].part.teeth / ratio],
        efficiency: result.efficiency,
        durability: result.durability,
      };
    }
  }
  return result;
}
