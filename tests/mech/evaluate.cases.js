import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  evaluate,
  chainPath,
  CHAIN_PITCH,
  pitchRadius,
} from '../../src/mech/index.ts';

const gear = (id, teeth = 20) => ({ id, kind: 'gear', teeth });
const sprocket = (id, teeth = 20) => ({ id, kind: 'sprocket', teeth });
const mount = (part, axle, tier = 0) => ({ part, axle, tier });
const base = (extra = {}) => ({
  id: 'test',
  context: 'engine',
  axles: [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 0.05, y: 0 },
  ],
  tiers: 2,
  tray: [gear('g1'), gear('g2')],
  driver: 'a',
  driverRpm: 60,
  goals: [{ axle: 'b', ratio: 1, sense: -1, tolerance: 0.01 }],
  chainLinks: 200,
  tension: { min: 0.001, max: 0.02, takeUp: 0.03 },
  ...extra,
});
const pair = () => ({ parts: [mount('g1', 'a'), mount('g2', 'b')] });
function chainFixture(teeth = [20, 40], distance = 0.3) {
  const def = base({
    context: 'bike',
    axles: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: distance, y: 0 },
    ],
    tray: [sprocket('s1', teeth[0]), sprocket('s2', teeth[1])],
    goals: [{ axle: 'b', ratio: teeth[0] / teeth[1], sense: 1, tolerance: 0 }],
  });
  const path = chainPath(
    def.axles.map((a, i) => ({
      ...a,
      radius: pitchRadius('sprocket', teeth[i]),
    })),
  );
  const links = Math.ceil((path.length + def.tension.min) / CHAIN_PITCH);
  const placement = {
    parts: [mount('s1', 'a'), mount('s2', 'b')],
    chains: [{ sprockets: ['s1', 's2'], links, tensioner: 0 }],
  };
  return { def, placement, path };
}

test('single mesh reverses sense and preserves equal ratio', () => {
  const e = evaluate(base(), pair());
  assert.equal(e.solved, true);
  assert.equal(e.rpm.b, -60);
  assert.equal(e.ratios.b, -1);
});
test('unequal mesh uses tooth counts', () => {
  const d = base({
    tray: [gear('g1', 10), gear('g2', 30)],
    goals: [{ axle: 'b', ratio: 1 / 3, sense: -1, tolerance: 0 }],
  });
  assert.equal(evaluate(d, pair()).solved, true);
});
for (const delta of [-0.02, 0.02])
  test(`mesh includes ${delta * 100}% distance tolerance`, () => {
    const d = base();
    d.axles[1].x *= 1 + delta;
    assert.equal(evaluate(d, pair()).solved, true);
  });
test('outside positive mesh tolerance is idle', () => {
  const d = base();
  d.axles[1].x *= 1.0201;
  assert.deepEqual(evaluate(d, pair()).idle, ['b']);
});
test('outside negative mesh tolerance is overlap', () => {
  const d = base();
  d.axles[1].x *= 0.9799;
  assert.match(evaluate(d, pair()).errors.join(), /Overlap/);
});
test('different tiers do not mesh', () => {
  const p = pair();
  p.parts[1].tier = 1;
  assert.equal(evaluate(base(), p).ratios.b, null);
});
test('compound train rigidly couples tiers and multiplies ratios', () => {
  const d = base({
    axles: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 0.075, y: 0 },
      { id: 'c', x: 0.125, y: 0 },
    ],
    tray: [gear('g1', 20), gear('g2', 40), gear('g3', 10), gear('g4', 30)],
    goals: [{ axle: 'c', ratio: 1 / 6, sense: 1, tolerance: 0 }],
  });
  const p = {
    parts: [
      mount('g1', 'a'),
      mount('g2', 'b'),
      mount('g3', 'b', 1),
      mount('g4', 'c', 1),
    ],
  };
  const e = evaluate(d, p);
  assert.equal(e.solved, true);
  assert.equal(e.ratios.c, 1 / 6);
  assert.ok(Math.abs(e.efficiency - 0.97 ** 2) < 1e-12);
});
test('unconnected parts are idle, not errors', () => {
  const e = evaluate(base(), { parts: [mount('g2', 'b')] });
  assert.equal(e.valid, true);
  assert.equal(e.solved, false);
  assert.deepEqual(e.idle, ['b']);
});
test('duplicate physical part cannot be reused', () => {
  assert.equal(
    evaluate(base(), { parts: [mount('g1', 'a'), mount('g1', 'b')] }).valid,
    false,
  );
});
test('two parts cannot occupy one tier on an axle', () => {
  assert.equal(
    evaluate(base(), { parts: [mount('g1', 'a'), mount('g2', 'a')] }).valid,
    false,
  );
});
test('unknown part cannot be mounted', () => {
  assert.equal(
    evaluate(base(), { parts: [mount('missing', 'a')] }).valid,
    false,
  );
});
test('unknown axle cannot be used', () => {
  assert.equal(
    evaluate(base(), { parts: [mount('g1', 'missing')] }).valid,
    false,
  );
});
for (const tier of [-1, 2, 0.5])
  test(`invalid tier ${tier} rejected`, () => {
    assert.equal(
      evaluate(base(), { parts: [mount('g1', 'a', tier)] }).valid,
      false,
    );
  });
