import { test, expect } from '@playwright/test';
test('merged HDR pipeline renders, resizes and recovers on the pinned Three version', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' ||
      (message.type() === 'warning' &&
        /shader|WebGL|GL_INVALID/i.test(message.text()) &&
        !/GPU stall due to ReadPixels/.test(message.text()))
    )
      errors.push(message.text());
  });
  await page.goto('/sandbox/gfx-pipeline.html?perf=1');
  await page.waitForFunction(() => window.gfxHarness?.gfx.stats.frame > 5);
  await expect(page.locator('#error')).toBeEmpty();
  expect(errors).toEqual([]);
  const initial = await page.evaluate(() => window.gfxHarness.gfx.stats);
  expect(initial.drawCalls).toBeGreaterThan(10);
  expect(initial.passes.map((pass) => pass.name)).toEqual([
    'clear',
    'shadows',
    'opaque',
    'sky',
    'ocean',
    'transparents',
    'post',
    'upscale',
  ]);
  for (const name of initial.passes.map((pass) => pass.name)) {
    await page.evaluate(
      (name) => window.gfxHarness.gfx.setPassEnabled(name, false),
      name,
    );
    await page.waitForFunction(
      (name) =>
        window.gfxHarness.gfx.stats.passes.find((pass) => pass.name === name)
          ?.enabled === false,
      name,
    );
    await page.evaluate(
      (name) => window.gfxHarness.gfx.setPassEnabled(name, true),
      name,
    );
  }
  await page.evaluate(() => window.gfxHarness.addTestPost());
  await page.waitForFunction(() =>
    window.gfxHarness.gfx.stats.passes.some(
      (pass) => pass.name === 'test-gain',
    ),
  );
  await page.setViewportSize({ width: 800, height: 600 });
  await page.selectOption('#scale', '0.5');
  await page.waitForFunction(() => window.gfxHarness.gfx.stats.width === 400);
  await page.evaluate(() => {
    const ext = window.gfxHarness.gfx.renderer
      .getContext()
      .getExtension('WEBGL_lose_context');
    if (!ext) throw new Error('Context loss extension unavailable');
    window.testContextExtension = ext;
    ext.loseContext();
  });
  await page.waitForFunction(() => window.gfxHarness.gfx.stats.contextLost);
  await page.evaluate(() => window.testContextExtension.restoreContext());
  await page.waitForFunction(
    () =>
      !window.gfxHarness.gfx.stats.contextLost &&
      window.gfxHarness.gfx.stats.drawCalls > 10,
  );
  expect(await page.evaluate(() => window.gfxHarness.gfx.shaderErrors)).toEqual(
    [],
  );
  expect(errors).toEqual([]);
  await page.evaluate(() => window.gfxHarness.dispose());
  await expect(page.locator('[data-gfx-perf]')).toHaveCount(0);
});
