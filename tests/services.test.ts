import { it, expect, vi } from 'vitest';
import { StubWind } from '../src/core/stubs/wind';
import { StubTerrain } from '../src/core/stubs/terrain';
import { StubOcean } from '../src/core/stubs/ocean';
import { StubBench } from '../src/core/stubs/index';
import { WORLD } from '../src/contracts';
import { createEnvironment, advanceEnvironment } from '../src/core/env';
import { parseOptions } from '../src/game/options';
it('bakes RGB velocity at exact texel centres, reusing the buffer', () => {
  const wind = new StubWind(),
    grid = wind.bake({ x: 70, y: 0, z: -20 }, 12);
  expect(grid.data.length).toBe(64 * 64 * 3);
  for (let z = 0; z < 64; z++)
    for (let x = 0; x < 64; x++) {
      const v = wind.sample(
          {
            x: grid.origin.x + (x + 0.5) * 8,
            y: 10,
            z: grid.origin.z + (z + 0.5) * 8,
          },
          12,
        ),
        i = (z * 64 + x) * 3;
      expect(grid.data[i]).toBeCloseTo(v.x, 5);
      expect(grid.data[i + 1]).toBe(0);
      expect(grid.data[i + 2]).toBe(v.z);
    }
  expect(wind.bake({ x: 0, y: 0, z: 0 }, 13).data).toBe(grid.data);
});
it('advects the gust downwind deterministically', () => {
  const wind = new StubWind();
  expect(wind.sample({ x: 0, y: 10, z: 0 }, 0)).toEqual(
    wind.sample({ x: 80, y: 10, z: 0 }, 10),
  );
});
it('keeps two original island cones with sea elsewhere', () => {
  const terrain = new StubTerrain(7);
  for (const island of WORLD.islands)
    expect(terrain.height(island.x, island.z)).toBeGreaterThan(20);
  expect(terrain.height(3000, 3000)).toBe(-12);
  expect(terrain.height(7, 9)).toBe(new StubTerrain(7).height(7, 9));
  const n = terrain.normal(-160, 80);
  expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1);
});
it('keeps ocean samples finite with normal matching world-space derivatives', () => {
  const ocean = new StubOcean();
  for (let time = 0; time <= 600; time++) {
    const sample = ocean.sample(33, 51, time);
    expect(Object.values(sample.velocity).every(Number.isFinite)).toBe(true);
    expect(
      Math.hypot(sample.normal.x, sample.normal.y, sample.normal.z),
    ).toBeCloseTo(1);
    expect(Math.abs(sample.height)).toBeLessThan(0.67);
  }
  const p = ocean.sample(33, 51, 4),
    epsilon = 0.001;
  const dx =
    (ocean.sample(33 + epsilon, 51, 4).height -
      ocean.sample(33 - epsilon, 51, 4).height) /
    (2 * epsilon);
  expect(-p.normal.x / p.normal.y).toBeCloseTo(dx, 5);
});
it('resolves the placeholder bench after one second and supports cancellation', async () => {
  vi.useFakeTimers();
  try {
    const bench = new StubBench(),
      done = vi.fn();
    const result = bench.solve().then(done);
    await vi.advanceTimersByTimeAsync(999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(done).toHaveBeenCalledWith({ solved: true });
    const controller = new AbortController();
    const pending = bench.solve(controller.signal);
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    controller.abort();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it('parses requested deep links and rejects invalid values', () => {
  expect(
    parseOptions('?chapter=sail&cp=squall&storm=0.8&q=low&seed=7'),
  ).toEqual({
    chapter: 'sail',
    checkpoint: 'squall',
    storm: 0.8,
    quality: 'low',
    seed: '7',
  });
  expect(parseOptions('?chapter=no&storm=NaN&q=ultra').chapter).toBe('title');
  expect(parseOptions('?storm=Infinity').storm).toBeNull();
  expect(parseOptions('?storm=9').storm).toBe(1);
});
it('advances a provisional environment with finite wetness and manual overrides', () => {
  const env = createEnvironment();
  for (let i = 0; i < 36000; i++) advanceEnvironment(env, 1 / 60, 0, 1);
  expect(env.time).toBeCloseTo(600);
  expect(env.storm).toBe(1);
  expect(env.wetness).toBeGreaterThan(0.99);
  advanceEnvironment(env, 1, 0, null);
  expect(env.storm).toBe(0);
  expect(env.wetness).toBeLessThan(1);
});
