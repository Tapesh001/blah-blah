import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  BIKE,
  STOCK_DRIVETRAIN,
  createBike,
  stepBike,
  stateHash,
  flatWorld,
  grip,
  cornerDemand,
  lateralCapacity,
} from '../../src/land/index.ts';
const run = (s, frames, input = {}, world = flatWorld) => {
  const events = [];
  for (let i = 0; i < frames; i++)
    events.push(
      ...stepBike(s, typeof input === 'function' ? input(i) : input, world),
    );
  return events;
};
const speed = (s) => Math.hypot(s.velocity.x, s.velocity.z);
const finite = (value) =>
  typeof value === 'number'
    ? Number.isFinite(value)
    : typeof value === 'object' && value !== null
      ? Object.values(value).every(finite)
      : true;

test('stationary springs carry rider weight without drift', () => {
  const s = createBike();
  run(s, 600);
  assert.ok(Math.abs(s.position.y - BIKE.height) < 0.001);
  assert.ok(
    Math.abs(s.normalLoad[0] + s.normalLoad[1] - BIKE.mass * BIKE.gravity) <
      0.1,
  );
  assert.equal(speed(s), 0);
});
test('flat tarmac coast-down stops from 10m/s in 250–400m', () => {
  const s = createBike();
  s.velocity.x = 10;
  for (let i = 0; i < 36000 && speed(s) > 0.001; i++) stepBike(s, {});
  assert.ok(speed(s) < 0.001);
  assert.ok(
    s.distance >= 250 && s.distance <= 400,
    `coast distance ${s.distance}`,
  );
});
test('headwind lowers flat top speed; tailwind raises it', () => {
  const top = (wind) => {
    const s = createBike();
    run(
      s,
      18000,
      { throttle: 1 },
      { ...flatWorld, wind: () => ({ x: wind, y: 0, z: 0 }) },
    );
    return speed(s);
  };
  const head = top(-5),
    calm = top(0),
    tail = top(5);
  assert.ok(calm - head > 1, `${head}, ${calm}`);
  assert.ok(tail - calm > 1, `${calm}, ${tail}`);
});
test('crosswind causes lateral displacement', () => {
  const s = createBike();
  run(s, 600, {}, { ...flatWorld, wind: () => ({ x: 0, y: 0, z: 5 }) });
  assert.ok(s.position.z > 0.02);
});
test('tuck reduces aerodynamic resistance', () => {
  const a = createBike(),
    b = createBike();
  a.velocity.x = b.velocity.x = 10;
  run(a, 600);
  run(b, 600, { run: true });
  assert.ok(speed(b) > speed(a));
});
test('negative throttle brakes without reversing', () => {
  const s = createBike();
  s.velocity.x = 8;
  run(s, 600, { throttle: -1 });
  assert.ok(Math.abs(s.velocity.x) < 0.01);
  assert.ok(s.position.x >= 0);
});
test('drive conserves power across different ratios', () => {
  const s = createBike();
  s.velocity.x = 5;
  stepBike(s, { throttle: 1 });
  assert.ok(s.torque <= 90);
  assert.ok(s.cadence > 0);
  assert.ok(s.velocity.x > 5);
});
test('broken chain cannot propel bike', () => {
  const s = createBike();
  s.chainWear = 1;
  run(s, 300, { throttle: 1 });
  assert.equal(speed(s), 0);
});
test('sprinting consumes reserve and reserve recovers', () => {
  const s = createBike();
  run(s, 180, { throttle: 1, sprint: true });
  assert.ok(s.stamina < 0.5);
  run(s, 600);
  assert.equal(s.stamina, 1);
});
test('downhill slope accelerates a coasting bike', () => {
  const slope = -0.08,
    n = Math.hypot(slope, 1);
  const world = {
    ...flatWorld,
    sample: (x) => ({
      height: slope * x,
      normal: { x: -slope / n, y: 1 / n, z: 0 },
      surface: 'tarmac',
      wetness: 0,
    }),
  };
  const s = createBike();
  s.pitch = Math.atan(slope);
  run(s, 600, {}, world);
  assert.ok(s.velocity.x > 3);
  assert.ok(s.position.y >= world.sample(s.position.x).height);
});
test('uphill slows a moving bike', () => {
  const slope = 0.06,
    n = Math.hypot(slope, 1);
  const s = createBike();
  s.velocity.x = 8;
  s.pitch = Math.atan(slope);
  run(
    s,
    180,
    {},
    {
      ...flatWorld,
      sample: (x) => ({
        height: x * slope,
        normal: { x: -slope / n, y: 1 / n, z: 0 },
        surface: 'tarmac',
        wetness: 0,
      }),
    },
  );
  assert.ok(speed(s) < 7);
});
for (const surface of ['tarmac', 'wood', 'gravel', 'grass', 'sand', 'mud'])
  test(`${surface}: circle holds at grip limit and 10% faster overloads`, () => {
    const mu = grip(surface, 0.5),
      radius = 15,
      atLimit = Math.sqrt(mu * BIKE.gravity * radius),
      steer = Math.atan(BIKE.wheelbase / radius);
    assert.equal(cornerDemand(atLimit, steer, mu).holds, true);
    assert.equal(cornerDemand(atLimit * 1.1, steer, mu).holds, false);
  });
