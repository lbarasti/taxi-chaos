import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, newContext, closeBrowser, viewportTuples } from '../runtime.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = process.env.SCREENSHOT_DIR ?? path.join(root, 'scenario-runs/dialogue');
const browser = await launchBrowser();
const standalone = await readFile(path.join(root, 'dist/index.html'));
const run = (page, command) => page.evaluate(command => {
  const result = __scenario.execute(command);
  if (result.status !== 'passed') throw new Error(result.error);
  return result.state;
}, command);

async function capture(page, name, width, height) {
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#story img').evaluate(image => image.decode());
  const bounds = await page.locator('#story').boundingBox();
  assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1, 'dialogue stays inside viewport');
  assert.equal(await page.locator('#story').evaluate(el => el.scrollWidth > el.clientWidth), false);
  assert.equal(await page.locator('#story').evaluate(el => {
    const rect = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height - 12));
  }), true, 'dialogue remains above newspaper reminders and status toasts');
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  await page.locator('#story').screenshot({ path: path.join(output, `${name}-panel.png`) });
}

try {
  await mkdir(output, { recursive: true });
  for (const [viewport, width, height, touch] of viewportTuples('desktop', 'compact', 'compact-landscape')) {
    const context = await newContext(browser, { viewport: { width, height }, isMobile: touch, hasTouch: touch });
    // Serve the exact standalone artifact through an intercepted offline route;
    // managed Chromium policies may disallow file:// navigation.
    await context.route('http://localhost:4173/**', route => route.fulfill({ contentType: 'text/html', body: standalone }));
    const page = await context.newPage();
    await page.goto('http://localhost:4173/?scenario-preview=1');
    for (const character of viewport === 'desktop' ? ['Sam', 'June', 'Ravi', 'Cleo', 'Oscar'] : ['Sam']) {
      await page.evaluate(() => __scenario.start({ traffic: 'quiet', noPolice: true }));
      let state;
      for (let i = 0; i < 5; i++) {
        state = await run(page, { op: 'ordinary' });
        if (state.job.name === character) break;
      }
      assert.equal(state.job.name, character);
      state = await run(page, { op: 'step', seconds: 0.01 });
      assert.equal(state.job.stage, 'pickup');
      assert.equal(state.dialogue.message.speaker, 'bea');
      assert.equal(state.dialogue.message.channel, 'dispatch');
      assert.match(await page.locator('#story-label').textContent(), /DISPATCH/);
      assert.equal(await page.locator('#story-name').textContent(), 'BEA SANTOS');
      const dispatchPortrait = await page.locator('#story-portrait').getAttribute('src');
      await run(page, { op: 'read' });
      if (character === 'Sam') await capture(page, `${viewport}-dispatch`, width, height);
      // Initial parked fixture placement. From boarding onward, use only physics.
      await run(page, { op: 'place', at: 'pickup', angle: Math.PI / 2 });
      state = await run(page, { op: 'step', seconds: 0.9 });
      assert.equal(state.job.stage, 'dropoff');
      assert.equal(state.dialogue.message.speaker, character.toLowerCase());
      assert.equal(state.dialogue.message.channel, 'passenger');
      assert.equal(await page.locator('#story-name').textContent(), character.toUpperCase());
      assert.match(await page.locator('#story-label').textContent(), /ON BOARD/);
      const passengerPortrait = await page.locator('#story-portrait').getAttribute('src');
      assert.notEqual(passengerPortrait, dispatchPortrait);
      await run(page, { op: 'read' });
      await capture(page, `${viewport}-${character.toLowerCase()}-pickup`, width, height);
      if (character === 'Sam') {
        await run(page, { op: 'step', seconds: 2, keys: ['KeyW'] });
        state = await run(page, { op: 'step', seconds: 7 });
        assert.equal(state.job.stage, 'dropoff');
        assert.match(state.dialogue.beatId, /-during$/);
        assert.equal(state.dialogue.message.speaker, 'sam');
        assert.equal(state.dialogue.message.channel, 'passenger');
        assert.equal(await page.locator('#story-portrait').getAttribute('src'), passengerPortrait);
        await run(page, { op: 'read' });
        await capture(page, `${viewport}-sam-during`, width, height);
        // Short landscape panels scroll, including access to their replay action.
        await page.locator('#story-read').scrollIntoViewIfNeeded();
        assert(await page.locator('#story-read').isVisible());
        await page.locator('#story').evaluate(el => { el.scrollTop = 0; });
        await page.locator('#story-close').click();
        assert.match(await page.locator('#story-read').textContent(), /Sam.*Replay/);
        await page.locator('#story-read').click();
        assert.equal(await page.locator('#story-name').textContent(), 'SAM');
      }
    }
    // Delivery fixtures isolate the UI handoff from the physical driving checks above.
    await page.evaluate(() => __scenario.start({ traffic: 'quiet', noPolice: true }));
    await run(page, { op: 'pickup' });
    await run(page, { op: 'read' });
    let delivered = await run(page, { op: 'deliver' });
    const goodbye = delivered.dialogue.beatId;
    const waiting = page.locator('#dispatch-waiting');
    assert(await waiting.isVisible(), 'delivery signals a waiting call on Dispatch');
    assert.equal(await page.locator('.navigation-hud').getAttribute('data-state'), 'vacant');
    assert.equal(await page.locator('#dispatch').getAttribute('aria-pressed'), 'false');
    assert.match(await page.locator('#dispatch').getAttribute('aria-label'), /new call waiting/);
    await run(page, { op: 'read' });
    delivered = await run(page, { op: 'step', seconds: 12 });
    assert.equal(delivered.dialogue.beatId, goodbye, 'waiting never replaces the goodbye');
    await capture(page, `${viewport}-call-waiting`, width, height);
    await page.locator('#story-close').click();
    delivered = await run(page, { op: 'step', seconds: 12 });
    assert.equal(delivered.dialogue.beatId, goodbye, 'collapsing the goodbye does not answer Dispatch');
    if (touch) await page.locator('#dispatch').tap();
    else { await page.locator('#dispatch').focus(); await page.keyboard.press('Enter'); }
    let answered = await run(page, { op: 'step', seconds: 0.01 });
    assert.equal(answered.job.name, delivered.job.name, 'answer the waiting call without replacing it');
    assert.equal(answered.dialogue.message.channel, 'dispatch');
    assert.equal(answered.dialogue.message.speaker, 'bea');
    assert(answered.dialogue.message.text.includes(answered.job.destination));
    assert.equal(await waiting.isVisible(), false);
    assert.equal(await page.locator('.navigation-hud').getAttribute('data-state'), 'engaged');
    assert.equal(await page.locator('#dispatch').getAttribute('aria-pressed'), 'true');
    await run(page, { op: 'read' });
    await capture(page, `${viewport}-call-answered`, width, height);
    const elapsed = (await run(page, { op: 'step', seconds: 0.01 })).dialogue.elapsed;
    await page.locator('#dispatch').click();
    await page.locator('#dispatch').click();
    answered = await run(page, { op: 'step', seconds: 0.01 });
    assert(answered.dialogue.elapsed >= elapsed, 'guidance toggles do not restart Bea');
    // Routing a text booking instead consumes the waiting call without a later pop-in.
    await page.evaluate(() => __scenario.start({ traffic: 'quiet', noPolice: true }));
    await run(page, { op: 'pickup' });
    await run(page, { op: 'deliver' });
    await run(page, { op: 'route', mission: 'celia-barriers' });
    assert.equal(await waiting.isVisible(), false);
    const routed = await run(page, { op: 'step', seconds: 12 });
    // This delivery leaves the cab at Celia's pickup: waiting can legitimately
    // board her. The cancelled Dispatch call must never replace her dialogue.
    assert.equal(routed.job.missionId, 'celia-barriers');
    assert.notEqual(routed.dialogue?.message.channel, 'dispatch');
    assert.equal(await waiting.isVisible(), false);
    assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
    await context.close();
    console.log(`PASS ${viewport}: dispatch, passenger identity, cabin portraits, physical during-ride transition and replay`);
  }
} finally { await closeBrowser(browser); }
