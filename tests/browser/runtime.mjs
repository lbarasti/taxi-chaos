import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

export const viewports = Object.freeze({
  desktop: { width: 1440, height: 900, touch: false },
  portrait: { width: 390, height: 844, touch: true },
  compact: { width: 320, height: 568, touch: true },
  landscape: { width: 844, height: 390, touch: true },
  compactLandscape: { width: 568, height: 320, touch: true },
});
export function viewportTuples(...names) {
  const aliases = { small: 'compact', 'compact-landscape': 'compactLandscape' };
  return names.map(name => {
    const size = viewports[aliases[name] || name];
    if (!size) throw new Error(`Unknown shared viewport: ${name}`);
    return [name, size.width, size.height, size.touch];
  });
}

export async function probeBrowser() {
  const candidates = [...new Set([process.env.CHROMIUM_PATH, chromium.executablePath()].filter(Boolean))];
  const failures = [];
  for (const executablePath of candidates) {
    if (!existsSync(executablePath)) { failures.push(`${executablePath}: missing`); continue; }
    try {
      const browser = await chromium.launch({ executablePath });
      try { const page = await browser.newPage(); await page.goto('about:blank'); }
      finally { await browser.close(); }
      return { executablePath, failures };
    } catch (error) { failures.push(`${executablePath}: ${error.message}`); }
  }
  return { executablePath: null, failures };
}

const sessions = new WeakMap();
const active = new Set();
export async function launchBrowser() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath() });
  const session = { errors: [], requests: [], pages: new Set() };
  sessions.set(browser, session);
  active.add(session);
  return browser;
}

export async function newContext(browser, options = {}) {
  const context = await browser.newContext({ ...options, offline: true });
  const session = sessions.get(browser);
  context.on('page', page => {
    session.pages.add(page);
    page.on('close', () => session.pages.delete(page));
    page.on('pageerror', error => session.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') session.errors.push(message.text()); });
    page.on('request', request => {
      const url = request.url();
      if (/^https?:/.test(url) && !url.startsWith('http://localhost:4173/')) session.requests.push(url);
    });
  });
  return context;
}

export async function newPage(browser, options = {}) {
  const context = await newContext(browser, options);
  return context.newPage();
}

export async function closeBrowser(browser) {
  const session = sessions.get(browser);
  if (session.errors.length || session.requests.length) await captureFailure();
  await browser.close();
  active.delete(session);
  assert.deepEqual(session.errors, [], 'browser page errors');
  assert.deepEqual(session.requests, [], 'external runtime requests');
}

// A failing case saves its live pages before Node reports the assertion. The runner
// gives each case its own ignored directory, so parallel CI logs have stable links.
export async function captureFailure() {
  if (process.env.BROWSER_CASE_OUTPUT) {
    const directory = process.env.BROWSER_CASE_OUTPUT;
    mkdirSync(directory, { recursive: true });
    let index = 0;
    for (const session of active) for (const page of session.pages) {
      try { await page.screenshot({ path: path.join(directory, `failure-${++index}.png`), timeout: 3000 }); }
      catch { /* The page may already have closed. */ }
    }
  }
}
process.on('uncaughtException', async error => {
  await captureFailure();
  console.error(error);
  process.exit(1);
});
