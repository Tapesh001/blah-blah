import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.GFX_PLAYWRIGHT || 'playwright');
const artifactDir = fileURLToPath(new URL('../../artifacts/gfx/', import.meta.url));
const base = process.env.GFX_BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true,
  ...(process.env.GFX_BROWSER ? { executablePath: process.env.GFX_BROWSER } : {}),
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' || (message.type() === 'warning' && /shader|WebGL|GL_INVALID/i.test(message.text()))) errors.push(message.text()); });
const advance = async (frames = 10) => {
  const frame = await page.evaluate(() => window.gfxHarness.gfx.stats.frame);
  await page.waitForFunction(frame => window.gfxHarness.gfx.stats.frame >= frame, frame + frames);
};
const screenshot = name => page.screenshot({ path: `${artifactDir}/${name}.png` });
const canvasShot = () => page.locator('#view').screenshot({ style: 'aside, footer, [data-gfx-perf] { visibility: hidden !important; }' });
try {
  await mkdir(artifactDir, { recursive: true });
  await page.goto(`${base}/sandbox/gfx-pipeline.html?perf=1`);
  await page.waitForFunction(() => window.gfxHarness?.gfx.stats.frame >= 40);
  assert.deepEqual(errors, []);
  const initial = await page.evaluate(() => window.gfxHarness.gfx.stats);
  assert.equal(initial.width, 1440); assert.equal(initial.height, 810);
  assert.ok(initial.drawCalls > 10); assert.ok(initial.triangles > 100);
  assert.deepEqual(initial.passes.map(p => p.name), ['clear', 'shadows', 'opaque', 'sky', 'ocean', 'transparents', 'post', 'upscale']);
  await screenshot('t0-1-pipeline');
  console.log('Initial HDR render passed');
  const sceneSnapshot = () => page.evaluate(() => {
    const snapshot = [];
    window.gfxHarness.scene.traverse(object => snapshot.push({ uuid: object.uuid, visible: object.visible,
      layers: object.layers.mask, position: object.position.toArray(), scale: object.scale.toArray() }));
    return snapshot;
  });
  const before = await sceneSnapshot();

  // Every stage can be disabled and re-enabled without a shader error or stale GL state.
  for (const name of initial.passes.map(p => p.name)) {
    await page.evaluate(name => window.gfxHarness.gfx.setPassEnabled(name, false), name);
    await advance(3);
    assert.equal(await page.evaluate(name => window.gfxHarness.gfx.stats.passes.find(p => p.name === name).enabled, name), false);
    await page.evaluate(name => window.gfxHarness.gfx.setPassEnabled(name, true), name);
    await advance(3);
  }
  assert.deepEqual(await sceneSnapshot(), before, 'Stage filtering must preserve caller scene state');
  console.log('All pass toggles passed');
  // Two post buffers must be distinct and a custom pass must actually change the output.
  const normal = await canvasShot();
  await page.evaluate(() => window.gfxHarness.addTestPost());
  await advance();
  const darkened = await canvasShot();
  assert.ok(!normal.equals(darkened), 'Custom post must visibly darken the frame');
  await page.evaluate(() => window.gfxHarness.gfx.setPassEnabled('test-gain', false));
  await advance();
  assert.ok((await canvasShot()).equals(normal), 'Disabling custom post must restore the original frame');
  console.log('Post ping-pong passed');

  await page.setViewportSize({ width: 800, height: 600 });
  await advance();
  assert.equal(await page.evaluate(() => window.gfxHarness.gfx.stats.width), 600);
  await page.selectOption('#scale', '0.5'); await advance();
  assert.equal(await page.evaluate(() => window.gfxHarness.gfx.stats.width), 400);
  await screenshot('t0-1-resized');
  console.log('Resize passed');

  const canLoseContext = await page.evaluate(() => {
    const ext = window.gfxHarness.gfx.renderer.getContext().getExtension('WEBGL_lose_context');
    if (!ext) return false;
    window.testContextExtension = ext; ext.loseContext(); return true;
  });
  assert.ok(canLoseContext, 'WEBGL_lose_context is needed for the recovery acceptance check');
  await page.waitForFunction(() => window.gfxHarness.gfx.stats.contextLost);
  await page.evaluate(() => window.testContextExtension.restoreContext());
  await page.waitForFunction(() => !window.gfxHarness.gfx.stats.contextLost);
  await advance(20);
  assert.ok(await page.evaluate(() => window.gfxHarness.gfx.stats.drawCalls > 10));
  await screenshot('t0-1-restored');
  console.log('Context recovery passed');

  // Collect steady-state samples, not shader compilation frames. GPU samples carry their
  // own frame id: do not count repeated asynchronous results as separate measurements.
  await page.setViewportSize({ width: 1920, height: 1080 });
  const measurements = [];
  for (const renderScale of [0.5, 0.75, 1]) {
    await page.evaluate(scale => window.gfxHarness.gfx.setRenderScale(scale), renderScale);
    await advance(60);
    await page.evaluate(() => { window.gfxHarness.history.length = 0; });
    await advance(120);
    measurements.push(await page.evaluate(() => {
      const history = window.gfxHarness.history;
      const mean = list => list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
      const gpu = [...new Map(history.filter(s => s.gpuFrame != null).map(s => [s.gpuFrame, s])).values()];
      return { ...history.at(-1), samples: history.length, gpuSamples: gpu.length,
        meanCpuMs: mean(history.map(s => s.cpuMs)), meanGpuMs: mean(gpu.map(s => s.gpuMs)),
        passes: history.at(-1).passes.map(p => ({ name: p.name, enabled: p.enabled,
          meanCpuMs: mean(history.map(s => s.passes.find(x => x.name === p.name).cpuMs).filter(x => x != null)),
          meanGpuMs: mean(gpu.map(s => s.passes.find(x => x.name === p.name).gpuMs).filter(x => x != null)) })) };
    }));
    console.log(`Measured render scale ${renderScale}`);
  }
  const hardware = await page.evaluate(() => {
    const gl = window.gfxHarness.gfx.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { userAgent: navigator.userAgent, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR) };
  });
  assert.deepEqual(await page.evaluate(() => window.gfxHarness.gfx.shaderErrors), []);
  assert.deepEqual(errors, []);
  await page.evaluate(() => window.gfxHarness.dispose());
  assert.equal(await page.locator('[data-gfx-perf]').count(), 0);

  // Also verify the ordinary page has no overlay or runtime errors.
  await page.goto(`${base}/sandbox/gfx-pipeline.html`);
  await page.waitForFunction(() => window.gfxHarness?.gfx.stats.frame > 5);
  assert.equal(await page.locator('[data-gfx-perf]').count(), 0);
  await page.evaluate(() => window.gfxHarness.dispose());
  assert.deepEqual(errors, []);
  await writeFile(`${artifactDir}/t0-1-performance.json`, JSON.stringify({ measuredAt: new Date().toISOString(),
    hardware, contextRecovery: 'passed', errors, measurements }, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'passed', hardware, measurements }, null, 2));
} finally { await browser.close(); }
