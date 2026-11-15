import test from 'node:test';
import assert from 'node:assert/strict';
import { createOcean } from '../../src/sea/index.js';

function seeded(seed = 42) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

// Independent reference: converge horizontal inversion to machine precision.
function reference(ocean, x, z) {
  let u = x, v = z;
  for (let iteration = 0; iteration < 100; iteration++) {
    let dx = 0, dz = 0;
    for (const wave of ocean.waves) {
      const theta = 2 * Math.PI / wave.wavelength * (wave.direction.x * u + wave.direction.z * v) - wave.phase + wave.offset;
      const displacement = wave.steepness * wave.amplitude * Math.cos(theta);
      dx += wave.direction.x * displacement;
      dz += wave.direction.z * displacement;
    }
    u = x - dx;
    v = z - dz;
  }
  return ocean.waves.reduce((height, wave) => height + wave.amplitude * Math.sin(
    2 * Math.PI / wave.wavelength * (wave.direction.x * u + wave.direction.z * v) - wave.phase + wave.offset), 0);
}

test('two-pass height inversion agrees with converged reference within 1 cm', () => {
  const random = seeded(17);
  for (const storm of [0, 0.25, 0.5, 0.75, 1]) {
    const ocean = createOcean({ storm, windHeading: 0.7 }, seeded());
    for (let i = 0; i < 200; i++) {
      ocean.update(0.37);
      const x = random() * 2000 - 1000;
      const z = random() * 2000 - 1000;
      assert.ok(Math.abs(ocean.height(x, z) - reference(ocean, x, z)) < 0.01);
    }
  }
});

test('sea energy rises with storm and reaches the specified significant heights', () => {
  let previous = 0;
  for (let i = 0; i <= 100; i++) {
    const ocean = createOcean({ storm: i / 100 }, seeded());
    assert.ok(ocean.significantHeight > previous);
    previous = ocean.significantHeight;
  }
  for (const [storm, target] of [[0, 0.4], [0.5, 1.2], [1, 3]]) {
    assert.ok(Math.abs(createOcean({ storm }, seeded()).significantHeight - target) < 1e-12);
  }
});

test('storm changes relax over ten seconds while the phase clock keeps running', () => {
  const env = { storm: 0 };
  const ocean = createOcean(env, seeded());
  const before = ocean.height(13, -9);
  env.storm = 1;
  assert.equal(ocean.height(13, -9), before);
  const phases = ocean.waves.map(wave => wave.phase);
  ocean.update(1 / 60);
  assert.ok(Math.abs(ocean.height(13, -9) - before) < 0.02);
  assert.ok(ocean.waves.every((wave, i) => wave.phase > phases[i]));
  ocean.update(10 - 1 / 60);
  assert.ok(Math.abs(ocean.significantHeight - (3 - 2.6 / Math.E)) < 1e-12);
  assert.equal(ocean.time, 10);
});

test('normals match surface derivatives and orbital velocity matches material motion', () => {
  const ocean = createOcean({ storm: 1 }, seeded());
  ocean.update(3);
  const epsilon = 0.0001;
  const x = 14, z = -8;
  const sample = ocean.sample(x, z);
  const dx = (reference(ocean, x + epsilon, z) - reference(ocean, x - epsilon, z)) / (2 * epsilon);
  const dz = (reference(ocean, x, z + epsilon) - reference(ocean, x, z - epsilon)) / (2 * epsilon);
  const length = Math.hypot(dx, 1, dz);
  assert.ok(Math.abs(sample.normal.x + dx / length) < 0.0001);
  assert.ok(Math.abs(sample.normal.z + dz / length) < 0.0001);
  // Recover the material coordinate for this sample independently.
  let u = x, v = z;
  for (let i = 0; i < 100; i++) {
    let dx = 0, dz = 0;
    for (const w of ocean.waves) {
      const phase = 2 * Math.PI / w.wavelength * (w.direction.x * u + w.direction.z * v) - w.phase + w.offset;
      dx += w.steepness * w.amplitude * w.direction.x * Math.cos(phase);
      dz += w.steepness * w.amplitude * w.direction.z * Math.cos(phase);
    }
    u = x - dx; v = z - dz;
  }
  function position(delta) {
    const p = { x: u, y: 0, z: v };
    for (const w of ocean.waves) {
      const k = 2 * Math.PI / w.wavelength;
      const phase = k * (w.direction.x * u + w.direction.z * v) - w.phase + w.offset - Math.sqrt(9.81 * k) * delta;
      p.x += w.steepness * w.amplitude * w.direction.x * Math.cos(phase);
      p.y += w.amplitude * Math.sin(phase);
      p.z += w.steepness * w.amplitude * w.direction.z * Math.cos(phase);
    }
    return p;
  }
  const earlier = position(-epsilon), later = position(epsilon);
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(sample.velocity[axis] - (later[axis] - earlier[axis]) / (2 * epsilon)) < 0.0001);
});

test('ten-minute changing storm remains finite, deterministic and normalized', () => {
  const env = { storm: 0, windSpeed: 7 };
  const a = createOcean(env, seeded()), b = createOcean(env, seeded());
  const out = { normal: {}, velocity: {} };
  for (let frame = 0; frame < 600 * 60; frame++) {
    env.storm = 0.5 + 0.5 * Math.sin(frame / 600);
    a.update(1 / 60); b.update(1 / 60);
    assert.equal(a.sample(frame / 60, -frame / 120, out), out);
    assert.ok([out.height, ...Object.values(out.normal), ...Object.values(out.velocity)].every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...Object.values(out.normal)) - 1) < 1e-12);
    assert.equal(out.height, b.height(frame / 60, -frame / 120));
  }
  assert.deepEqual(a.waves, b.waves);
});

test('whitecaps clamp to wind range and invalid simulation input is rejected', () => {
  const env = { storm: 0, windSpeed: 0 };
  const ocean = createOcean(env, seeded());
  for (const [speed, expected] of [[0, 0], [7, 0], [13.5, 0.5], [20, 1], [26, 1]]) {
    env.windSpeed = speed;
    assert.equal(ocean.whitecaps, expected);
  }
  assert.throws(() => ocean.update(-1), RangeError);
  assert.throws(() => ocean.update(NaN), TypeError);
  assert.throws(() => ocean.height(Infinity, 0), TypeError);
  assert.throws(() => createOcean({ storm: NaN }), TypeError);
  assert.throws(() => createOcean({ storm: 0 }, () => 1), RangeError);
});
