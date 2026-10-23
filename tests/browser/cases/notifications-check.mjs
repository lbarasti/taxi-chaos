import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newContext, closeBrowser, captureFailure, viewportTuples } from '../runtime.mjs';

const output = resolve(process.env.SCREENSHOT_DIR ?? 'scenario-runs/notifications');
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const standalone = await readFile('dist/index.html', 'utf8');
try {
  for (const [name, width, height, touch] of [
    ...viewportTuples('desktop', 'portrait', 'compact', 'landscape', 'compactLandscape'),
    ['small-landscape', 480, 320, true],
    ['narrow-desktop', 900, 650, false], ['short-desktop', 1280, 400, false],
  ]) {
    const context = await newContext(browser, { viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
    await context.route('http://localhost:4173/**', route => route.fulfill({ contentType: 'text/html', body: standalone }));
    const page = await context.newPage();
    await page.goto('http://localhost:4173/?dialogue-preview=1&debug=1');
    await page.waitForFunction(() => !!window.__taxi);
    await page.addStyleTag({ content: '#layers-badge{display:none!important}' });
    await page.evaluate(() => {
      __taxi.scenario('first-fare');
      document.querySelector('#debug-panel').hidden = true;
      __taxi.step(5);
      __taxi.notify('First fare is just ahead. Stop inside the yellow ring.');
      __taxi.step(1.25);
      __taxi.notify('Copy left at the newsroom. Originals stay in your Notebook. Source checks take three game hours. Return to the editor to request a ready story’s publication.', '', { category: 'newsroom', duration: null });
      __taxi.step(10);
      __taxi.notify('Exit blocked. Move your ride to make room.', 'danger', { category: 'movement' });
    });
    const read = () => page.evaluate(() => __taxi.notifications());
    let cards = await read();
    assert.equal(cards.length, 3);
    assert.equal(cards[1].remaining, null);
    assert(Math.abs(cards[2].remaining - 2.75) < 0.001);
    assert.equal(await page.locator('.notification-dismiss').isVisible(), false);
    assert.equal(await page.locator('.notification-count').textContent(), '2 waiting');
    assert.equal(await page.locator('.notification-timer').evaluate(e => Number(e.style.getPropertyValue('--remaining'))), 1);
    await page.screenshot({ path: resolve(output, `${name}-stack.png`) });
    await page.evaluate(() => __taxi.step(4));
    assert.equal(await page.locator('.notification-dismiss').isVisible(), true);
    assert.equal(await page.locator('.notification-timer').isVisible(), false);
    assert.equal(await page.locator('.notification-lifetime').textContent(), '');
    assert(!(await page.locator('#toast').textContent()).includes('Dismiss when ready'));
    assert.match(await page.locator('#toast').textContent(), /Source checks take three game hours/);

    const overlap = await page.locator('#toast').evaluate(card => {
      const b = card.getBoundingClientRect();
      return ['.navigation-hud', '.navigation-actions', '.player-hud', '#joystick', '.thumb-actions', '.context-actions'].filter(selector => {
        const e = document.querySelector(selector);
        if (!e?.getClientRects().length || getComputedStyle(e).display === 'none') return false;
        const a = e.getBoundingClientRect();
        return b.left < a.right && b.right > a.left && b.top < a.bottom && b.bottom > a.top;
      });
    });
    assert.deepEqual(overlap, [], `${name}: card clears driving controls and HUD`);
    const bounds = await page.locator('#toast').boundingBox();
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height, `${name}: card fits viewport`);
    assert(await page.locator('#toast p').evaluate(e => e.clientHeight >= parseFloat(getComputedStyle(e).lineHeight)), `${name}: at least one complete line stays readable`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: resolve(output, `${name}-manual.png`) });

    // Visibility, rather than simulation time alone, controls automatic expiration.
    await page.evaluate(() => {
      __taxi.notify('Parcel secured! Deliver to Garden Café.');
      document.body.classList.add('splash-active');
      __taxi.step(2);
    });
    cards = await read();
    assert.equal(cards[0].remaining, 4, `${name}: hidden by menu does not spend time`);
    await page.evaluate(() => { document.body.classList.remove('splash-active'); __taxi.step(0); __taxi.step(4); });
    assert.match(await page.locator('#toast').textContent(), /Source checks/);

    // Use the actual accessible dismiss control and return keyboard focus to driving.
    if (touch) await page.locator('.notification-dismiss').tap();
    else { await page.locator('.notification-dismiss').focus(); await page.keyboard.press('Enter'); }
    assert.equal(await page.evaluate(() => document.activeElement.id), 'city');
    cards = await read();
    assert.equal(cards[0].message, 'First fare is just ahead. Stop inside the yellow ring.');
    assert(Math.abs(cards[0].remaining - 2.75) < 0.001);
    await page.evaluate(() => __taxi.step(3));
    assert.equal(await page.locator('#notifications').isVisible(), false);

    // Publication remains available in the same corner after notifications clear.
    await page.evaluate(() => __taxi.campaign(2 * 1440 + 7 * 60));
    assert.equal(await page.locator('#campaign-notice').isVisible(), true);

    // A hidden document must not use up the next automatic alert.
    await page.evaluate(() => {
      __taxi.notify('Follow the blue route to a parked car or motorbike.', '', { category: 'movement' });
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      __taxi.step(2);
    });
    assert.equal((await read())[0].remaining, 4);
    await page.evaluate(() => { delete document.hidden; __taxi.step(4); });
    await page.locator('#texts').click();
    await page.evaluate(() => { __taxi.notify('Parcel secured! Deliver to Garden Café.'); __taxi.step(2); });
    assert.equal((await read())[0].remaining, 4, `${name}: reading the inbox pauses alerts`);
    await page.locator('#texts-close').click();
    await page.evaluate(() => __taxi.step(4));
    await page.evaluate(() => __taxi.notify('FARE COMPLETE · $98. Speed +$60 · Comfort +$18.', 'success', {
      category: 'dispatch', duration: null,
      receipt: { type: 'fare', baseFare: 20, payout: 98, adjustment: 78, speedScore: 75, comfortScore: 60, speedBonus: 60, comfortBonus: 18 },
    }));
    assert.equal(await page.locator('#campaign-notice').isVisible(), false);
    assert.equal(await page.locator('.receipt-title').textContent(), 'Fare complete');
    assert.equal(await page.locator('.receipt-scores > :first-child').getAttribute('data-fare-component'), 'comfort');
    assert.equal(await page.locator('.receipt-base').textContent(), 'Base $20');
    assert.equal(await page.locator('[data-receipt=payout]').textContent(), '$98');
    assert.equal(await page.locator('[data-receipt=adjustment]').textContent(), '+$78');
    assert.equal(await page.locator('.receipt-floor').isVisible(), false);
    assert.equal(await page.locator('.receipt-speed [role=meter]').getAttribute('aria-valuenow'), '75');
    assert.equal(await page.locator('.receipt-comfort [role=meter]').getAttribute('aria-valuenow'), '60');
    assert.equal(await page.locator('.receipt-comfort [role=meter]').getAttribute('aria-valuetext'), '$18 bonus');
    for (const bar of await page.locator('.fare-meter').all()) {
      const size = await bar.boundingBox();
      assert(size.width > 60 && size.width <= 260, `${name}: signed bars remain readable`);
      assert.equal(await bar.getAttribute('aria-valuemin'), '-100');
      assert.equal(await bar.getAttribute('aria-valuemax'), '100');
      const zero = await bar.locator('.fare-meter-zero').boundingBox();
      assert(Math.abs(zero.x + zero.width / 2 - size.x - size.width / 2) < 1, `${name}: zero is at the bar centre`);
      assert.equal(await bar.locator('.fare-meter-zero').textContent(), '0');
    }
    assert.equal(await page.locator('.receipt-speed [role=meter]').evaluate(e => e.style.getPropertyValue('--meter-left')), '50%');
    assert.equal(await page.locator('.receipt-speed [role=meter]').evaluate(e => e.style.getPropertyValue('--meter-width')), '37.5%');
    assert.equal(await page.locator('.receipt-comfort').getAttribute('data-sign'), 'positive');
    assert.equal(await page.locator('#toast footer').isVisible(), false);
    assert(!(await page.locator('#toast').textContent()).includes('Answer Dispatch'));
    assert.equal(await page.locator('.notification-receipt').evaluate(e => e.scrollWidth > e.clientWidth), false, `${name}: receipt has no horizontal overflow`);
    const receiptBounds = await page.locator('#toast').boundingBox();
    assert(receiptBounds.x >= 0 && receiptBounds.y + receiptBounds.height <= height, `${name}: receipt stays in the viewport`);
    await page.screenshot({ path: resolve(output, `${name}-receipt.png`) });
    await page.locator('#toast').screenshot({ path: resolve(output, `${name}-receipt-card.png`) });
    await page.locator('.receipt-comfort .fare-meter').scrollIntoViewIfNeeded();
    if (name === 'desktop') {
      await page.locator('.notification-receipt').focus();
      const parked = await page.evaluate(() => { const state = __taxi.state(); __taxi.realtime(); return state; });
      await page.keyboard.down('ArrowUp');
      await page.waitForFunction(time => __taxi.state().time > time + 0.25, parked.time);
      await page.keyboard.up('ArrowUp');
      const scrolled = await page.evaluate(() => __taxi.step(0));
      assert(Math.hypot(scrolled.position.x - parked.position.x, scrolled.position.y - parked.position.y) < 0.05, 'scrolling a receipt must not drive the car');
    }
    await page.evaluate(() => __taxi.notify('Stop the cab to enter Pit Stop.', '', { category: 'services' }));
    assert.equal(await page.locator('.notification-category').textContent(), 'Roadside & services');
    assert.equal(await page.locator('.notification-receipt').isVisible(), false);
    await page.evaluate(() => __taxi.step(4));
    assert.equal(await page.locator('[data-receipt=payout]').textContent(), '$98', `${name}: covered receipt retains its totals`);
    await page.evaluate(() => __taxi.step(8));
    assert.equal(await page.locator('.notification-dismiss').isVisible(), true);
    await page.locator('.notification-dismiss').click();
    assert.equal(await page.locator('#campaign-notice').isVisible(), true);

    // Mixed bonuses/deductions, the neutral point and the payout floor use the same card.
    for (const receipt of [
      { name: 'deduction', baseFare: 20, payout: 10, adjustment: -10, speedScore: -50, comfortScore: 100, speedBonus: -40, comfortBonus: 30 },
      { name: 'neutral', baseFare: 20, payout: 20, adjustment: 0, speedScore: 0, comfortScore: 0, speedBonus: 0, comfortBonus: 0 },
      { name: 'zero-payout', baseFare: 20, payout: 0, adjustment: -110, speedScore: -100, comfortScore: -100, speedBonus: -80, comfortBonus: -30 },
      { name: 'near-neutral', baseFare: 20, payout: 19, adjustment: -1, speedScore: 0, comfortScore: -1, speedBonus: -1, comfortBonus: 0 },
    ]) {
      await page.evaluate(receipt => __taxi.notify(`DELIVERY COMPLETE · $${receipt.payout}.`, 'success', { category: 'dispatch', duration: null, receipt: { ...receipt, type: 'parcel' } }), receipt);
      const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}$${Math.abs(value)}`;
      assert.equal(await page.locator('.receipt-title').textContent(), 'Delivery complete');
      assert.equal(await page.locator('[data-receipt=payout]').textContent(), `$${receipt.payout}`);
      assert.equal(await page.locator('[data-receipt=adjustment]').textContent(), signed(receipt.adjustment));
      assert.equal(await page.locator('.receipt-floor').isVisible(), receipt.baseFare + receipt.adjustment < 0);
      for (const component of ['speed', 'comfort']) {
        const amount = receipt[`${component}Bonus`], score = receipt[`${component}Score`];
        const row = page.locator(`.receipt-${component}`), meter = row.locator('[role=meter]');
        assert.equal(await row.locator('strong').textContent(), signed(amount));
        assert.equal(await row.getAttribute('data-sign'), amount > 0 ? 'positive' : amount < 0 ? 'negative' : 'neutral');
        assert.equal(await meter.getAttribute('aria-valuenow'), String(score));
        assert.equal(await meter.getAttribute('aria-valuetext'), amount === 0 ? 'No adjustment' : `$${Math.abs(amount)} ${amount > 0 ? 'bonus' : 'deduction'}`);
        const left = parseFloat(await meter.evaluate(e => e.style.getPropertyValue('--meter-left')));
        const fill = parseFloat(await meter.evaluate(e => e.style.getPropertyValue('--meter-width')));
        if (amount < 0) { assert(left < 50); assert(Math.abs(left + fill - 50) < 0.01); }
        else { assert.equal(left, 50); assert(amount === 0 ? fill === 0 : fill > 0); }
      }
      assert.equal(await page.locator('.notification-receipt').evaluate(e => e.scrollWidth > e.clientWidth), false, `${name}/${receipt.name}: no receipt overflow`);
      assert(!(await page.locator('.notification-receipt').innerText()).includes('+−'));
      await page.locator('.receipt-speed .fare-meter').scrollIntoViewIfNeeded();
      if (receipt.name === 'zero-payout') await page.locator('#toast').screenshot({ path: resolve(output, `${name}-zero-payout-card.png`) });
      await page.locator('.notification-dismiss').click();
    }

    // Short physical drive in the isolated fixture; no mid-drive placement or upgrades.
    if (name === 'desktop') {
      const before = await page.evaluate(() => __taxi.state());
      const after = await page.evaluate(() => __taxi.step(2, ['KeyW']));
      assert(after.time > before.time);
      assert(Math.hypot(after.position.x - before.position.x, after.position.y - before.position.y) > 1);
      await page.evaluate(() => __taxi.realtime());
    }
    await page.evaluate(() => { __taxi.scenario('moving-car-exit'); document.querySelector('#debug-panel').hidden = true; });
    const beforeExit = await read();
    await page.evaluate(() => { __taxi.interact(); __taxi.step(0.6); });
    const afterExit = await read();
    const added = afterExit.filter(card => !beforeExit.some(old => old.id === card.id));
    assert.equal(added.length, 1, `${name}: one voluntary bailout creates one notice`);
    assert.match(added[0].message, /Bailed out at speed.*landing.*blue route/);
    assert(!afterExit.some(card => /DOOR OPENING|JUMPING OFF|ROLL WITH THE LANDING/.test(card.message)));
    await context.close();
  }
} catch (error) { await captureFailure(); throw error; }
finally { await closeBrowser(browser); }
console.log('PASS notification stacks, interruption timers, manual dismissal and responsive offline UI');
