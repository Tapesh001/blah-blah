import { expect, test } from 'vitest';
import {
  GRAPHICS,
  graphicsRatio,
  savedGraphics,
} from '../src/play/world/graphics';

test('Ultra is the default and allocates more visible detail than High', () => {
  expect(savedGraphics()).toBe('ultra');
  expect(GRAPHICS.ultra.shadow).toBe(4096);
  expect(GRAPHICS.ultra.reflection).toBeGreaterThan(GRAPHICS.high.reflection);
  expect(GRAPHICS.ultra.ocean).toBeGreaterThan(GRAPHICS.high.ocean);
  expect(GRAPHICS.ultra.grass).toBeGreaterThan(GRAPHICS.high.grass);
  expect(GRAPHICS.ultra.cloudSteps).toBeGreaterThan(GRAPHICS.high.cloudSteps);
});

test('Ultra supersamples 1080p and bounds HiDPI and 4K allocations', () => {
  expect(graphicsRatio(1920, 1080, 1, 'ultra', 16384)).toBe(1.5);
  for (const [width, height, ratio, limit] of [
    [3840, 2160, 2, 16384],
    [7680, 4320, 3, 4096],
    [1000, 10000, 2, 4096],
  ]) {
    const scale = graphicsRatio(width!, height!, ratio!, 'ultra', limit!);
    expect(width! * height! * scale * scale).toBeLessThanOrEqual(8_000_001);
    expect(Math.max(width!, height!) * scale).toBeLessThanOrEqual(limit!);
    expect(scale).toBeGreaterThan(0);
  }
});
