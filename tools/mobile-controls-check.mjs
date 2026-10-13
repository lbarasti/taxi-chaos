// Offline production UI checks in disposable Chromium contexts.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const output = resolve(process.env.SCREENSHOT_DIR ?? 'scenario-runs/mobile-controls');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [], requests = [];
const monitor = page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
};
const url = pathToFileURL(resolve('dist/index.html'));
try {
  // Check desktop first, then portrait, landscape, tablet and the supplied image size.
  for (const [name, width, height, mobile] of [
    ['desktop', 1440, 900, false], ['portrait', 390, 844, true], ['small', 320, 568, true],
    ['landscape', 844, 390, true], ['compact-landscape', 568, 320, true],
    ['tablet', 768, 1024, true], ['tablet-landscape', 1024, 768, true], ['reference', 1179, 766, true],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile, offline: true });
    const page = await context.newPage(); monitor(page);
    await page.goto(`${url}?scenario-preview=1`);
    await page.evaluate(() => __scenario.start({ traffic: 'quiet', noPolice: true }));
    assert.equal(await page.locator('.touch-controls').isVisible(), mobile);
    if (mobile) {
      const checkLayout = async (left = 10, right = 10, bottom = 12) => {
        const bounds = await page.evaluate(() => Object.fromEntries(
          ['.navigation-hud', '.player-hud', '#joystick', '[data-key=boost]', '[data-key=handbrake]', '#interact']
            .map(selector => [selector, document.querySelector(selector).getBoundingClientRect().toJSON()])
        ));
        const boost = bounds['[data-key=boost]'], drift = bounds['[data-key=handbrake]'], stick = bounds['#joystick'];
        assert.equal(boost.x, left); assert.equal(drift.x, left);
        assert.equal(drift.bottom, height - bottom); assert.equal(boost.bottom + 8, drift.top);
        assert.equal(stick.right, width - right); assert.equal(stick.bottom, height - bottom);
        for (const button of [boost, drift]) assert(button.width >= 48 && button.height >= 48);
        const entries = Object.entries(bounds);
        for (let i = 0; i < entries.length; i++) {
          const [selector, a] = entries[i];
          assert(a.left >= 0 && a.top >= 0 && a.right <= width && a.bottom <= height, `${name}: ${selector} exceeds viewport`);
          for (const [other, b] of entries.slice(i + 1)) {
            assert(!(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top), `${name}: ${selector} overlaps ${other}`);
          }
        }
      };
      await checkLayout();
      if (['portrait', 'small', 'landscape'].includes(name)) await page.screenshot({ path: resolve(output, `${name}.png`) });
      // Simulate asymmetric device cutouts and a home-indicator inset.
      await page.addStyleTag({ content: ':root{--edge-left:34px;--edge-right:26px;--edge-bottom:34px;--top-height:32px}' });
      await checkLayout(34, 26, 34);
    } else await page.screenshot({ path: resolve(output, 'desktop.png') });
    console.log(`${name}: layout and safe areas passed`);
    await context.close();
  }

  // Native touch events drive the actual joystick mapping and game physics.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, offline: true });
  const page = await context.newPage(); monitor(page);
  await page.goto(`${url}?scenario-preview=1`);
  let before = (await page.evaluate(() => __scenario.start({ traffic: 'quiet', noPolice: true }))).state;
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const point = (x, y, id) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 });
  const box = await page.locator('#joystick').boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const step = async seconds => {
    const reply = await page.evaluate(seconds => __scenario.execute({ op: 'step', seconds }), seconds);
    assert.equal(reply.status, 'passed', reply.error); return reply.state;
  };
  for (const offset of [-5, 5, -4, 4]) {
    await touch('touchStart', [point(cx + offset, cy - 35, 1)]);
    const after = await step(0.25); await touch('touchEnd', []);
    assert(Math.abs(after.angle - before.angle) < 1e-8, 'Centre jitter must not turn the taxi');
    assert(after.speed > before.speed, 'Steering dead zone must preserve acceleration');
    before = after;
  }
  await touch('touchStart', [point(cx + 28, cy - 24, 1)]);
  const turned = await step(0.5); await touch('touchEnd', []);
  assert(turned.angle - before.angle > 0.01, 'Deliberate right deflection must turn the taxi');
  console.log('Native touch: straight acceleration through jitter and deliberate turning passed');

  // The tank reads the real reserve after both consumption and recharge.
  await page.evaluate(() => __scenario.start({ traffic: 'quiet', noPolice: true }));
  // Stage a fresh fixture on the long road heading inland before driving.
  await page.evaluate(() => __scenario.execute({ op: 'place', at: { x: 4, y: 80 }, angle: Math.PI / 2 }));
  const tank = page.locator('[data-key=boost]');
  const checkTank = async (state, name) => {
    assert.equal(await tank.evaluate(el => Number(el.style.getPropertyValue('--boost-level'))), state.boost / 100);
    assert.equal(await tank.getAttribute('aria-label'), `Hold to boost (${Math.round(state.boost)}% tank remaining)`);
    await page.waitForTimeout(150);
    const rendered = await tank.evaluate(el => {
      const style = getComputedStyle(el, '::before');
      return { level: new DOMMatrixReadOnly(style.transform).m22, origin: style.transformOrigin, pointerEvents: style.pointerEvents };
    });
    assert(Math.abs(rendered.level - state.boost / 100) < 0.00001);
    assert.equal(rendered.pointerEvents, 'none');
    if (name) await page.screenshot({ path: resolve(output, `tank-${name}.png`) });
  };
  await checkTank((await page.evaluate(() => __scenario.render('world'))), 'full');
  const depleted = await page.evaluate(() => __scenario.execute({ op: 'step', seconds: 3.42, keys: ['KeyW', 'ShiftLeft'] }));
  assert.equal(depleted.status, 'passed', depleted.error);
  assert(depleted.state.boost < 2, 'Holding boost must empty the tank');
  await checkTank(depleted.state, 'empty');
  const recharging = await step(3);
  assert(recharging.boost > depleted.state.boost && recharging.boost < 100);
  await checkTank(recharging, 'refilling');
  const full = await step(5); assert.equal(full.boost, 100); await checkTank(full);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await tank.evaluate(el => getComputedStyle(el, '::before').transitionDuration), '0s');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  console.log('Boost tank: full, depleted, refilling, full again and reduced motion passed');

  // Realtime checks preserve independently held action keys during two-finger input.
  await page.goto(`${url}?dialogue-preview=1&debug=1`);
  await page.evaluate(() => { __taxi.scenario('first-fare'); document.querySelector('#debug-panel').hidden = true; });
  for (const key of ['boost', 'handbrake']) {
    const button = page.locator(`[data-key=${key}]`), b = await button.boundingBox();
    await touch('touchStart', [point(cx, cy - 35, 1)]);
    await touch('touchStart', [point(cx, cy - 35, 1), point(b.x + b.width / 2, b.y + b.height / 2, 2)]);
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#joystick.pressed').count(), 1);
    assert(await button.evaluate(el => el.classList.contains('pressed')));
    if (key === 'boost') {
      assert((await page.evaluate(() => __taxi.state())).boost < 99);
      assert(await button.evaluate(el => Number(el.style.getPropertyValue('--boost-level')) < 0.99));
    }
    await touch('touchEnd', [point(b.x + b.width / 2, b.y + b.height / 2, 2)]);
    assert(!(await button.evaluate(el => el.classList.contains('pressed'))));
    assert.equal(await page.locator('#joystick.pressed').count(), 1);
    await touch('touchCancel', []);
    assert.equal(await page.locator('#joystick.pressed').count(), 0);
  }
  await page.evaluate(() => __taxi.realtime());
  await context.close();
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  console.log('Independent boost/drift fingers, cancellation and offline console checks passed');
} finally { await browser.close(); }
