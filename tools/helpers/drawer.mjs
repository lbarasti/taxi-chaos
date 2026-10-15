import assert from 'node:assert/strict';

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
export async function openGame(browser, html, options, problems, path = '/') {
  const context = await browser.newContext(options);
  await context.route('http://localhost:4173/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  const page = await context.newPage();
  page.on('pageerror', error => problems.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') problems.errors.push(message.text()); });
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://localhost:4173/')) problems.requests.push(request.url());
  });
  await page.goto(`http://localhost:4173${path}`);
  return page;
}
