import test from 'node:test';
import assert from 'node:assert/strict';
import { frameSize, PassRegistry, GpuTimer } from '../../src/gfx/frame-tools.js';
import { PingPongTargets, FullscreenTriangle } from '../../src/gfx/fullscreen.js';

test('physical resolution respects scale, HiDPI, hardware limit and tiny canvases', () => {
  assert.deepEqual(frameSize(1920, 1080, 1, 0.75), { canvasWidth: 1920, canvasHeight: 1080, width: 1440, height: 810, renderScale: 0.75 });
  assert.equal(frameSize(800, 600, 2, 0.5).width, 800);
  assert.deepEqual(frameSize(800, 400, 2, 2, 1024), { canvasWidth: 1024, canvasHeight: 512, width: 1024, height: 512, renderScale: 1 });
  assert.equal(frameSize(1, 1, 1, 0.1).width, 1);
  for (const invalid of [0, -1, NaN, Infinity]) assert.throws(() => frameSize(800, 600, 1, invalid), RangeError);
});

test('registry keeps post ordering, validates names, resizes disabled passes and disposes them', () => {
  const calls = [], registry = new PassRegistry();
  registry.add({ name: 'upscale' });
  registry.add({ name: 'bloom', resize: (w, h) => calls.push([w, h]), dispose: () => calls.push('disposed') }, 'upscale');
  registry.setEnabled('bloom', false);
  registry.resize(320, 180);
  assert.deepEqual(registry.passes.map(p => p.name), ['bloom', 'upscale']);
  assert.equal(registry.passes[0].enabled, false);
  assert.throws(() => registry.add({ name: 'bloom' }), /Duplicate/);
  assert.throws(() => registry.setEnabled('missing', true), /Unknown/);
  assert.throws(() => registry.add({ name: 'x' }, 'missing'), /Unknown/);
  registry.dispose();
  assert.deepEqual(calls, [[320, 180], 'disposed']);
});

function fakeGl(supported = true) {
  const queries = [], deleted = [];
  let active = null;
  const gl = {
    QUERY_RESULT_AVAILABLE: 1, QUERY_RESULT: 2, disjoint: false, queries, deleted,
    getExtension: () => supported ? { TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 } : null,
    getParameter: () => gl.disjoint,
    createQuery: () => { const q = { available: false, result: 1e6 }; queries.push(q); return q; },
    beginQuery: (_, query) => { assert.equal(active, null); active = query; },
    endQuery: () => { assert.ok(active); active = null; },
    getQueryParameter: (query, parameter) => parameter === 1 ? query.available : query.result,
    deleteQuery: query => deleted.push(query),
  };
  return gl;
}

test('GPU queries never block, sum split passes, and publish only complete frame samples', () => {
  const gl = fakeGl(), timer = new GpuTimer(gl);
  timer.beginFrame(42);
  for (const name of ['opaque', 'shadows', 'opaque', 'post']) { timer.begin(name); timer.end(); }
  timer.endFrame(); timer.poll(); assert.equal(timer.latest, null);
  gl.queries[0].available = true; timer.poll(); assert.equal(timer.latest, null);
  gl.queries.forEach(q => { q.available = true; }); timer.poll();
  assert.deepEqual(timer.latest, { frame: 42, passes: { opaque: 2, shadows: 1, post: 1 }, totalMs: 4 });
  assert.equal(gl.deleted.length, 4);
});

test('GPU backlog stays bounded; disjoint invalidates previous samples and pending work', () => {
  const gl = fakeGl(), timer = new GpuTimer(gl, 2);
  for (let i = 1; i <= 20; i++) { timer.beginFrame(i); timer.begin('opaque'); timer.endFrame(); }
  assert.equal(gl.queries.length, 2);
  gl.disjoint = true; timer.poll();
  assert.equal(timer.pending.length, 0); assert.equal(timer.latest, null); assert.equal(gl.deleted.length, 2);
  gl.disjoint = false; timer.beginFrame(21); timer.begin('opaque'); timer.endFrame();
  gl.queries.at(-1).available = true; timer.poll(); assert.equal(timer.latest.frame, 21);
});

test('GPU timing tolerates unsupported extensions and context loss without GL deletions', () => {
  const unsupported = new GpuTimer(fakeGl(false));
  unsupported.beginFrame(1); unsupported.begin('opaque'); unsupported.endFrame();
  assert.equal(unsupported.latest, null);
  const gl = fakeGl(), timer = new GpuTimer(gl);
  timer.beginFrame(1); timer.begin('opaque');
  assert.throws(() => timer.begin('sky'), /overlap/);
  timer.clear(true); assert.equal(gl.deleted.length, 0); assert.equal(timer.active, null);
});

test('ping-pong never aliases its read/write target and triangles have independent ownership', () => {
  const targets = new PingPongTargets(), a = targets.read, b = targets.write;
  targets.swap(); assert.equal(targets.read, b); assert.equal(targets.write, a);
  targets.resize(128, 72);
  assert.equal(a.width, 128); assert.equal(b.height, 72); assert.equal(a.texture.internalFormat, 'RGBA16F');
  const first = new FullscreenTriangle(), second = new FullscreenTriangle();
  assert.notEqual(first.geometry, second.geometry);
  assert.equal(first.geometry.attributes.position.count, 3);
  first.dispose(); second.dispose(); targets.dispose();
});
