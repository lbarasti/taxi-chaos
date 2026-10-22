import { createServer } from 'vite';
import { chromium } from 'playwright';
import { parseArgs } from 'node:util';

const common = { width: 1440, height: 900, dpr: 2, cpu: 1, headless: false };
export function perfOptions(defaults) {
  const schema = { ...common, ...defaults };
  const { values } = parseArgs({ options: Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, {
    type: typeof value === 'boolean' ? 'boolean' : 'string',
    ...(value == null ? {} : { default: typeof value === 'boolean' ? value : String(value) }),
  }])) });
  for (const [key, fallback] of Object.entries(schema)) if (typeof fallback === 'number') {
    values[key] = Number(values[key]);
    if (!Number.isFinite(values[key])) throw new Error(`--${key} must be finite`);
  }
  for (const key of ['port', 'width', 'height', 'rounds']) if (key in values && (!Number.isInteger(values[key]) || values[key] < 1)) throw new Error(`--${key} must be a positive integer`);
  for (const key of ['seconds', 'dpr', 'cpu']) if (key in values && values[key] <= 0) throw new Error(`--${key} must be positive`);
  if (values.cpu < 1) throw new Error('--cpu must be at least 1');
  return values;
}

export function stats(values, digits = 2) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b), factor = 10 ** digits;
  const at = p => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] * factor) / factor;
  return { count: values.length, min: at(0), median: at(0.5), p95: at(0.95), p99: at(0.99), max: at(1) };
}

/** Own setup/cleanup even when launch, navigation or a benchmark callback fails. */
export async function withPerf({ root, port, width, height, dpr, cpu, headless, blank = false }, run) {
  const server = await createServer({ root, server: { port, strictPort: true, host: '127.0.0.1' }, logLevel: 'error' });
  if (blank) server.middlewares.use('/__perf', (_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>Taxi Chaos performance benchmark</title><style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style>');
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless,
      args: headless ? [] : [`--window-size=${width + 60},${height + 100}`] });
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const session = await context.newCDPSession(page);
    if (cpu > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    const browserSession = await browser.newBrowserCDPSession();
    const { gpu } = await browserSession.send('SystemInfo.getInfo');
    await browserSession.detach();
    const metadata = { browser: browser.version(), node: process.version, viewport: { width, height, dpr }, cpu, headless,
      hardware: { devices: gpu.devices, features: gpu.featureStatus } };
    await page.goto(`http://127.0.0.1:${port}/${blank ? '__perf' : '?debug=1'}`);
    if (!blank) await page.waitForFunction(() => !!window.__taxi, undefined, { timeout: 30000 });
    await run({ page, context, session, metadata, errors });
    if (errors.length) throw new Error(`Page errors: ${errors.join('\n')}`);
  } finally {
    try { await browser?.close(); } finally { await server.close(); }
  }
}
