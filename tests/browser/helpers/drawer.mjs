import assert from 'node:assert/strict';
import { newContext } from '../runtime.mjs';

// Helpers for the actual game drawer; no test-only navigation API in the app.
export async function waitForDrawer(page, name) {
  await page.waitForFunction(name => document.querySelector('#modal').dataset.page === name, name);
  await page.locator('.drawer-page').evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.finished));
  });
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