test('inventory parts can be used', () => {
  const d = base({ tray: [gear('g1')] });
  assert.equal(
    evaluate(d, { ...pair(), inventory: [gear('g2')] }).solved,
    true,
  );
});
test('inventory IDs cannot override tray', () => {
  assert.equal(
    evaluate(base(), { ...pair(), inventory: [gear('g1', 80)] }).valid,
    false,
  );
});
test('gear radius follows module 2.5mm', () => {
  assert.equal(pitchRadius('gear', 40), 0.05);
});
test('sprocket radius follows 12.7mm pitch', () => {
  assert.equal(
    pitchRadius('sprocket', 20),
    0.0127 / (2 * Math.sin(Math.PI / 20)),
  );
});
test('equal sprocket path is two tangents plus full circumference', () => {
  const r = 0.04,
    d = 0.3;
  const p = chainPath([
    { x: 0, y: 0, radius: r },
    { x: d, y: 0, radius: r },
  ]);
  assert.ok(Math.abs(p.length - (2 * d + 2 * Math.PI * r)) < 1e-12);
});
test('unequal sprocket path has exact tangent and wrap lengths', () => {
  const a = 0.04,
    b = 0.08,
    d = 0.3,
    theta = Math.asin((b - a) / d);
  const p = chainPath([
    { x: 0, y: 0, radius: a },
    { x: d, y: 0, radius: b },
  ]);
  assert.ok(
    Math.abs(
      p.length -
        (2 * Math.sqrt(d * d - (b - a) ** 2) +
          Math.PI * (a + b) +
          2 * theta * (b - a)),
    ) < 1e-12,
  );
});
test('chain preserves sense and tooth ratio', () => {
  const { def, placement } = chainFixture();
  const e = evaluate(def, placement);
  assert.equal(e.solved, true);
  assert.equal(e.ratios.b, 0.5);
});
test('whole links round upwards', () => {
  const { def, placement, path } = chainFixture();
  assert.equal(
    evaluate(def, placement).chains[0].minimumLinks,
    Math.ceil((path.length + def.tension.min) / CHAIN_PITCH),
  );
});
test('link length used includes slack', () => {
  const { def, placement } = chainFixture();
  assert.equal(
    evaluate(def, placement).chainLengthUsed,
    placement.chains[0].links * CHAIN_PITCH,
  );
});
test('short chain is tight', () => {
  const { def, placement } = chainFixture();
  placement.chains[0].links--;
  assert.equal(evaluate(def, placement).chains[0].tension, 'tight');
});
test('long chain is loose', () => {
  const { def, placement } = chainFixture();
  placement.chains[0].links += 4;
  assert.equal(evaluate(def, placement).chains[0].tension, 'loose');
});
test('tensioner removes available slack', () => {
  const { def, placement } = chainFixture();
  placement.chains[0].tensioner = 1;
  assert.equal(evaluate(def, placement).chains[0].tension, 'tight');
});
for (const edge of ['min', 'max'])
  test(`tension ${edge} boundary is inclusive`, () => {
    const { def, placement, path } = chainFixture();
    const slack = placement.chains[0].links * CHAIN_PITCH - path.length;
    def.tension[edge] = slack;
    if (edge === 'max') def.tension.min = 0;
    assert.equal(evaluate(def, placement).chains[0].tension, 'ok');
  });
