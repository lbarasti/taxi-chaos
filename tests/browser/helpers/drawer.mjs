import assert from 'node:assert/strict';
import { newContext } from '../runtime.mjs';

// Helpers for the actual game drawer; no test-only navigation API in the app.
export async function waitForDrawer(page, name) {
  await page.waitForFunction(name => document.querySelector('#modal').dataset.page === name, name);
  // Wheel steps roll a detached stage over the drawer; land it before asserting.
  await page.waitForFunction(() => !document.querySelector('#modal > .drawer-carousel'));
  await page.locator('#modal > .drawer-page').evaluate(async element => {
    await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished));
  });
}
export async function checkDetailFade(page, selector, opening) {
  const result = await page.locator(selector).evaluate((element, opening) => {
    const animation = element.getAnimations().find(animation => {
      const frames = animation.effect.getKeyframes();
      return Number(frames.at(-1).opacity) === (opening ? 1 : 0);
    });
    if (!animation) return { opacity: null };
    animation.pause();
    animation.currentTime = Number(animation.effect.getTiming().duration) / 2;
    const opacity = Number(getComputedStyle(element).opacity);
    if (!opening && matchMedia('(min-width:1000px)').matches) {
      // Hold just before completion, including the full backdrop, border and shadow.
      animation.currentTime = Number(animation.effect.getTiming().duration) - .01;
      const modal = element.closest('#modal'), bounds = modal.getBoundingClientRect();
      const menu = modal.querySelector('.drawer-menu-panel').getBoundingClientRect();
      const x = Math.floor(menu.right + parseFloat(getComputedStyle(modal).paddingRight) - 2);
      return { opacity, clip: { x, y: 40, width: Math.min(innerWidth, Math.ceil(bounds.right) + 64) - x, height: 80 } };
    }
    animation.play();
    return { opacity };
  }, opening);
  assert(result.opacity > 0 && result.opacity < 1, `${selector}: ${opening ? 'entry' : 'exit'} fades through partial opacity`);
  if (result.clip) {
    const screenshot = suffix => page.screenshot({ clip: result.clip, animations: 'allow',
      ...(process.env.SCREENSHOT_DIR ? { path: `${process.env.SCREENSHOT_DIR}/${selector.slice(1)}-${suffix}.png` } : {}) });
    const faded = await screenshot('fade-end');
    await page.locator(selector).evaluate(element => {
      element.getAnimations().find(animation => Number(animation.effect.getKeyframes().at(-1).opacity) === 0).finish();
    });
    await page.locator(selector).waitFor({ state: 'detached' });
    const removed = await screenshot('removed');
    assert(faded.equals(removed), `${selector}: removing the transparent panel must not change its backdrop, edges or shadow`);
  }
}
export async function tapToConfirm(page, selector) {
  const before = await page.locator('#modal').getAttribute('data-page');
  await page.locator(selector).tap();
  assert.equal(await page.locator('#modal').getAttribute('data-page'), before, 'first tap only selects');
  assert.equal(await page.locator(selector).getAttribute('data-selected'), 'true');
  await page.locator(selector).tap();
}
export async function openGame(browser, html, options, path = '/') {
  const context = await newContext(browser, options);
  await context.route('http://localhost:4173/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  const page = await context.newPage();
  await page.goto(`http://localhost:4173${path}`);
  return page;
}
