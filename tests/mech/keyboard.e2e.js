import { test } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { exercises } from '../../src/mech/sandbox';

test('all M0 exercises support keyboard completion; bike lab renders and pedals', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 1100 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const base = '';
  const artifacts = testInfo.outputPath();
  if (artifacts) await mkdir(artifacts, { recursive: true });
  /** Focus does not mutate application state; all interaction uses keyboard events. */
  async function choose(id, value) {
    const control = page.locator(`#${id}`);
    const values = await control
      .locator('option')
      .evaluateAll((os) => os.map((o) => o.value));
    const index = values.indexOf(String(value));
    assert.ok(index >= 0, `${id}: ${value}`);
    await control.focus();
    await page.keyboard.press('Home');
    for (let i = 0; i < index; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
  }
  async function press(id) {
    await page.locator(`#${id}`).focus();
    await page.keyboard.press('Enter');
  }
  async function number(id, value) {
    await page.locator(`#${id}`).focus();
    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+A' : 'Control+A',
    );
    await page.keyboard.type(String(value));
    await page.keyboard.press('Tab');
  }
  try {
    await page.goto(`${base}/sandbox/bench-lab.html`);
    for (let i = 0; i < exercises.length; i++) {
      const exercise = exercises[i];
      await choose('exercise', i);
      await press('test');
      assert.match(await page.locator('#status').innerText(), /NOT READY/);
      for (const m of exercise.solution.parts) {
        await choose('part', m.part);
        await choose('axle', m.axle);
        await choose('tier', m.tier);
        await press('place');
      }
      for (const r of exercise.solution.ratchets ?? []) {
        const mount = exercise.solution.parts.find((p) => p.part === r.mount);
        // Demonstrate that a wrong-way ratchet freewheels before fitting the right one.
        await choose('part', 'CW hub');
        await choose('axle', mount.axle);
        await choose('tier', mount.tier);
        await press('place');
        await press('test');
        assert.match(await page.locator('#status').innerText(), /NOT READY/);
        await choose('part', r.part);
        await press('place');
      }
      for (const chain of exercise.solution.chains ?? []) {
        for (const id of chain.sprockets) {
          const mount = exercise.solution.parts.find((p) => p.part === id);
          await choose('axle', mount.axle);
          await choose('tier', mount.tier);
          await press('route');
        }
        await number('links', chain.links);
        await press('chain');
        await page.locator('#tension').focus();
        await page.keyboard.press('Home');
        for (let k = 0; k < Math.round(chain.tensioner * 100); k++)
          await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Tab');
      }
      await press('test');
      assert.match(
        await page.locator('#status').innerText(),
        /^PASS/,
        exercise.def.id,
      );
      if (artifacts)
        await page.screenshot({
          path: `${artifacts}/${exercise.def.id}.png`,
          fullPage: true,
        });
      await press('clear');
      await press('test');
      assert.match(await page.locator('#status').innerText(), /NOT READY/);
      await press('undo');
      await press('test');
      assert.match(await page.locator('#status').innerText(), /^PASS/);
      await press('hint');
      assert.ok((await page.locator('#hint-text').innerText()).length > 15);
      console.log(`PASS keyboard: ${exercise.def.id}, clear, undo, hint`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      'mobile horizontal overflow',
    );
    if (artifacts)
      await page.screenshot({
        path: `${artifacts}/bench-mobile.png`,
        fullPage: true,
      });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(`${base}/sandbox/bike-lab.html`);
    await page.locator('#telemetry .gauge').first().waitFor();
    // Focus the document so the native input controls do not swallow riding keys.
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      () =>
        parseFloat(document.querySelector('#telemetry .gauge').textContent) > 1,
      undefined,
      { timeout: 10000 },
    );
    await page.keyboard.up('KeyW');
    assert.ok(await page.locator('#bike-stage canvas').count());
    if (artifacts)
      await page.screenshot({ path: `${artifacts}/bike.png`, fullPage: true });
    await choose('terrain', 'ramp');
    await press('coast');
    await page.waitForFunction(
      () =>
        parseFloat(document.querySelector('#telemetry .gauge').textContent) > 5,
    );
    console.log(
      'PASS bike: renders, pedals, terrain selection and coast launch',
    );
    assert.deepEqual(errors, []);
    console.log('PASS: no browser exceptions');
  } finally {
    await page.screenshot({
      path: testInfo.outputPath('last-state.png'),
      fullPage: true,
    });
  }
});
