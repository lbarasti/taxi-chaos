// Production inbox QA in disposable, offline browser contexts. Run after build.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser, newContext, closeBrowser, captureFailure, viewportTuples } from '../runtime.mjs';

const output = resolve(process.env.SCREENSHOT_DIR ?? process.argv[2] ?? 'scenario-runs/text-messages');
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
try {
  for (const [name, width, height, touch] of viewportTuples('desktop', 'portrait', 'compact', 'landscape')) {
    const context = await newContext(browser, { viewport: { width, height }, hasTouch: touch, isMobile: touch, offline: true });
    const page = await context.newPage();
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?dialogue-preview=1&debug=1`);
    await page.evaluate(() => {
      window.__taxi.scenario('first-fare'); window.__taxi.configure({ noPolice: true });
      document.querySelector('#debug-panel').hidden = true;
      window.__taxi.campaign(1440 + 420);
      window.__taxi.campaign(2880 + 420);
    });
    await page.locator('#texts').click();
    const panel = page.locator('#mission-inbox');
    assert.deepEqual(await panel.locator('.inbox-day').evaluateAll(nodes => nodes.map(n => n.dataset.day)), ['3', '2']);
    assert.equal(await panel.locator('article').first().getAttribute('data-message-id'), 'celia-roster-text');
    const bodies = await panel.locator('article p').allTextContents();
    assert(bodies.every(text => !/(?:Available through|Through day|Pickup before)/i.test(text)));
    const layout = await panel.evaluate(element => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    });
    assert(layout.x >= 0 && layout.y >= 0 && layout.right <= width && layout.bottom <= height, `${name}: panel overflow`);
    assert(layout.scrollWidth <= layout.clientWidth, `${name}: horizontal overflow`);

    const receiptIds = await page.evaluate(() => window.__taxi.state().playerRecords.texts.filter(t => t.receivedMinute < 1440).map(t => t.messageId));
    assert.equal(await page.evaluate(ids => window.__taxi.state().playerRecords.texts.some(t => ids.includes(t.messageId) && t.readAt !== null), receiptIds), false, 'unloaded texts remain unread');
    const count = await panel.locator('article').count();
    await panel.locator('#texts-load-more').click();
    assert.deepEqual(await panel.locator('.inbox-day').evaluateAll(nodes => nodes.map(n => n.dataset.day)), ['3', '2', '1']);
    assert(await panel.locator('article').count() > count);
    assert.equal(await panel.locator('#texts-load-more').isVisible(), false);
    const ids = await panel.locator('article').evaluateAll(nodes => nodes.map(n => n.dataset.messageId));
    assert.equal(new Set(ids).size, ids.length, 'no duplicate messages');
    await panel.locator('#texts-close').click(); await page.locator('#texts').click();
    assert.deepEqual(await panel.locator('.inbox-day').evaluateAll(nodes => nodes.map(n => n.dataset.day)), ['3', '2']);

    // Advance time while the panel stays open: the DOM, scroll and focus survive.
    const timer = panel.locator('[data-message-id="celia-roster-text"] .inbox-expiry');
    const before = await timer.locator('.inbox-expiry-disc').evaluateAll(nodes => nodes.map(n => n.style.getPropertyValue('--remaining')));
    await page.evaluate(() => {
      const article = document.querySelector('[data-message-id="celia-roster-text"]');
      window.__inboxArticle = article;
      article.querySelector('button').focus();
      document.querySelector('#mission-inbox').scrollTop = 25;
      window.__inboxScroll = document.querySelector('#mission-inbox').scrollTop;
      window.__inboxFocus = document.activeElement;
      window.__taxi.campaign(2880 + 1140);
    });
    assert.equal(await page.evaluate(() => window.__inboxArticle === document.querySelector('[data-message-id="celia-roster-text"]')), true, 'countdown must not rebuild articles');
    assert.equal(await page.evaluate(() => document.querySelector('#mission-inbox').scrollTop === window.__inboxScroll && document.activeElement === window.__inboxFocus), true, 'countdown preserves scroll and focus');
    const after = await timer.locator('.inbox-expiry-disc').evaluateAll(nodes => nodes.map(n => n.style.getPropertyValue('--remaining')));
    assert.notDeepEqual(before, after);
    assert.match(await timer.getAttribute('aria-label'), /Each circle represents one day/);
    await panel.evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: resolve(output, `${name}.png`) });

    // The calendar turns over at midnight, even before the next workday starts.
    await page.evaluate(() => window.__taxi.campaign(4320));
    assert.deepEqual(await panel.locator('.inbox-day').evaluateAll(nodes => nodes.map(n => n.dataset.day)), ['3']);
    await page.evaluate(() => window.__taxi.campaign(6 * 1440 + 420));
    await panel.locator('#texts-close').click(); await page.locator('#texts').click();
    await panel.locator('#texts-load-more').click();
    assert((await panel.locator('.inbox-day').evaluateAll(nodes => nodes.map(n => Number(n.dataset.day)))).every(day => day >= 4), 'first load adds two days');
    await panel.locator('#texts-load-more').click();
    assert((await panel.locator('.inbox-day').evaluateAll(nodes => nodes.map(n => Number(n.dataset.day)))).includes(3), 'second load adds two more days');
    await panel.locator('#texts-load-more').click();
    const expired = panel.locator('[data-message-id="celia-barriers-text"]');
    assert.match(await expired.locator('button').textContent(), /Expired/);
    assert.equal(await expired.locator('button').isDisabled(), true);
    assert((await expired.locator('.inbox-expiry-disc').evaluateAll(nodes => nodes.map(n => n.style.getPropertyValue('--remaining')))).every(fill => fill === '0deg'));
    await panel.locator('#texts-close').click(); await page.locator('#texts').click();
    await panel.locator('[data-message-id="mara-calls-text"] button').click();
    assert.equal(await panel.isVisible(), false, 'routing closes the panel');
    assert.equal(await page.evaluate(() => window.__taxi.state().job.missionId), 'mara-calls', 'route uses the selected message');
    await context.close();
  }
  console.log('Text messages: desktop, portrait, compact and landscape passed offline; pagination, midnight, read tracking, countdown stability and expiry verified.');
} catch (error) { await captureFailure(); throw error; } finally { await closeBrowser(browser); }
