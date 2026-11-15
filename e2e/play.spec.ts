import { test, expect } from '@playwright/test';

test('production entry starts the playable bike world and renders without errors', async ({
  page,
}, testInfo) => {
  // CI uses software WebGL. Exercise the real High preset at a small viewport;
  // do not disable effects or substitute the M0 stub renderer for the real game.
  test.setTimeout(90000);
  await page.setViewportSize({ width: 480, height: 270 });
  await page.addInitScript(() =>
    localStorage.setItem('cg-graphics-performance', 'high'),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' ||
      (message.type() === 'warning' &&
        /shader|WebGL|GL_INVALID/i.test(message.text()) &&
        !/GPU stall due to ReadPixels/.test(message.text()))
    ) {
      errors.push(message.text());
    }
  });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('#obj')).toHaveText('Ride to the harbour', {
    timeout: 60000,
  });
  await expect(page.getByLabel('Graphics')).toHaveValue('high');
  // Stats update only after world.render() completes. This catches broken imports,
  // failed mode integration, shader failures and a stalled first render.
  await expect(page.locator('#render-stats')).toContainText('fps', {
    timeout: 60000,
  });
  await expect(page.locator('#render-stats')).toHaveAttribute(
    'title',
    /[1-9]\d* × [1-9]\d* render pixels · [\d,]+ triangles · [1-9]\d* draws/,
  );
  await expect(page.locator('#gauges')).toContainText('speed');
  await page.screenshot({ path: testInfo.outputPath('playable-world.png') });
  // Compile the Ultra post stack and the cloth/wood shaders in the real world.
  // Keep the software-rendered test small; this is correctness, not an FPS claim.
  await page.setViewportSize({ width: 320, height: 180 });
  await page.getByLabel('Graphics').selectOption('ultra');
  await page.locator('canvas').click();
  await expect(page.locator('canvas')).toBeFocused();
  await page.keyboard.press('n');
  await expect(page.locator('#obj')).toHaveText('Sail to the far island', {
    timeout: 30000,
  });
  await expect(page.locator('#render-stats')).toHaveAttribute(
    'title',
    /[1-9]\d* × [1-9]\d* render pixels/,
  );
  await page.keyboard.press('v');
  await expect(page.locator('#gauges')).toContainText('trim');
  // HUD gauges update after rendering. Keep the Ultra shader/error checks,
  // but avoid a second screenshot readback that hangs SwiftShader in CI.
  expect(errors).toEqual([]);
});
