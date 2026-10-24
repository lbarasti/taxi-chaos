// One horizontal wheel for the shift and newsroom panels: real entry points,
// keyboard/pointer travel, the guard inside detail panes, and layout.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser, newContext, closeBrowser, captureFailure } from '../runtime.mjs';
import { tapToConfirm, waitForDrawer } from '../helpers/drawer.mjs';

const output = resolve(process.env.SCREENSHOT_DIR ?? process.argv[2] ?? 'scenario-runs/panels');
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
try {
  for (const { name, width, height, touch } of [
    { name: 'desktop', width: 1440, height: 900, touch: false },
    { name: 'desktop-short', width: 1280, height: 400, touch: false },
    { name: 'portrait', width: 390, height: 844, touch: true },
    { name: 'compact', width: 320, height: 568, touch: true },
    { name: 'landscape', width: 844, height: 390, touch: true },
  ]) {
    const context = await newContext(browser, { viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?scenario-preview=1`);
    await page.waitForFunction(() => !!window.__scenario);
    await page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));

    const wheel = page.locator('.drawer-wheel-next');
    const hint = () => page.locator('#menu-hint').textContent();
    const activeId = () => page.evaluate(() => document.activeElement.id);
    // Layout position, independent of any panel scrolling on short screens.
    const titleTop = () => page.evaluate(() => document.querySelector('#modal-title').offsetTop);
    const neighbour = () => page.evaluate(() => {
      const title = document.querySelector('#modal-title'), next = document.querySelector('.drawer-wheel-next');
      const box = next.getBoundingClientRect(), heading = title.getBoundingClientRect();
      return { side: box.right <= heading.left + 1 ? 'before' : 'after', dim: getComputedStyle(next).color, titleColor: getComputedStyle(title).color };
    });
    const go = async (panel, key) => {
      if (touch) await tapToConfirm(page, '.drawer-wheel-next');
      else await page.keyboard.press(key);
      await waitForDrawer(page, panel);
      assert.equal(await page.locator('#modal').getAttribute('data-page'), panel);
    };
    const layout = async () => {
      const result = await page.evaluate(() => {
        const modal = document.querySelector('#modal');
        const box = modal.querySelector('.drawer-wheel-next').getBoundingClientRect();
        const bounds = modal.getBoundingClientRect();
        return {
          overflow: modal.scrollWidth > modal.clientWidth || document.documentElement.scrollWidth > innerWidth,
          width: bounds.width, tab: { width: box.width, height: box.height },
          inside: box.left >= bounds.left - 1 && box.right <= bounds.right + 1,
          buttons: [...modal.querySelectorAll('button')].filter(button => button.getClientRects().length)
            .map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })),
        };
      });
      assert.equal(result.overflow, false, `${name}: no horizontal overflow`);
      assert(result.width <= 540, `${name}: a menu-only panel keeps the compact drawer`);
      assert(result.tab.width >= 44 && result.tab.height >= 44, `${name}: the wheel tab is touch-sized`);
      assert(result.inside, `${name}: the wheel tab stays inside the drawer`);
      assert(result.buttons.every(button => button.width >= 44 && button.height >= 44), `${name}: shared actions stay touch-sized`);
    };
    const shot = async suffix => {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: resolve(output, `${name}-${suffix}.png`) });
    };

    // The shift keeps its HUD/Tab entry point and now advertises its neighbour.
    if (touch) await page.locator('#shift').tap(); else await page.keyboard.press('Tab');
    await waitForDrawer(page, 'shift');
    assert.equal(await page.locator('#modal-title').textContent(), 'Your shift.');
    assert.equal(await wheel.count(), 1);
    assert.equal(await wheel.getAttribute('aria-label'), 'Newsroom panel');
    assert.equal(await wheel.getAttribute('aria-keyshortcuts'), 'ArrowRight');
    assert.match(await wheel.textContent(), /Newsroom/);
    assert.equal(await hint(), touch ? 'Tap to select · Tap again to confirm' : '← → Panels · ↑ ↓ Select · Enter Confirm');
    assert.equal(await activeId(), 'ordinary-fare', 'the neighbour tab is not part of the vertical action cycle');
    assert.equal(await page.locator('.drawer-wheel-next[data-selected]').count(), 0);
    const shiftSide = await neighbour();
    assert.equal(shiftSide.side, 'after', 'the newsroom title waits to the right of the current title');
    assert.notEqual(shiftSide.dim, shiftSide.titleColor, 'the neighbour is visibly not selected');
    const shiftTitle = await titleTop();
    await layout(); await shot('shift');

    // Right arrow / tapping the neighbour reaches the newsroom.
    await go('newsroom', 'ArrowRight');
    assert.equal(await page.locator('#modal-title').textContent(), 'Newsroom.');
    assert.match(await page.locator('#newsroom-summary').textContent(), /sources? to submit/);
    assert.equal(await wheel.getAttribute('aria-label'), 'Your shift panel');
    assert.equal(await wheel.getAttribute('aria-keyshortcuts'), 'ArrowRight');
    assert.match(await wheel.textContent(), /Your shift\./);
    assert.equal(await activeId(), 'notebook-route');
    const newsroomSide = await neighbour();
    assert.equal(newsroomSide.side, 'after', 'the next title always waits to the right');
    assert.notEqual(newsroomSide.dim, newsroomSide.titleColor, 'the neighbour is visibly not selected');
    assert.equal(await titleTop(), shiftTitle, 'the title starts at the same height on both panels');
    await layout(); await shot('newsroom');

    // The wheel wraps: right twice from the shift returns to it.
    await go('shift', 'ArrowRight');
    assert.equal(await activeId(), 'ordinary-fare');
    await go('newsroom', 'ArrowLeft');
    await go('shift', 'ArrowLeft');

    // Vertical keys and Tab never land on the wheel tab.
    await page.keyboard.press('Shift+Tab');
    assert.equal(await activeId(), 'start');
    await page.keyboard.press('ArrowDown');
    assert.equal(await activeId(), 'ordinary-fare');
    assert.equal(await page.locator('.drawer-wheel-next[data-selected]').count(), 0);

    // An open detail pane owns the arrows; the wheel waits until it closes.
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    assert.equal(await activeId(), 'open-notebook');
    await page.keyboard.press('Enter');
    await page.locator('#shift-detail').waitFor();
    assert.equal(await page.locator('#modal').getAttribute('data-page'), 'shift');
    assert.match(await hint(), /↑ ↓ Select · Enter Confirm/);
    assert.doesNotMatch(await hint(), /← → Panels/);
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#modal').getAttribute('data-page'), 'shift', 'arrows browse the notebook instead of turning the wheel');
    assert.equal(await page.locator('#shift-detail').count(), 1);
    await page.keyboard.press('Escape');
    await page.locator('#shift-detail').waitFor({ state: 'detached' });
    assert.equal(await page.locator('#modal').getAttribute('data-page'), 'shift');
    assert.equal(await activeId(), 'open-notebook');
    assert.match(await hint(), /← → Panels/);

    // Escape still leaves the drawer from a panel; the HUD newsroom entry stays valid.
    await go('newsroom', 'ArrowRight');
    await page.keyboard.press('Escape');
    await page.locator('#overlay').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__scenario.render('world').mode), 'playing');
    if (touch) await page.locator('#newsroom').tap(); else { await page.locator('#newsroom').focus(); await page.keyboard.press('Enter'); }
    await waitForDrawer(page, 'newsroom');
    assert.equal(await page.locator('#modal-title').textContent(), 'Newsroom.');
    await go('shift', 'ArrowLeft');
    assert.equal(await page.locator('#modal-title').textContent(), 'Your shift.');
    await page.keyboard.press('Escape');
    await page.locator('#overlay').waitFor({ state: 'hidden' });

    // Tab toggles both campaign panels, like the HUD shift entry; it never steps
    // through the actions once a panel is open.
    await page.keyboard.press('Tab'); await waitForDrawer(page, 'shift');
    await page.keyboard.press('Tab'); await page.locator('#overlay').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__scenario.render('world').mode), 'playing');
    if (touch) await page.locator('#newsroom').tap(); else { await page.locator('#newsroom').focus(); await page.keyboard.press('Enter'); }
    await waitForDrawer(page, 'newsroom');
    await page.keyboard.press('Tab'); await page.locator('#overlay').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__scenario.render('world').mode), 'playing', 'Tab resumes play from the newsroom');

    // The wheel tab is a plain pointer target too.
    if (!touch) {
      if (await page.locator('#shift').isVisible()) await page.locator('#shift').click();
      await waitForDrawer(page, 'shift');
      await wheel.click(); await waitForDrawer(page, 'newsroom');
      assert.equal(await page.locator('#modal').getAttribute('data-page'), 'newsroom');
      await wheel.click(); await waitForDrawer(page, 'shift');
    }
    // Other menu pages share the same starting height, so titles never jump.
    if (name === 'desktop') {
      await page.keyboard.press('Escape'); await page.locator('#overlay').waitFor({ state: 'hidden' });
      await page.keyboard.press('KeyP'); await waitForDrawer(page, 'home');
      await page.locator('#menu-settings').click(); await waitForDrawer(page, 'settings');
      assert.equal(await titleTop(), shiftTitle, 'settings starts its title at the same height');
    }
    await context.close();
    console.log(`${name}: shift ⇄ newsroom wheel, neighbour title, fixed title height, hints, detail guard, entry points and layout passed`);
  }
  // Controller parity: the D-pad turns the wheel, while sliders keep their own arrows.
  {
    const context = await newContext(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?debug=1&dialogue-preview=1`);
    await page.waitForFunction(() => !!window.__taxi);
    await page.evaluate(() => { window.__taxi.toggle(false); window.__taxi.realtime(); });
    const pad = async (index, pressed) => {
      await page.evaluate(({ index, pressed }) => {
        window.testPad = window.testPad ?? { connected: true, mapping: 'standard', id: 'DualSense', axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
        navigator.getGamepads = () => [window.testPad];
        window.testPad.buttons[index].pressed = pressed;
      }, { index, pressed });
      await page.waitForTimeout(80);
    };
    await page.locator('#shift').click(); await waitForDrawer(page, 'shift');
    await pad(15, true); await waitForDrawer(page, 'newsroom'); await pad(15, false);
    await pad(14, true); await waitForDrawer(page, 'shift'); await pad(14, false);
    await page.keyboard.press('Escape'); await page.locator('#overlay').waitFor({ state: 'hidden' });
    // Settings sliders keep their native left/right value editing.
    await page.keyboard.press('KeyP'); await waitForDrawer(page, 'home');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await waitForDrawer(page, 'settings');
    const slider = page.locator('#volume-option'); await slider.focus();
    const before = Number(await slider.inputValue());
    await pad(15, true); await pad(15, false);
    assert(Number(await slider.inputValue()) > before, 'the D-pad still adjusts a focused slider');
    assert.equal(await page.locator('#modal').getAttribute('data-page'), 'settings');
    await page.evaluate(() => { navigator.getGamepads = () => []; });
    await context.close();
    console.log('Controller: the D-pad turns the shift/newsroom wheel and keeps slider editing');
  }
  // A wheel step rolls the dim neighbour title into the active position.
  {
    const context = await newContext(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await page.goto(`${pathToFileURL(resolve('dist/index.html'))}?scenario-preview=1`);
    await page.waitForFunction(() => !!window.__scenario);
    await page.evaluate(() => window.__scenario.start({ traffic: 'quiet', noPolice: true }));
    await page.keyboard.press('Tab'); await waitForDrawer(page, 'shift');
    const titleLeft = () => page.locator('#modal-title').evaluate(title => Math.round(title.getBoundingClientRect().left));
    const before = await titleLeft();
    await page.keyboard.press('ArrowRight');
    await page.waitForSelector('#modal > .drawer-carousel');
    const rolling = await page.evaluate(async start => {
      const stage = document.querySelector('#modal > .drawer-carousel');
      stage.getAnimations({ subtree: true }).forEach(animation => { animation.pause(); animation.currentTime = 126; });
      const boxes = [...stage.querySelectorAll(':scope > .drawer-page')];
      const heads = [...stage.querySelectorAll(':scope > .drawer-head')];
      const left = node => Math.round(node.getBoundingClientRect().left);
      // Strip boxes match the head itself, not the wider page it sits in.
      const headBox = node => {
        const box = node.getBoundingClientRect(), transform = getComputedStyle(node).transform;
        const tx = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41;
        return { left: Math.round(box.left - tx), width: Math.round(box.width), top: Math.round(box.top) };
      };
      return {
        start, page: document.querySelector('#modal').dataset.page,
        hidden: getComputedStyle(document.querySelector('#modal > .drawer-page')).visibility,
        bodies: boxes.map(node => ({ left: left(node), text: node.textContent })),
        // Previous strip sits on top: its dim peek must sit exactly over the arriving title.
        peek: heads[1] && left(heads[1].querySelector('.drawer-wheel-next')),
        arriving: heads[0] && left(heads[0].querySelector('#modal-title')),
        leaving: heads[1] && left(heads[1].querySelector('#modal-title')),
        strips: heads.map(headBox),
        liveHead: headBox(document.querySelector('#modal > .drawer-page .drawer-head')),
        stage: { width: Math.round(stage.getBoundingClientRect().width), left: Math.round(stage.getBoundingClientRect().left) },
        modal: Math.round(document.querySelector('#modal').getBoundingClientRect().width),
        exposed: stage.getAttribute('aria-hidden') !== 'true' || !stage.inert,
      };
    }, before);
    assert.equal(rolling.bodies.length, 2, 'both bodies are on the stage at once');
    assert.equal(rolling.page, 'newsroom', 'the destination page is already mounted');
    assert.equal(rolling.hidden, 'hidden', 'the live page waits beneath the moving stage');
    assert.equal(rolling.exposed, false, 'the cloned stage stays out of the focus order and accessibility tree');
    assert.deepEqual(rolling.strips, [rolling.liveHead, rolling.liveHead], 'both strips use the head box, so the title does not jump when the stage is removed');
    assert.match(rolling.bodies[0].text, /DISPATCH \/ SHIFT/, 'the old page is still visible while leaving');
    assert.match(rolling.bodies[1].text, /DISPATCH \/ RECORDS/, 'the new page arrives underneath');
    assert(rolling.leaving < rolling.start - 40, 'the old title travels out');
    assert(rolling.arriving > rolling.start + 40, 'the next title is still travelling in');
    assert(Math.abs(rolling.peek - rolling.arriving) <= 1, 'the dim neighbour is the string that rolls into position');
    assert.equal(rolling.stage.left, Math.round(await page.locator('#modal').evaluate(modal => modal.getBoundingClientRect().left)));
    assert.equal(rolling.stage.width, rolling.modal, 'the stage matches the drawer');
    await page.screenshot({ path: resolve(output, 'carousel-midway.png') });
    await page.evaluate(() => document.querySelectorAll('#modal > .drawer-carousel').forEach(stage => stage.getAnimations({ subtree: true }).forEach(animation => animation.play())));
    await page.waitForFunction(() => !document.querySelector('#modal > .drawer-carousel'));
    assert.equal(await page.locator('#modal').getAttribute('data-page'), 'newsroom');
    assert.equal(await page.locator('#modal > .drawer-page').evaluate(element => getComputedStyle(element).visibility), 'visible');
    assert(Math.abs(await titleLeft() - before) <= 1, 'the arriving title lands where the wheel started');
    // The same roll happens in reverse without changing the resting geometry.
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => !document.querySelector('#modal > .drawer-carousel') && document.querySelector('#modal').dataset.page === 'shift');
    assert(Math.abs(await titleLeft() - before) <= 1, 'going back keeps the title in place');
    await context.close();
    console.log('Carousel: the dim neighbour rolls into the active title position in both directions');
  }
  console.log(`Offline panel wheel checks passed; screenshots: ${output}`);
} catch (error) { await captureFailure(); throw error; } finally { await closeBrowser(browser); }
