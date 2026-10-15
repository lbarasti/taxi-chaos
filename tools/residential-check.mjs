import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const output = resolve(process.env.SCREENSHOT_DIR ?? '/private/tmp/taxi-residential');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [], requests = [], report = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, offline: true });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?scenario-preview=1');
  await page.waitForFunction(() => !!window.__scenario);
  for (const [name, day, hour, cars, people] of [['morning', 1, 8, 10, 18], ['daytime', 1, 12, 6, 11], ['evening', 1, 18, 10, 18], ['night', 2, 2, 2, 3]]) {
    const result = await page.evaluate(({ day, hour }) => {
      __scenario.start({ traffic: 'normal', noPolice: true });
      __scenario.execute({ op: 'advance', to: { day, hour } });
      // Stay in the city while the off-screen residential population settles.
      const settled = __scenario.execute({ op: 'step', seconds: 5.1 });
      if (settled.status === 'failed') throw new Error(settled.error);
      __scenario.execute({ op: 'place', at: { x: 402.44, y: 77.161 }, angle: .24 });
      return __scenario.render('world', { zoom: 7 });
    }, { day, hour });
    assert.equal(result.residential.vehicles.length, cars, `${name} traffic budget`);
    assert.equal(result.residential.pedestrians.length, people, `${name} walking budget`);
    const later = await page.evaluate(() => {
      const result = __scenario.execute({ op: 'step', seconds: 10 });
      if (result.status === 'failed') throw new Error(result.error);
      return result.state;
    });
    const travelled = (key) => result.residential[key].filter(before => {
      const after = later.residential[key].find(p => p.id === before.id);
      return after && Math.hypot(after.position.x - before.position.x, after.position.y - before.position.y) > 2;
    }).length;
    assert(travelled('vehicles') >= Math.ceil(cars / 2), `${name} traffic physically moves`);
    assert(travelled('pedestrians') >= Math.ceil(people / 2), `${name} residents physically walk`);
    await page.evaluate(() => __scenario.render('world', { zoom: 7 }));
    await page.screenshot({ path: resolve(output, name + '.png') });
    report.push({ name, cars, people, movingCars: travelled('vehicles'), walkingResidents: travelled('pedestrians') });
  }
  await context.close();
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ report, errors, requests }, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