test('fractional chain links rejected', () => {
  const { def, placement } = chainFixture();
  placement.chains[0].links += 0.1;
  assert.equal(evaluate(def, placement).valid, false);
});
test('link budget is enforced', () => {
  const { def, placement } = chainFixture();
  def.chainLinks = 1;
  assert.match(evaluate(def, placement).errors.join(), /budget/);
});
test('cross-tier chain is illegal', () => {
  const { def, placement } = chainFixture();
  placement.parts[1].tier = 1;
  assert.equal(evaluate(def, placement).chains[0].tension, 'invalid');
});
test('gears cannot be chain endpoints', () => {
  const d = base();
  assert.equal(
    evaluate(d, {
      ...pair(),
      chains: [{ sprockets: ['g1', 'g2'], links: 10, tensioner: 0 }],
    }).valid,
    false,
  );
});
test('repeated sprocket in a route is illegal', () => {
  const { def, placement } = chainFixture();
  placement.chains[0].sprockets.push('s1');
  assert.equal(evaluate(def, placement).valid, false);
});
test('same sprocket cannot carry two chains in one tier', () => {
  const { def, placement } = chainFixture();
  placement.chains.push({ ...placement.chains[0] });
  assert.equal(evaluate(def, placement).valid, false);
});
test('overlapping sprockets cannot have external chain', () => {
  assert.equal(
    chainPath([
      { x: 0, y: 0, radius: 0.1 },
      { x: 0.1, y: 0, radius: 0.1 },
    ]),
    null,
  );
});
test('three-sprocket idler loop has consistent direction independent of ordering', () => {
  const cs = [
    { x: 0, y: 0, radius: 0.03 },
    { x: 0.3, y: 0, radius: 0.03 },
    { x: 0.15, y: 0.2, radius: 0.02 },
  ];
  assert.ok(
    Math.abs(chainPath(cs).length - chainPath([...cs].reverse()).length) <
      1e-12,
  );
});
test('concave or crossed external chain route is rejected', () => {
  assert.equal(
    chainPath([
      { x: 0, y: 0, radius: 0.01 },
      { x: 0.3, y: 0.3, radius: 0.01 },
      { x: 0, y: 0.3, radius: 0.01 },
      { x: 0.3, y: 0, radius: 0.01 },
    ]),
    null,
  );
});
test('stud blocks lower gear', () => {
  const d = base({ studs: [{ x: 0.01, y: 0, radius: 0.003 }] });
  assert.match(evaluate(d, pair()).errors.join(), /Stud/);
});
test('stud leaves upper tier available', () => {
  const d = base({ studs: [{ x: 0.01, y: 0, radius: 0.003 }] });
  const p = pair();
  p.parts.forEach((m) => (m.tier = 1));
  assert.equal(evaluate(d, p).solved, true);
});
test('stud blocks tangent chain segment', () => {
  const { def, placement, path } = chainFixture();
  const seg = path.segments[0];
  def.studs = [
    {
      x: (seg.from.x + seg.to.x) / 2,
      y: (seg.from.y + seg.to.y) / 2,
      radius: 0.005,
    },
  ];
  assert.match(evaluate(def, placement).errors.join(), /Stud blocks chain/);
});
test('ratchet transmits its allowed absolute sense', () => {
  const d = base();
  d.tray.push({ id: 'r', kind: 'ratchet', direction: -1 });
  const e = evaluate(d, { ...pair(), ratchets: [{ part: 'r', mount: 'g2' }] });
  assert.equal(e.solved, true);
});
test('ratchet freewheels in opposite sense', () => {
  const d = base();
  d.tray.push({ id: 'r', kind: 'ratchet', direction: 1 });
  const e = evaluate(d, { ...pair(), ratchets: [{ part: 'r', mount: 'g2' }] });
  assert.equal(e.ratios.b, null);
  assert.equal(e.partRpm.g2, -60);
  assert.equal(e.valid, true);
});
test('reversing driver engages opposite ratchet', () => {
  const d = base({
    driverRpm: -60,
    goals: [{ axle: 'b', ratio: 1, sense: 1, tolerance: 0 }],
  });
  d.tray.push({ id: 'r', kind: 'ratchet', direction: 1 });
  assert.equal(
    evaluate(d, { ...pair(), ratchets: [{ part: 'r', mount: 'g2' }] }).solved,
    true,
  );
});
test('ratchet instance cannot be reused', () => {
  const d = base();
  d.tray.push({ id: 'r', kind: 'ratchet', direction: 1 });
  assert.equal(
    evaluate(d, {
      ...pair(),
      ratchets: [
        { part: 'r', mount: 'g1' },
        { part: 'r', mount: 'g2' },
      ],
    }).valid,
    false,
  );
});
test('three externally meshing gears seize with an odd sense loop', () => {
  const d = base({
    axles: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 0.05, y: 0 },
      { id: 'c', x: 0.025, y: Math.sqrt(3) * 0.025 },
    ],
    tray: [gear('g1'), gear('g2'), gear('g3')],
  });
  const e = evaluate(d, { parts: [...pair().parts, mount('g3', 'c')] });
  assert.equal(e.seized, true);
  assert.equal(e.solved, false);
  assert.equal(e.seizureLoop[0], e.seizureLoop.at(-1));
  assert.ok(e.seizureLoop.length >= 4);
});
test('compound paths with incompatible ratios seize', () => {
  const d = base({
    tray: [gear('g1', 20), gear('g2', 20), gear('g3', 10), gear('g4', 30)],
  });
  const e = evaluate(d, {
    parts: [...pair().parts, mount('g3', 'a', 1), mount('g4', 'b', 1)],
  });
  assert.equal(e.seized, true);
});
test('redundant paths with consistent ratios do not seize', () => {
  const d = base({ tray: [gear('g1'), gear('g2'), gear('g3'), gear('g4')] });
  assert.equal(
    evaluate(d, {
      parts: [...pair().parts, mount('g3', 'a', 1), mount('g4', 'b', 1)],
    }).solved,
    true,
  );
});
test('mesh and chain enforcing opposite directions seize', () => {
  const { def, placement } = chainFixture([10, 10], 0.1);
  def.tray.push(gear('g1', 40), gear('g2', 40));
  placement.parts.push(mount('g1', 'a', 1), mount('g2', 'b', 1));
  assert.equal(evaluate(def, placement).seized, true);
});
test('ratchet may disconnect an otherwise inconsistent path', () => {
  const d = base({
    tray: [
      gear('g1'),
      gear('g2'),
      gear('g3', 10),
      gear('g4', 30),
      { id: 'r', kind: 'ratchet', direction: 1 },
    ],
  });
  const p = {
    parts: [...pair().parts, mount('g3', 'a', 1), mount('g4', 'b', 1)],
    ratchets: [{ part: 'r', mount: 'g4' }],
  };
  assert.equal(evaluate(d, p).solved, true);
});
test('absolute ratio tolerance edge passes', () => {
  const d = base({
    goals: [{ axle: 'b', ratio: 0.9, sense: -1, tolerance: 0.1 }],
  });
  assert.equal(evaluate(d, pair()).solved, true);
});
test('outside ratio tolerance fails', () => {
  const d = base({
    goals: [{ axle: 'b', ratio: 0.899, sense: -1, tolerance: 0.1 }],
  });
  assert.deepEqual(evaluate(d, pair()).unmetGoals, ['b']);
});
test('correct magnitude with wrong sense fails', () => {
  const d = base();
  d.goals[0].sense = 1;
  assert.equal(evaluate(d, pair()).solved, false);
});
test('efficiency charges two chain spans once', () => {
  const { def, placement } = chainFixture();
  assert.ok(Math.abs(evaluate(def, placement).efficiency - 0.98 ** 2) < 1e-12);
});
test('larger sprockets increase durability', () => {
  const a = chainFixture([12, 12]),
    b = chainFixture([32, 32]);
  assert.ok(
    evaluate(b.def, b.placement).durability >
      evaluate(a.def, a.placement).durability,
  );
});
test('legal bike output includes drivetrain spec', () => {
  const { def, placement } = chainFixture();
  const spec = evaluate(def, placement).drivetrain;
  assert.equal(spec.chainring, 20);
  assert.deepEqual(spec.cogs, [40]);
});
test('illegal bike never exports drivetrain', () => {
  const { def, placement } = chainFixture();
  placement.chains[0].links = 1;
  assert.equal(evaluate(def, placement).drivetrain, null);
});
test('evaluate is deterministic and does not mutate inputs', () => {
  const { def, placement } = chainFixture();
  const before = JSON.stringify({ def, placement });
  assert.deepEqual(evaluate(def, placement), evaluate(def, placement));
  assert.equal(JSON.stringify({ def, placement }), before);
});
for (const rpm of [0, NaN, Infinity])
  test(`invalid driver speed ${rpm} rejected`, () => {
    assert.equal(evaluate(base({ driverRpm: rpm }), pair()).valid, false);
  });
test('duplicate axle IDs rejected', () => {
  const d = base();
  d.axles.push({ ...d.axles[0] });
  assert.equal(evaluate(d, pair()).valid, false);
});
test('non-integer tooth count rejected', () => {
  const d = base();
  d.tray[0].teeth = 20.5;
  assert.equal(evaluate(d, pair()).valid, false);
});
test('invalid tension range rejected', () => {
  const d = base();
  d.tension.min = 2;
  assert.equal(evaluate(d, pair()).valid, false);
});
test('NaN tensioner rejected', () => {
  const { def, placement } = chainFixture();
  placement.chains[0].tensioner = NaN;
  assert.equal(evaluate(def, placement).valid, false);
});
