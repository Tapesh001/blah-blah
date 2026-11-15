import { afterEach, expect, test, vi } from 'vitest';
import {
  GRAPHICS,
  FrameBudget,
  graphicsRatio,
  savedGraphics,
} from '../src/play/world/graphics';

test('Balanced is the safe default with Ultra available on request', () => {
  expect(savedGraphics()).toBe('high');
  expect(GRAPHICS.ultra.shadow).toBe(2048);
  expect(GRAPHICS.ultra.reflection).toBeGreaterThan(GRAPHICS.high.reflection);
  expect(GRAPHICS.ultra.ocean).toBeGreaterThan(GRAPHICS.high.ocean);
  expect(GRAPHICS.ultra.grass).toBeGreaterThan(GRAPHICS.high.grass);
  expect(GRAPHICS.ultra.cloudSteps).toBeGreaterThan(GRAPHICS.high.cloudSteps);
});

test('Native 1080p and bounded HiDPI buffers avoid excessive pixel cost', () => {
  expect(graphicsRatio(1920, 1080, 1, 'ultra', 16384)).toBe(1);
  for (const [width, height, ratio, limit] of [
    [3840, 2160, 2, 16384],
    [7680, 4320, 3, 4096],
    [1000, 10000, 2, 4096],
  ]) {
    const scale = graphicsRatio(width!, height!, ratio!, 'ultra', limit!);
    expect(width! * height! * scale * scale).toBeLessThanOrEqual(3_000_001);
    expect(Math.max(width!, height!) * scale).toBeLessThanOrEqual(limit!);
    expect(scale).toBeGreaterThan(0);
  }
});

afterEach(() => vi.unstubAllGlobals());

test('Old expensive presets are migrated to Balanced; new choices persist', () => {
  const storage = new Map([['cg-graphics', 'ultra']]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
  });
  expect(savedGraphics()).toBe('high');
  storage.set('cg-graphics-performance', 'ultra');
  expect(savedGraphics()).toBe('ultra');
});

test('Frame budget ignores transient stalls and reduces resolution for sustained load', () => {
  const budget = new FrameBudget();
  expect(budget.sample(5000, 'high')).toBeNull();
  expect(budget.sample(Number.NaN, 'high')).toBeNull();
  expect(budget.scale).toBe(1);
  const changes = [];
  for (let i = 0; i < 120; i++) changes.push(budget.sample(40, 'high'));
  expect(changes.filter((x) => x === 'resize')).toHaveLength(1);
  expect(budget.scale).toBe(0.9);
  for (let i = 0; i < 1000; i++) budget.sample(40, 'high');
  expect(budget.scale).toBe(0.6);
  expect(graphicsRatio(1920, 1080, 1, 'high', 16384, budget.scale)).toBe(0.6);
  expect(graphicsRatio(3840, 2160, 2, 'high', 16384, budget.scale)).toBeCloseTo(
    graphicsRatio(3840, 2160, 2, 'high', 16384) * 0.6,
  );
  for (let i = 0; i < 2500; i++) budget.sample(16, 'high');
  expect(budget.scale).toBe(1);
});

test('Sustained Ultra overload falls back while a manual change resets adaptation', () => {
  const budget = new FrameBudget();
  const changes = [];
  for (let i = 0; i < 70; i++) changes.push(budget.sample(60, 'ultra'));
  expect(changes).toContain('high');
  budget.reset();
  expect(budget.scale).toBe(1);
  for (let i = 0; i < 30; i++) expect(budget.sample(16, 'ultra')).toBeNull();
});
