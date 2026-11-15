import { describe, it, expect, vi } from 'vitest';
import { FixedLoop, FIXED_DT, type LoopHooks } from '../src/core/loop';
import { SeededRng } from '../src/core/rng';
import { TypedEventBus } from '../src/core/events';
import { KeyboardInput } from '../src/core/input';
import { spring, wrapAngle, damp, smoothstep, remap } from '../src/core/math';
function harness() {
  const order: string[] = [];
  const dts: number[] = [];
  let paused = false,
    scale = 1;
  const hooks: LoopHooks = {
    input: () => {
      order.push('input');
    },
    storm: () => {
      order.push('storm');
    },
    wind: () => {
      order.push('wind');
    },
    fixedUpdate: (dt) => {
      order.push('fixed');
      dts.push(dt);
    },
    physics: () => {
      order.push('physics');
    },
    frameUpdate: () => {
      order.push('frame');
    },
    camera: () => {
      order.push('camera');
    },
    environment: () => {
      order.push('environment');
    },
    render: () => {
      order.push('render');
    },
    timeScale: () => scale,
    paused: () => paused,
  };
  return {
    loop: new FixedLoop(hooks),
    order,
    dts,
    pause: (value: boolean) => {
      paused = value;
    },
    scale: (value: number) => {
      scale = value;
    },
  };
}
describe('fixed loop', () => {
  it.each([30, 60, 120, 144])(
    'runs exactly 600 steps in ten seconds at %i fps',
    (fps) => {
      const { loop } = harness();
      for (let i = 0; i <= fps * 10; i++) loop.tick((i * 1000) / fps);
      expect(loop.stats.steps).toBe(600);
      expect(loop.stats.alpha).toBeCloseTo(0, 7);
    },
  );
  it('orders systems and limits catch-up to five steps', () => {
    const { loop, order } = harness();
    loop.tick(0);
    loop.tick(1000);
    expect(loop.stats.steps).toBe(5);
    expect(loop.stats.droppedSteps).toBe(55);
    expect(order.slice(0, 5)).toEqual([
      'input',
      'storm',
      'wind',
      'fixed',
      'physics',
    ]);
    expect(order.slice(-4)).toEqual([
      'frame',
      'camera',
      'environment',
      'render',
    ]);
  });
  it('scales simulation dt without changing tick count', () => {
    const { loop, dts, scale } = harness();
    scale(0.25);
    loop.tick(0);
    loop.tick(1000 / 60);
    expect(dts).toEqual([FIXED_DT * 0.25]);
  });
  it('does not accumulate hidden time', () => {
    const { loop } = harness();
    loop.tick(0);
    loop.tick(1000 / 60);
    loop.setHidden(true);
    loop.tick(50000);
    loop.setHidden(false);
    loop.tick(60000);
    loop.tick(60000 + 1000 / 60);
    expect(loop.stats.steps).toBe(2);
    expect(loop.stats.droppedSteps).toBe(0);
  });
  it('pauses physics while rendering, then resumes cleanly', () => {
    const { loop, pause, order } = harness();
    loop.tick(0);
    pause(true);
    loop.tick(2000);
    expect(loop.stats.steps).toBe(0);
    expect(order).toEqual(['frame', 'camera', 'environment', 'render']);
    pause(false);
    loop.tick(2000 + 1000 / 60);
    expect(loop.stats.steps).toBe(1);
  });
  it('returns interpolation for partial ticks', () => {
    const { loop } = harness();
    loop.tick(0);
    loop.tick(1000 / 120);
    expect(loop.stats.steps).toBe(0);
    expect(loop.stats.alpha).toBeCloseTo(0.5);
  });
});
describe('seeded RNG', () => {
  it('repeats streams and stays inside [0,1)', () => {
    const a = new SeededRng('wind'),
      b = new SeededRng('wind');
    for (let i = 0; i < 10000; i++) {
      const n = a.next();
      expect(n).toBe(b.next());
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
  it('forks by label independently of parent consumption', () => {
    const a = new SeededRng(7),
      b = new SeededRng(7);
    a.next();
    a.next();
    expect(a.fork('storm').next()).toBe(b.fork('storm').next());
    expect(a.fork('storm').next()).not.toBe(a.fork('terrain').next());
    expect(a.next()).not.toBe(new SeededRng(8).next());
  });
});
describe('event bus', () => {
  it('delivers typed payloads, unsubscribes, and clears', () => {
    const bus = new TypedEventBus(),
      handler = vi.fn();
    const off = bus.on('chapter:complete', handler);
    bus.emit('chapter:complete', { chapter: 'ride' });
    expect(handler).toHaveBeenCalledWith({ chapter: 'ride' });
    off();
    bus.emit('chapter:complete', { chapter: 'sail' });
    expect(handler).toHaveBeenCalledTimes(1);
    bus.on('checkpoint', handler);
    bus.clear();
    bus.emit('checkpoint', { id: 'harbour' });
    expect(handler).toHaveBeenCalledTimes(1);
  });
  it('dispatches a snapshot when a handler unsubscribes another', () => {
    const bus = new TypedEventBus();
    let off = () => {};
    const handler = vi.fn();
    bus.on('checkpoint', () => off());
    off = bus.on('checkpoint', handler);
    bus.emit('checkpoint', { id: 'x' });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
describe('M0 input edges', () => {
  it('retains a full tap between snapshots exactly once', () => {
    const input = new KeyboardInput();
    input.pulse('interact');
    const state = input.snapshot();
    expect(state.down.size).toBe(0);
    expect(state.pressed.has('interact')).toBe(true);
    expect(state.released.has('interact')).toBe(true);
    expect(input.snapshot().pressed.size).toBe(0);
  });
  it('ignores repeat downs and clears stuck actions', () => {
    const input = new KeyboardInput();
    input.press('interact');
    expect(input.snapshot().pressed.size).toBe(1);
    input.press('interact');
    expect(input.snapshot().pressed.size).toBe(0);
    input.clear();
    expect(input.snapshot().down.size).toBe(0);
  });
});
it('math helpers remain continuous and frame-rate independent', () => {
  expect(wrapAngle(3 * Math.PI)).toBeCloseTo(-Math.PI);
  expect(remap(5, 0, 10, 0, 100)).toBe(50);
  expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  expect(damp(damp(0, 1, 3, 0.5), 1, 3, 0.5)).toBeCloseTo(damp(0, 1, 3, 1));
  let state = { value: 0, velocity: 0 };
  for (let i = 0; i < 60; i++)
    state = spring(state.value, state.velocity, 1, 2, 1 / 60);
  expect(state.value).toBeCloseTo(spring(0, 0, 1, 2, 1).value);
});