test('braking consumes lateral friction budget', () => {
  assert.equal(lateralCapacity(0.5, 100, 50), 0);
  assert.ok(lateralCapacity(0.5, 100, 30) < lateralCapacity(0.5, 100, 0));
});
test('wet wood has half the dry grip', () => {
  assert.equal(grip('wood', 1), grip('wood', 0) / 2);
});
test('assist exposes a smaller lean limit on wet wood', () => {
  const a = createBike(),
    b = createBike();
  stepBike(a, { steer: 1 });
  stepBike(
    b,
    { steer: 1 },
    {
      ...flatWorld,
      sample: () => ({ ...flatWorld.sample(), surface: 'wood', wetness: 1 }),
    },
  );
  assert.ok(b.targetLean < a.targetLean);
});
test('controller countersteers before leaning into a turn', () => {
  const s = createBike();
  s.velocity.x = 8;
  stepBike(s, { steer: 0.4 });
  assert.ok(s.steer < 0);
  assert.ok(s.lean > 0);
});
test('low-speed foot stabiliser prevents uncontrolled tipping', () => {
  const s = createBike();
  run(s, 900, { steer: 1 });
  assert.equal(s.crashes, 0);
  assert.ok(Math.abs(s.lean) < 0.1);
});
test('hop preloads, flies, lands, and does not repeat when held', () => {
  const s = createBike();
  run(s, 30);
  const events = run(s, 300, { jump: true });
  assert.equal(events.filter((e) => e.type === 'bike:hop').length, 1);
  assert.ok(events.some((e) => e.type === 'bike:landing'));
  assert.ok(s.grounded.some(Boolean));
  assert.equal(s.crashes, 0);
});
test('airborne bike follows gravity with no tyre load', () => {
  const s = createBike({ y: 8 });
  stepBike(s, {});
  assert.deepEqual(s.normalLoad, [0, 0]);
  assert.ok(s.velocity.y < 0);
  assert.ok(s.position.y < 8);
});
test('hard landing emits crash once then respawns after tumble', () => {
  const s = createBike();
  s.position.y = 6;
  const events = run(s, 300);
  assert.ok(events.some((e) => e.type === 'bike:crash'));
  assert.ok(events.some((e) => e.type === 'bike:respawn'));
  assert.equal(s.crashes, 1);
  assert.ok(s.chainWear > 0);
});
test('solid hit triggers crash and uses last safe point', () => {
  const s = createBike();
  const events = stepBike(s, {}, { ...flatWorld, solidHit: () => true });
  assert.equal(events.filter((e) => e.type === 'bike:crash').length, 1);
  run(s, 90);
  assert.equal(s.crashTimer, 0);
});
test('raycast prop becomes wheel support', () => {
  const s = createBike({ y: BIKE.height + 0.3 });
  stepBike(
    s,
    {},
    { ...flatWorld, raycast: () => ({ ...flatWorld.sample(), height: 0.3 }) },
  );
  assert.ok(s.normalLoad.every((n) => n > 0));
});
test('scripted six alternating bends replay deterministically without assist crashes', () => {
  const replay = (i) => ({
    throttle: i % 600 < 440 ? 0.65 : -0.25,
    steer:
      i < 300 || i >= 2100 ? 0 : Math.sin(((i - 300) / 300) * Math.PI) * 0.45,
    assist: true,
  });
  const a = createBike(),
    b = createBike();
  run(a, 2400, replay);
  run(b, 2400, replay);
  assert.equal(stateHash(a), stateHash(b));
  assert.equal(a.crashes, 0);
  assert.ok(a.distance > 100);
});
test('ten minute seeded storm soak remains finite and above ground', () => {
  let seed = 12345;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
  const world = {
    sample: (x, z) => {
      const dx = 0.04 * Math.cos(x / 30),
        dz = 0.02 * Math.cos(z / 20),
        n = Math.hypot(dx, 1, dz);
      return {
        height: 1.2 * Math.sin(x / 30) + 0.4 * Math.sin(z / 20),
        normal: { x: -dx / n, y: 1 / n, z: -dz / n },
        surface: 'wood',
        wetness: 1,
      };
    },
    wind: (x, y, z, t) => ({
      x: 12 * Math.sin(t * 0.7),
      y: 0,
      z: 15 + 8 * Math.sin(t * 0.3),
    }),
  };
  const s = createBike();
  let input = {};
  for (let i = 0; i < 36000; i++) {
    if (i % 45 === 0)
      input = {
        throttle: random() * 2 - 0.6,
        steer: random() * 2 - 1,
        jump: random() < 0.08,
        sprint: random() < 0.2,
      };
    stepBike(s, input, world);
    assert.ok(finite(s), `non-finite frame ${i}`);
    assert.ok(
      s.position.y >= world.sample(s.position.x, s.position.z).height,
      `below ground ${i}`,
    );
  }
});
test('bad timestep is rejected', () => {
  for (const dt of [0, -1, NaN, 1])
    assert.throws(
      () => stepBike(createBike(), {}, flatWorld, STOCK_DRIVETRAIN, dt),
      RangeError,
    );
});
test('bad drivetrain is rejected', () => {
  assert.throws(
    () =>
      stepBike(createBike(), {}, flatWorld, { ...STOCK_DRIVETRAIN, cogs: [] }),
    RangeError,
  );
});
test('non-finite player inputs are neutralised', () => {
  const s = createBike();
  stepBike(s, { throttle: NaN, steer: Infinity });
  assert.ok(finite(s));
  assert.equal(s.targetLean, 0);
});
