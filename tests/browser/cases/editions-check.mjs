// Real standalone newspaper, archive and finale UI, including touch confirmation.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser, newContext, closeBrowser, captureFailure } from '../runtime.mjs';
import { tapToConfirm, waitForDrawer } from '../helpers/drawer.mjs';

const output = resolve(process.env.SCREENSHOT_DIR ?? 'scenario-runs/editions');
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
try {
  for (const [name, width, height, touch] of [['desktop', 1440, 900, false], ['portrait', 390, 844, true], ['compact', 320, 568, true], ['landscape', 844, 390, true]]) {
    const context = await newContext(browser, { viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const activate = async selector => {
      if (touch) await tapToConfirm(page, selector);
      else { await page.locator(selector).focus(); await page.keyboard.press('Enter'); }
    };
    const layout = async () => {
      assert.equal(await page.locator('#modal').evaluate(modal => modal.scrollWidth > modal.clientWidth), false, `${name}: no horizontal overflow`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const bounds = await page.locator('#modal').boundingBox();
      assert(bounds.x >= -1 && bounds.x + bounds.width <= width + 1);
    };
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?scenario-preview=1`);
    await page.waitForFunction(() => !!window.__scenario);
    await page.evaluate(() => {
      window.__scenario.start({ traffic: 'quiet', noPolice: true });
      const idle = window.__scenario.execute({ op: 'step', seconds: 5 });
      if (idle.status !== 'passed') throw new Error(idle.error);
      const result = window.__scenario.execute({ op: 'advance', to: { day: 3, hour: 7 } });
      if (result.status !== 'passed') throw new Error(result.error);
    });
    assert.equal(await page.locator('#campaign-notice').isVisible(), true);
    await page.locator('#campaign-notice').click();
    await waitForDrawer(page, 'publications');
    assert.equal(await page.locator('.newspaper').getAttribute('data-edition-day'), '3');
    assert.match(await page.locator('.newspaper-headline').textContent(), /windows broken overnight/);
    await page.locator('.newspaper img').evaluate(image => image.decode());
    assert.equal(await page.locator('.newspaper img').evaluate(image => image.complete && image.naturalWidth > 0), true);
    const thirdPicture = await page.locator('.newspaper img').getAttribute('src');
    await page.evaluate(() => document.fonts.ready);
    await layout(); await page.screenshot({ path: resolve(output, `${name}-front-page.png`) });
    await activate('#edition-1');
    assert.equal(await page.locator('.newspaper').getAttribute('data-edition-day'), '1');
    assert.notEqual(await page.locator('.newspaper img').getAttribute('src'), thirdPicture);
    await layout();
    await page.keyboard.press('Escape'); await waitForDrawer(page, 'newsroom');
    await activate('#newsroom-publications'); await waitForDrawer(page, 'publications');
    // The remaining unread Day 2 opens first; the archive retains the other read issues.
    assert.equal(await page.locator('.newspaper').getAttribute('data-edition-day'), '2');
    await activate('#start');
    assert.equal(await page.locator('#overlay').isVisible(), false);
    const state = await page.evaluate(() => window.__scenario.render('world'));
    assert(state.campaign.editions.every(issue => issue.read));
    assert.equal(await page.locator('#campaign-notice').isVisible(), false);
    await context.close();

    // The normal live path opens its pending finale automatically at a safe stop.
    const endingContext = await newContext(browser, { viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
    const endingPage = await endingContext.newPage();
    await endingPage.goto(`${pathToFileURL(resolve('dist/index.html'))}?debug=1`);
    await endingPage.waitForFunction(() => !!window.__taxi);
    await endingPage.evaluate(() => { window.__taxi.toggle(false); window.__taxi.campaign(14 * 1440 + 7 * 60); });
    await waitForDrawer(endingPage, 'finale');
    assert.match(await endingPage.locator('#modal-title').textContent(), /Campaign complete/);
    await endingPage.keyboard.press('Escape');
    assert.equal(await endingPage.locator('#modal').getAttribute('data-page'), 'finale', 'pending finale requires its explicit continuation');
    await endingPage.evaluate(() => document.fonts.ready);
    await endingPage.screenshot({ path: resolve(output, `${name}-campaign-finale.png`) });
    const cash = await endingPage.locator('.finale-career strong').first().textContent();
    if (touch) await tapToConfirm(endingPage, '#final-edition');
    else await endingPage.locator('#final-edition').click();
    await waitForDrawer(endingPage, 'publications');
    assert.equal(await endingPage.locator('.newspaper').getAttribute('data-edition-day'), '14');
    await endingPage.keyboard.press('Escape'); await waitForDrawer(endingPage, 'finale');
    if (touch) await tapToConfirm(endingPage, '#arcade-continue');
    else await endingPage.locator('#arcade-continue').click();
    assert.equal(await endingPage.locator('#overlay').isVisible(), false);
    assert.equal(await endingPage.locator('#player-day').textContent(), 'Arcade');
    assert.equal(await endingPage.locator('#player-cash').textContent(), cash);
    await endingPage.keyboard.press('KeyP');
    await waitForDrawer(endingPage, 'home');
    assert.equal(await endingPage.locator('#menu-finale').count(), 1, 'recap remains available after continuation');
    await endingContext.close();
  }
} catch (error) { await captureFailure(); throw error; }
finally { await closeBrowser(browser); }
console.log('Daily editions and campaign finale browser checks passed');
