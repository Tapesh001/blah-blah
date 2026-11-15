import { test, expect } from '@playwright/test';
// The playable game owns /. Keep the M0 runtime's chapter/deep-link contract
// covered through its own production-built fixture, not the game's newer UI.
const foundation = '/sandbox/foundation.html';
test('keyboard traverses the five stub chapters and emits completion events', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(foundation);
  await page.waitForFunction(() => window.__cg?.ready);
  await page.screenshot({ path: testInfo.outputPath('title-desktop.png') });
  for (const chapter of ['title', 'ride', 'sail', 'isle', 'ending'] as const) {
    await expect(page.locator('.interface')).toHaveAttribute(
      'data-chapter',
      chapter,
    );
    await page.keyboard.press('KeyE');
    await expect
      .poll(() => page.evaluate(() => window.__cg.events.map((e) => e.chapter)))
      .toContain(chapter);
  }
  await expect(page.locator('.interface')).toHaveAttribute(
    'data-chapter',
    'title',
  );
  expect(errors).toEqual([]);
});
test('supports deep links, pause and restart without catch-up', async ({
  page,
}) => {
  await page.goto(
    foundation + '?chapter=sail&cp=squall&storm=0.8&q=low&seed=7',
  );
  await page.waitForFunction(() => window.__cg?.ready);
  await expect(page.locator('.interface')).toHaveAttribute(
    'data-chapter',
    'sail',
  );
  expect(await page.evaluate(() => window.__cg.stats().storm)).toBe(0.8);
  await page.keyboard.press('Escape');
  await expect(page.locator('.interface')).toHaveAttribute(
    'data-paused',
    'true',
  );
  const before = await page.evaluate(() => window.__cg.stats().steps);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__cg.stats().steps)).toBe(before);
  await page.keyboard.press('Escape');
  await expect(page.locator('.interface')).toHaveAttribute(
    'data-paused',
    'false',
  );
  await expect
    .poll(() => page.evaluate(() => window.__cg.stats().steps))
    .toBeGreaterThan(before);
});
test('button interaction and cleanup work on phone landscape', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(foundation);
  await page.waitForFunction(() => window.__cg?.ready);
  await page.screenshot({ path: testInfo.outputPath('title-phone.png') });
  const actionBounds = await page
    .getByRole('button', { name: 'Start journey' })
    .boundingBox();
  const footerBounds = await page.locator('footer').boundingBox();
  expect(actionBounds!.y + actionBounds!.height).toBeLessThan(
    footerBounds!.y - 12,
  );
  await page.getByRole('button', { name: 'Start journey' }).click();
  await expect(page.locator('.interface')).toHaveAttribute(
    'data-chapter',
    'ride',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.__cg.dispose());
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => window.__cg.ready)).toBe(false);
});
for (const name of [
  'bike',
  'bench',
  'sail',
  'cloth',
  'isle',
  'gfx-ocean',
  'gfx-sky',
  'gfx-terrain',
]) {
  test('sandbox ' + name + ' loads from production build', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/sandbox/' + name + '.html');
    await page.waitForFunction(() => window.__cg?.ready);
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByRole('status')).toContainText(name + ' sandbox');
    expect(errors).toEqual([]);
  });
}
