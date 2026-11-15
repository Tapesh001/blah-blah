import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { benchDefinition, evaluateBoard } from './rules';
import { createBench } from './index';
import { fakeWorld, fakeHud, fakeInput } from '../bike/fake-world';

describe('bench kinematics', () => {
  it('bike needs a 24T idler and produces same-direction 2.5x', () => {
    const d = benchDefinition('bike');
    expect(evaluateBoard(d, {}).solved).toBe(false);
    const r = evaluateBoard(d, { idler: 'gear-24' });
    expect(r.solved).toBe(true);
    expect(r.ratio).toBe(2.5);
    expect(r.rates['gear-24']).toBe(-1.25);
    expect(r.meshes).toHaveLength(2);
  });
  it('wrong small gear leaves gaps; oversized gear is rejected', () => {
    const d = benchDefinition('bike');
    expect(evaluateBoard(d, { idler: 'gear-16' }).ratio).toBe(null);
    expect(evaluateBoard(d, { idler: 'gear-32' }).legal).toBe(false);
  });
  it('engine uses two idlers to reverse the 40T Keystone at half speed', () => {
    const d = benchDefinition('engine');
    const r = evaluateBoard(d, { 'idler-a': 'gear-24', 'idler-b': 'gear-32' });
    expect(r.solved).toBe(true);
    expect(r.ratio).toBe(-0.5);
    expect(r.meshes).toHaveLength(3);
    expect(d.axles.find((a) => a.id === 'output')!.fixed!.teeth).toBe(40);
  });
  it('rejects reused parts, unknown parts and fixed-axle replacement', () => {
    const d = benchDefinition('engine');
    for (const p of [
      { 'idler-a': 'gear-24', 'idler-b': 'gear-24' },
      { driver: 'gear-24' },
      { 'idler-a': 'bogus' },
    ])
      expect(evaluateBoard(d, p).legal).toBe(false);
  });
  it('each meshed tooth faces a gap throughout a driver rotation', () => {
    const d = benchDefinition('engine'),
      p = { 'idler-a': 'gear-24', 'idler-b': 'gear-32' },
      r = evaluateBoard(d, p);
    const all = d.axles.map((a) => ({
      ...a,
      part: a.fixed ?? d.tray.find((t) => t.id === p[a.id as keyof typeof p])!,
    }));
    for (const time of [0, 0.19, 1.7])
      for (const [from, to] of r.meshes) {
        const a = all.find((a) => a.part.id === from)!,
          b = all.find((a) => a.part.id === to)!,
          theta = Math.atan2(-(b.z - a.z), b.x - a.x);
        const phase =
          a.part.teeth * (theta - r.phases[from]! - time * r.rates[from]!) +
          b.part.teeth *
            (theta + Math.PI - r.phases[to]! - time * r.rates[to]!);
        expect(Math.cos(phase)).toBeCloseTo(-1, 7);
      }
  });
});
describe('bench GameMode', () => {
  it('requires correct ratio, tension and a held test before bike completion', () => {
    const w = fakeWorld(),
      h = fakeHud(),
      mode = createBench('bike');
    mode.enter(w, h);
    mode.update(1 / 60, fakeInput([], ['Digit3', 'Enter']), w, h);
    for (let i = 0; i < 90; i++)
      mode.update(1 / 60, fakeInput(['Space']), w, h);
    expect(mode.done()).toBe(false);
    for (let i = 0; i < 65; i++)
      mode.update(1 / 60, fakeInput([], [], 1), w, h);
    expect(Number(h.values.get('tension'))).toBeGreaterThan(0.55);
    for (let i = 0; i < 65; i++)
      mode.update(1 / 60, fakeInput(['Space']), w, h);
    expect(mode.done()).toBe(true);
    mode.exit(w);
    expect(w.scene.children).toHaveLength(0);
  });
  it('engine completes with keyboard placements and restores camera exactly', () => {
    const w = fakeWorld(),
      h = fakeHud(),
      mode = createBench('engine');
    w.camera.position.set(2, 5, 10);
    w.camera.lookAt(0, 1, 0);
    const position = w.camera.position.clone(),
      rotation = w.camera.quaternion.clone();
    mode.enter(w, h);
    mode.update(1 / 60, fakeInput([], ['Digit2', 'Enter']), w, h);
    mode.update(1 / 60, fakeInput([], ['Tab']), w, h);
    mode.update(1 / 60, fakeInput([], ['Digit4', 'Enter']), w, h);
    for (let i = 0; i < 65; i++)
      mode.update(1 / 60, fakeInput(['Space']), w, h);
    expect(mode.done()).toBe(true);
    mode.exit(w);
    expect(w.camera.position.equals(position)).toBe(true);
    expect(w.camera.quaternion.equals(rotation)).toBe(true);
    expect(w.scene.children).toHaveLength(0);
  });
  it('mouse ray drag snaps a tray gear onto the axle, then removes it', () => {
    const w = fakeWorld(),
      h = fakeHud(),
      mode = createBench('bike');
    mode.enter(w, h);
    const root = w.scene.getObjectByName('bike-repair-bench')!;
    root.updateMatrixWorld(true);
    w.camera.updateMatrixWorld(true);
    const point = (local: Vector3) =>
      root.localToWorld(local).project(w.camera);
    const send = (
      p: Vector3,
      down: boolean,
      pressed: boolean,
      released: boolean,
    ) => {
      const input = fakeInput();
      input.pointer = { x: p.x, y: p.y, down, pressed, released };
      mode.update(1 / 60, input, w, h);
    };
    send(point(new Vector3(0.15, 0.962, 0.34)), true, true, false);
    send(point(new Vector3(0.036, 0.962, -0.13)), true, false, false);
    send(point(new Vector3(0.036, 0.962, -0.13)), false, false, true);
    expect(h.values.get('ratio')).toBe('2.50× · same');
    send(point(new Vector3(0.036, 0.962, -0.13)), true, true, false);
    send(point(new Vector3(0.5, 0.962, 0.45)), false, false, true);
    expect(h.values.get('ratio')).toBe('idle');
    mode.exit(w);
  });
  it('clashing placement returns to tray and emits sparks without changing the board', () => {
    const w = fakeWorld(),
      h = fakeHud(),
      m = createBench('bike');
    m.enter(w, h);
    m.update(1 / 60, fakeInput([], ['Digit4', 'Enter']), w, h);
    expect(w.bursts).toContain('sparks');
    expect(h.values.get('ratio')).toBe('idle');
    expect(m.done()).toBe(false);
    m.exit(w);
  });
  it('H offers progressive hints and repeated enter/exit is safe', () => {
    const w = fakeWorld(),
      h = fakeHud(),
      m = createBench('engine');
    for (let run = 0; run < 2; run++) {
      m.enter(w, h);
      for (let i = 0; i < 3; i++)
        m.update(1 / 60, fakeInput([], ['KeyH']), w, h);
      expect(h.messages.at(-1)).toContain('24T');
      m.exit(w);
      expect(w.scene.children).toHaveLength(0);
    }
  });
});
