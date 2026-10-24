// Real HUD entry and shared pause widgets in isolated, offline standalone games.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser, newContext, closeBrowser, captureFailure } from '../runtime.mjs';
import { checkDetailFade, tapToConfirm, waitForDrawer } from '../helpers/drawer.mjs';

const output = resolve(process.env.SCREENSHOT_DIR ?? process.argv[2] ?? 'scenario-runs/newsroom');
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
try {
  for (const { name, width, height, touch } of [
    { name: 'desktop', width: 1440, height: 900, touch: false },
    { name: 'desktop-short', width: 1280, height: 400, touch: false },
    { name: 'portrait', width: 390, height: 844, touch: true },
    { name: 'compact', width: 320, height: 568, touch: true },
    { name: 'landscape', width: 844, height: 390, touch: true },
    { name: 'landscape-480', width: 480, height: 320, touch: true },
  ]) {
    const context = await newContext(browser, { viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?scenario-preview=1`);
    await page.waitForFunction(() => !!window.__scenario);
    await page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));
    const command = async command => {
      const result = await page.evaluate(command => window.__scenario.execute(command), command);
      assert.equal(result.status, 'passed', result.error);
      return result.state;
    };
    const state = () => page.evaluate(() => window.__scenario.render('world'));
    const activate = async selector => {
      if (touch) await tapToConfirm(page, selector);
      else { await page.locator(selector).focus(); await page.keyboard.press('Space'); }
    };
    const open = async expected => {
      if (touch) await page.locator('#newsroom').tap();
      else { await page.locator('#newsroom').focus(); await page.keyboard.press('Enter'); }
      await waitForDrawer(page, 'newsroom');
      assert.equal(await page.locator('#modal-title').textContent(), 'Newsroom.');
      assert.equal(await page.locator('#newsroom-summary').textContent(), expected);
      assert.equal(await page.locator('#modal.splash-modal .game-menu').count(), 1);
      assert.equal(await page.locator('#newsroom').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'notebook-route');
      assert.equal(await page.locator('#modal [data-record], #modal [data-story]').count(), 0, 'no section opened automatically');
      assert.equal(await page.locator('#newsroom-notebook').count(), 0);
      assert.equal(await page.locator('#newsroom-detail').count(), 0, 'newsroom opens without a detail column');
      assert(await page.locator('#modal').evaluate(modal => modal.getBoundingClientRect().width <= 540));
      assert.doesNotMatch(await page.locator('#modal').textContent(), /Other notes|Dispatch notebook/);
    };
    const select = async id => {
      await activate(`#newsroom-open-${id}`);
      await waitForDrawer(page, 'newsroom');
      assert.equal(await page.locator(`#newsroom-open-${id}`).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-newsroom-section][aria-pressed="true"]').count(), 1);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'newsroom-menu', 'activation selects the right pane’s first item, Back');
      assert.equal(await page.locator('#newsroom-detail button').first().getAttribute('id'), 'newsroom-menu');
    };
    const records = group => page.locator(`${group ? `#newsroom-${group} + p + .notebook-entries` : '#newsroom-detail'} [data-record]`).evaluateAll(articles => articles.map(article => article.dataset.record));
    const close = async () => {
      const detailOpen = await page.locator('#newsroom-detail').count();
      await page.keyboard.press('Escape');
      if (detailOpen) await page.locator('#newsroom-detail').waitFor({ state: 'detached' });
      if (await page.locator('#overlay').isVisible()) {
        assert.match(await page.evaluate(() => document.activeElement.id), /^newsroom-open-/);
        await page.keyboard.press('Escape');
      }
      assert.equal(await page.locator('#overlay').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'city');
    };
    const shot = async suffix => {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: resolve(output, `${name}-${suffix}.png`) });
    };
    const layout = async () => {
      const result = await page.evaluate(() => {
        const modal = document.querySelector('#modal');
        const menu = modal.querySelector('.drawer-menu-panel').getBoundingClientRect();
        const detail = modal.querySelector('#newsroom-detail')?.getBoundingClientRect();
        return { overflow: modal.scrollWidth > modal.clientWidth || document.documentElement.scrollWidth > innerWidth,
          columns: getComputedStyle(modal.querySelector('.drawer-columns')).gridTemplateColumns.split(' ').length,
          hasDetail: !!detail, sideBySide: detail?.left >= menu.right, stacked: detail?.top >= menu.bottom,
          width: modal.getBoundingClientRect().width,
          buttons: [...modal.querySelectorAll('button')].filter(button => button.getClientRects().length).map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })) };
      });
      assert.equal(result.overflow, false, `${name}: no horizontal overflow`);
      assert.equal(result.columns, width >= 1000 && result.hasDetail ? 2 : 1);
      if (result.hasDetail) assert(width >= 1000 ? result.sideBySide : result.stacked, `${name}: menu/detail placement`);
      assert(result.width <= (width >= 1000 && result.hasDetail ? 1080 : 540));
      assert(result.buttons.every(b => b.width >= 44 && b.height >= 44), `${name}: shared actions stay touch-sized`);
      for (const id of ['notebook-route', 'newsroom-open-sources', 'newsroom-publications', 'start']) {
        await page.locator(`#${id}`).scrollIntoViewIfNeeded();
        const b = await page.locator(`#${id}`).boundingBox();
        assert(b.x >= -1 && b.y >= -1 && b.x + b.width <= width + 1 && b.y + b.height <= height + 1, `${name}: ${id} remains reachable`);
      }
      await page.locator('#modal').evaluate(modal => { modal.scrollTop = 0; });
      await page.locator('.drawer-menu-panel').evaluate(panel => { panel.scrollTop = 0; });
    };
    // Normalize explicit scrolling of a short left pane, not changes in its alignment.
    const menuPositions = () => page.locator('.drawer-menu-content').evaluate(panel => [...panel.querySelectorAll('#modal-title, .game-menu button')].map(element => ({ id: element.id, y: element.getBoundingClientRect().top + panel.parentElement.scrollTop })));
    const stableMenu = async baseline => {
      if (width < 1000) return;
      const positions = await menuPositions();
      for (const [index, position] of positions.entries()) assert(Math.abs(position.y - baseline[index].y) < 1, `${name}: ${position.id} must not shift with detail content/scrolling`);
    };

    const original = await state();
    const empty = '0 sources to submit · 0 sources being checked';
    await open(empty);
    await shot('menu');
    await page.locator('#newsroom').dispatchEvent('click');
    await layout();
    // Merely selecting/focusing a row must not populate its detail panel.
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'newsroom-open-sources');
    assert.equal(await page.locator('#newsroom-detail').count(), 0, 'focus alone keeps the column hidden');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'newsroom-menu');
    assert.match(await page.locator('#newsroom-detail').textContent(), /No collected sources awaiting submission/);
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'newsroom-menu', 'empty detail still has an accessible return action');
    await close();
    const after = await state();
    assert.deepEqual(after.campaign, original.campaign); assert.deepEqual(after.job, original.job);
    assert.deepEqual(after.notebookIds, original.notebookIds); assert.equal(after.navigation, original.navigation);
    // Reading never changes guidance. Routing remains an explicit physical-world action.
    await open(empty); await activate('#notebook-route');
    assert.equal((await state()).navigation, 'newsroom');
    await open(empty); assert.equal(await page.locator('#notebook-route').textContent(), 'Cancel newsroom route');
    await activate('#notebook-route'); assert.equal((await state()).navigation, 'fare');

    await command({ op: 'ordinary' });
    await command({ op: 'pickup' }); await command({ op: 'read' }); await command({ op: 'deliver' });
    await command({ op: 'route', mission: 'celia-barriers' });
    await command({ op: 'pickup' }); await command({ op: 'deliver' });
    await command({ op: 'advance', to: { day: 3 } });
    await command({ op: 'place', at: 'garden-cafe' }); await page.locator('#observe').click();
    await command({ op: 'route', mission: 'nico-safe-ride' });
    await command({ op: 'pickup' }); await command({ op: 'deliver' });
    await open('3 sources to submit · 0 sources being checked');
    await select('sources');
    assert.equal(await page.locator('[data-submit]:not(:disabled)').count(), 0, 'sources still require a physical newsroom visit');
    assert.equal(await page.locator('[data-record] button[aria-disabled="true"]').count(), 3, 'unavailable sources remain selectable');
    await page.keyboard.press('ArrowDown');
    const remoteBefore = await page.locator('#newsroom-detail').innerHTML();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#newsroom-detail').innerHTML(), remoteBefore, 'selecting an unavailable source does not submit it');
    await close();
    await command({ op: 'place', at: 'newsroom' }); await command({ op: 'submit', material: 'cleaner-note' });
    const retained = (await state()).notebookIds;
    const summary = '2 sources to submit · 1 source being checked';
    await open(summary);
    const menuBefore = await menuPositions();
    await select('sources');
    await stableMenu(menuBefore);
    assert.deepEqual(await records('to-submit'), ['cafe-photo', 'barrier-receipt']);
    assert.deepEqual(await records('checking'), ['cleaner-note']);
    assert.deepEqual(await records('checked'), []);
    assert.equal((await records()).length, 3, 'all collected publication sources appear together');
    assert.equal(await page.locator('[data-newsroom-section]').count(), 1);
    await layout(); await shot('summary');
    // Focus/navigation stays in the right pane and reaches real submission controls.
    await select('sources');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'submit-cafe-photo');
    assert.equal(await page.locator('[data-record="cafe-photo"] > button').getAttribute('data-selected'), 'true', 'the whole source is selected');
    assert.equal(await page.locator('#submit-cafe-photo').evaluate(element => getComputedStyle(element).borderLeftColor), 'rgb(247, 206, 85)', 'selected source has the gold accent');
    await shot('source-selected');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'submit-barrier-receipt');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'submit-cleaner-note', 'checking sources are also selectable');
    assert.equal(await page.locator('#submit-cleaner-note').getAttribute('data-selected'), 'true');
    if (!touch) {
      await page.locator('[data-record="cafe-photo"] .source-text').hover();
      assert.equal(await page.locator('#submit-cafe-photo').getAttribute('data-selected'), 'true', 'hover selects the entire record, not a nested action');
      await page.locator('[data-record="cleaner-note"] .source-text').hover();
    }
    const checkingBefore = await page.locator('#newsroom-detail').innerHTML(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#newsroom-detail').innerHTML(), checkingBefore, 'checking copies cannot be submitted again');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'newsroom-menu');
    await stableMenu(menuBefore);
    assert.match(await page.locator('[data-record="cleaner-note"]').textContent(), /source check due Day 3 · 10:/);
    const leftScroll = await page.locator('.drawer-menu-panel').evaluate(panel => panel.scrollTop);
    await page.locator('#newsroom-checking').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.drawer-menu-panel').evaluate(panel => panel.scrollTop), leftScroll, 'scrolling the right pane does not scroll the left');
    await shot('checking');
    await stableMenu(menuBefore);
    assert.equal(await page.locator('[data-record="contractor-register"]').count(), 0);
    if (touch) {
      await activate('#newsroom-menu');
      assert.equal(await page.locator('#newsroom-detail').count(), 0, 'Back removes the detail column');
      assert.equal(await page.locator('#newsroom-open-sources').getAttribute('aria-pressed'), 'false');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'newsroom-open-sources');
      await layout();
    }
    if (name === 'portrait' || name === 'landscape') {
      const cdp = await context.newCDPSession(page), insets = { top: 32, left: 54, bottom: 34, right: 44 };
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
      const padding = await page.locator('#modal').evaluate(element => {
        const style = getComputedStyle(element);
        return { top: parseFloat(style.paddingTop), left: parseFloat(style.paddingLeft), bottom: parseFloat(style.paddingBottom), right: parseFloat(style.paddingRight) };
      });
      for (const edge of Object.keys(insets)) assert(padding[edge] >= insets[edge]);
      await layout(); await select('sources'); await layout();
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, bottom: 0, right: 0 } }); await cdp.detach();
    }
    await page.locator('#notebook-route').focus(); await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'start', 'left menu wraps independently of detail controls');
    await page.keyboard.press('ArrowDown'); assert.equal(await page.evaluate(() => document.activeElement.id), 'notebook-route');
    await activate('#start');

    await command({ op: 'advance', minutes: 180 });
    await open('2 sources to submit · 0 sources being checked');
    await select('sources'); assert.deepEqual(await records('checked'), ['cleaner-note']);
    const beforeSubmission = await menuPositions();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'submit-barrier-receipt');
    await page.keyboard.press('Enter');
    assert.deepEqual(await records('to-submit'), ['cafe-photo']);
    assert.deepEqual(await records('checking'), ['barrier-receipt']);
    assert.equal(await page.evaluate(() => document.querySelector('#newsroom-detail').contains(document.activeElement)), true, 'regrouping retains right-pane focus');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'submit-barrier-receipt', 'submitted row stays selected after moving to Being checked');
    await stableMenu(beforeSubmission);
    await activate('#submit-cafe-photo'); assert.deepEqual(await records('to-submit'), []);
    assert.deepEqual(await records('checking'), ['cafe-photo', 'barrier-receipt']);
    assert.deepEqual(await records('checked'), ['cleaner-note']);
    await stableMenu(beforeSubmission);
    await close(); assert.deepEqual((await state()).notebookIds, retained, 'all originals and general notes retained');
    await command({ op: 'advance', minutes: 180 });
    await open(empty); await select('sources'); assert.equal((await records('checked')).length, 3); await shot('checked');
    assert.equal(await page.locator('#newsroom-open-stories, [data-story], [data-publish]').count(), 0);
    assert.match(await page.locator('.drawer-menu-content').textContent(), /automatically scheduled/);
    await close();
    assert.equal((await state()).campaign.newsroom.cases.coordination.editionAt, 4680);
    await command({ op: 'reload' });
    assert.equal((await state()).campaign.newsroom.cases.coordination.editionAt, 4680);
    // The player leaves after submitting sources. Publication needs no return visit.
    await command({ op: 'place', at: 'garden-cafe' });
    await command({ op: 'advance', to: { day: 4, hour: 6 } });
    assert.equal((await state()).campaign.publications.length, 1);
    await open(empty); await shot('published');
    await activate('#newsroom-publications'); await waitForDrawer(page, 'publications');
    assert.equal(await page.locator('.newspaper-lead').getAttribute('data-article'), 'closure-investigation');
    await activate('#read-article-day-4');
    assert.equal(await page.locator('.newspaper-lead').getAttribute('data-article'), 'day-4');
    assert.match(await page.locator('.newspaper-copy').textContent(), /Plywood now covers/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'publication-front');
    assert.equal(await page.locator('#modal').evaluate(modal => modal.scrollWidth > modal.clientWidth), false);
    await shot('article');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.newspaper-lead').getAttribute('data-article'), 'closure-investigation');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'read-article-day-4');
    await activate('#read-article-day-4');
    await activate('#publication-front');
    assert.equal(await page.locator('.newspaper-lead').getAttribute('data-article'), 'closure-investigation');
    await activate('#read-article-day-4');
    await activate('#edition-3');
    assert.equal(await page.locator('.newspaper-lead').getAttribute('data-article'), 'day-3', 'changing editions clears article selection');
    assert.equal(await page.locator('#publication-front').count(), 0);
    await page.keyboard.press('Escape'); await waitForDrawer(page, 'newsroom');
    await close();
    await page.locator('#city').focus(); await page.keyboard.press('KeyE'); assert.equal((await state()).onFoot, true);
    await open(empty); await select('sources'); assert.equal((await records('checked')).length, 3); await close();
    // The notebook remains available from This shift, outside the newsroom.
    await page.keyboard.press('Tab'); await waitForDrawer(page, 'shift'); await activate('#open-notebook'); await waitForDrawer(page, 'shift'); await page.locator('#shift-menu').waitFor();
    assert.equal(await page.locator('#menu-notebook-guide, #notebook-route, #notebook-back').count(), 0);
    assert.equal(await page.locator('[data-record="cafe-photo"]').count(), 1);
    assert.equal(await page.locator('.editorial-cases, [data-story], [data-publish]').count(), 0);
    await command({ op: 'mode', mode: 'playing' });
    assert.equal(await page.evaluate(() => localStorage.getItem('taxi-chaos-v1')), null);
    await context.close();
    console.log(`${name}: activation-only menu/detail, source lifecycle, automatic publication, retention, routing and layout passed`);
  }
  // Real RAF pause/resume and controller activation outside the fixed-clock harness.
  {
    const context = await newContext(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?debug=1&dialogue-preview=1`);
    await page.waitForFunction(() => !!window.__taxi);
    await page.evaluate(() => { window.__taxi.toggle(false); window.__taxi.realtime(); });
    await page.locator('#newsroom').click(); await waitForDrawer(page, 'newsroom');
    const frozen = await page.evaluate(() => window.__taxi.state()); assert.equal(frozen.mode, 'paused');
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => window.__taxi.state()), frozen);
    await page.evaluate(() => {
      window.testPad = { connected: true, mapping: 'standard', id: 'DualSense', axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
      navigator.getGamepads = () => [window.testPad]; window.testPad.buttons[13].pressed = true;
    });
    await page.waitForFunction(() => document.activeElement.id === 'newsroom-open-sources');
    assert.match(await page.locator('#menu-hint').textContent(), /D-pad Select · × Confirm/);
    assert.equal(await page.locator('#newsroom-detail').count(), 0);
    await page.evaluate(() => { window.testPad.buttons[13].pressed = false; }); await page.waitForTimeout(50);
    await page.evaluate(() => { window.testPad.buttons[0].pressed = true; });
    await page.waitForFunction(() => document.activeElement.id === 'newsroom-menu');
    await checkDetailFade(page, '#newsroom-detail', true);
    await waitForDrawer(page, 'newsroom');
    assert.equal(await page.locator('#newsroom-open-sources').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#newsroom-detail').textContent(), /No collected sources awaiting submission/);
    const menuPanel = await page.locator('.drawer-menu-panel').elementHandle();
    await page.evaluate(() => { window.testPad.buttons[0].pressed = false; window.testPad.buttons[1].pressed = true; });
    await page.waitForFunction(() => document.activeElement.id === 'newsroom-open-sources');
    await checkDetailFade(page, '#newsroom-detail', false);
    await page.locator('#newsroom-detail').waitFor({ state: 'detached' });
    assert(await menuPanel.evaluate(panel => panel.isConnected), 'Back preserves the mounted menu instead of repainting it');
    assert.equal(await page.locator('#newsroom-detail').count(), 0, 'controller Back clears the detail selection');
    await page.evaluate(() => { window.testPad.buttons[1].pressed = false; }); await page.waitForTimeout(50);
    await page.evaluate(() => { window.testPad.buttons[1].pressed = true; });
    await page.locator('#overlay').waitFor({ state: 'hidden' });
    await page.evaluate(() => { navigator.getGamepads = () => []; }); await page.waitForTimeout(150);
    const resumed = await page.evaluate(() => window.__taxi.state());
    assert.equal(resumed.mode, 'playing'); assert(resumed.time > frozen.time);
    assert.equal(resumed.playerId, frozen.playerId); assert.equal(resumed.job.customerId, frozen.job.customerId);
    assert.equal(await page.evaluate(() => localStorage.getItem('taxi-chaos-v1')), null);
    await context.close();
    console.log('Realtime: frozen physics/clocks, controller select/confirm and realtime restoration passed');
  }
  console.log(`Offline newsroom checks passed; screenshots: ${output}`);
} catch (error) { await captureFailure(); throw error; } finally { await closeBrowser(browser); }
