import { launchBrowser, newContext, closeBrowser, captureFailure } from '../runtime.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { openGame, waitForDrawer, tapToConfirm } from '../helpers/drawer.mjs';
const output = process.env.SCREENSHOT_DIR || 'scenario-runs/start-pause';
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const html = await readFile('dist/index.html', 'utf8');
const selected = page => page.locator('[data-selected]');
try {
  await checkDesktop();
  await checkTouchResume();
  await checkTouchLayouts();
  console.log('Offline drawer QA passed: keyboard/pointer selection, full pages, touch select/confirm, stable settings controls, Back/focus, reduced motion, controller, frozen state, physical touch driving, desktop/portrait/compact/landscape; no console errors or external requests.');
} catch (error) { await captureFailure(); throw error; } finally { await closeBrowser(browser); }

async function checkDesktop() {
  const page = await openGame(browser, html, { viewport: { width: 1440, height: 900 } });
  await page.waitForTimeout(400);
  assert.match(await page.locator('#start').innerText(),/Start your shift/);
  const first = await page.locator('#city').screenshot(); await page.waitForTimeout(600); const second=await page.locator('#city').screenshot(); assert(!first.equals(second),'ambient camera moves');
  await page.screenshot({path:`${output}/start-desktop.png`});
  await page.locator('#overlay').evaluate(element => element.addEventListener('click', () => {
    window.exitTransition = { visible: !element.hidden, duration: getComputedStyle(element).transitionDuration };
  }, { once: true }));
  await page.locator('#start').click();
  assert.deepEqual(await page.evaluate(() => window.exitTransition), { visible: true, duration: '0.55s' }, 'drawer fades out');
  await page.locator('#overlay').waitFor({state:'hidden'});
  await page.mouse.move(1300, 800);
  await page.keyboard.press('p');
  assert.equal(await page.locator('.splash-modal').count(),1);
  assert.match(await page.locator('#start').innerText(),/Resume your shift/);
  assert.match(await page.locator('.splash-save-heading').innerText(),/CURRENT SHIFT · PAUSED/);
  assert.equal(await page.locator('#start').evaluate(el=>el===document.activeElement),true);
  await page.screenshot({path:`${output}/pause-desktop.png`});
  // The last frame of the start transition can land just after the pause drawer opens.
  // Require two settled samples, then verify it stays frozen over a longer interval.
  let pausedCanvas;
  for (let attempt = 0; attempt < 5; attempt++) {
    const first = await page.locator('#city').screenshot();
    await page.waitForTimeout(120);
    const second = await page.locator('#city').screenshot();
    if (first.equals(second)) { pausedCanvas = second; break; }
  }
  assert(pausedCanvas, 'paused backdrop must settle');
  await page.waitForTimeout(400);
  assert(pausedCanvas.equals(await page.locator('#city').screenshot()), 'paused backdrop stays frozen');
  await page.mouse.move(1300, 800);
  await page.keyboard.press('ArrowUp'); assert.equal(await selected(page).getAttribute('id'), 'open-notebook', 'navigation wraps');
  await page.keyboard.press('ArrowDown'); assert.equal(await selected(page).getAttribute('id'), 'start');
  await page.keyboard.press('ArrowRight'); assert.equal(await selected(page).getAttribute('id'), 'menu-rules');
  await page.keyboard.press('Enter'); await waitForDrawer(page, 'rules');
  assert(await page.locator('.intro-grid').isVisible()); await page.screenshot({path:`${output}/rules-desktop.png`}); assert.equal(await page.locator('#start').count(), 0, 'page replaces the entire drawer');
  await page.keyboard.press('Escape'); await waitForDrawer(page, 'home');
  assert.equal(await selected(page).getAttribute('id'), 'menu-rules', 'Back restores selection');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await waitForDrawer(page, 'settings');
  await page.screenshot({path:`${output}/settings-desktop.png`});
  await page.locator('#gore-option').evaluate(element => { window.originalSetting = element; });
  await page.locator('#gore-option').check();
  assert(await page.locator('#gore-option').evaluate(element => element === window.originalSetting), 'edit preserves controls');
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#gore-option').isChecked(), false);
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#gore-option').isChecked(), true);
  await page.keyboard.press('ArrowDown');
  assert.equal(await selected(page).getAttribute('id'), 'difficulty-option');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[data-setting="difficulty"] output').innerText(), 'Chaos');
  assert.equal(await page.locator('#difficulty-option').getAttribute('aria-valuetext'), 'Chaos');
  await page.locator('#difficulty-option').fill('0');
  assert.equal(await page.locator('[data-setting="difficulty"] output').innerText(), 'Cruise');
  await page.keyboard.press('Tab');
  assert.equal(await selected(page).getAttribute('id'), 'muted-option');
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#muted-option').isChecked(), true);
  await page.locator('#volume-option').focus();
  const volume = Number(await page.locator('#volume-option').inputValue());
  await page.keyboard.press('ArrowLeft');
  assert.equal(Number(await page.locator('#volume-option').inputValue()), volume - 1);
  assert.equal(await page.locator('[data-setting="volume"] output').innerText(), `${volume - 1}%`);
  await page.locator('#sirens-option').fill('0');
  assert.equal(await page.locator('[data-setting="sirens"] output').innerText(), '0%');
  assert.equal(await page.locator('#modal').getAttribute('data-page'), 'settings');
  assert(await page.locator('#modal').evaluate(el => el.classList.contains('splash-modal')), 'edits preserve drawer styling');
  assert.equal(await page.locator('#modal').getByText(/disables sirens/).count(), 0);
  assert.equal(await page.locator('#menu-credits').count(), 0);
  await page.screenshot({path:`${output}/settings-desktop.png`});
  await page.keyboard.press('Escape'); await waitForDrawer(page, 'home');
  await page.locator('#menu-credits').click(); await waitForDrawer(page, 'credits');
  assert.equal(await page.locator('.credits-section').count(), 4, 'credits are grouped by functional role');
  assert(await page.locator('.credits-section a').count() >= 8, 'source links are preserved');
  assert.equal(await page.locator('.credits-section a[href="https://opengameart.org/content/racing-car-engine-sound-loops"]').count(), 1);
  assert(await page.locator('#modal').evaluate(el => el.scrollWidth <= el.clientWidth), 'credits has no horizontal overflow');
  await page.locator('#drawer-back').focus(); await page.keyboard.press('Tab');
  assert.equal(await selected(page).evaluate(el => el.tagName), 'A', 'keyboard reaches an attribution link');
  await page.screenshot({path:`${output}/credits-desktop.png`});
  await page.keyboard.press('Escape'); await waitForDrawer(page, 'home');
  assert.equal(await selected(page).getAttribute('id'), 'menu-credits');
  await page.locator('#open-notebook').hover(); assert.equal(await selected(page).getAttribute('id'), 'open-notebook', 'mouse hover selects');
  await page.locator('#start').click(); await page.locator('#overlay').waitFor({state:'hidden'});
  await page.keyboard.press('Tab'); await waitForDrawer(page, 'shift');
  assert(await page.locator('.shift-stats').isVisible());
  assert.equal(await page.locator('#menu-shift').count(), 0);
  const shiftStats = await page.locator('.shift-stats').innerText();
  await page.screenshot({path:`${output}/shift-desktop.png`});
  await page.keyboard.press('Tab'); await page.locator('#overlay').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(() => document.activeElement.id), 'city');
  await page.keyboard.press('p'); await waitForDrawer(page, 'home');
  assert.equal(await page.locator('.shift-stats').innerText(), shiftStats, 'pause and shift show the same wake-to-sleep totals');
  assert.equal(await page.locator('#menu-shift').count(), 0, 'pause has no shift entry');
  await page.locator('#start').click(); await page.locator('#overlay').waitFor({state:'hidden'});
  await page.locator('#shift').click(); await waitForDrawer(page, 'shift');
  // Exercise skip behavior independently of where this saved cab is parked.
  await page.locator('#sleep').evaluate(button => { button.disabled = true; });
  await page.locator('#open-notebook').focus(); await page.keyboard.press('ArrowDown');
  assert.notEqual(await selected(page).getAttribute('id'), 'sleep', 'arrows skip unavailable actions');
  await page.locator('#open-notebook').click(); await waitForDrawer(page, 'notebook');
  await page.locator('#menu-notebook-guide').click(); await waitForDrawer(page, 'notebook-guide');
  await page.keyboard.press('Escape'); await waitForDrawer(page, 'notebook');
  await page.locator('#notebook-back').click(); await waitForDrawer(page, 'home');
  await page.locator('#start').focus();
  await page.keyboard.press('Escape'); assert(await page.locator('#overlay').isHidden());
  await page.keyboard.press('p'); await page.keyboard.press('Enter'); assert(await page.locator('#overlay').isHidden());
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  assert.match(await page.locator('#start').innerText(),/Resume/); await page.locator('#start').click();
  await page.reload(); assert.match(await page.locator('#start').innerText(),/Continue/);
  await page.evaluate(()=>{window.testPad={connected:true,mapping:'standard',id:'DualSense',axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};navigator.getGamepads=()=>[window.testPad];window.testPad.buttons[2].pressed=true;});
  await page.waitForTimeout(100); assert.match(await page.locator('#splash-prompts').innerText(),/□/);
  await page.evaluate(()=>{window.testPad.buttons[2].pressed=false});
  await page.locator('#menu-settings').click(); await waitForDrawer(page, 'settings');
  assert.equal(await page.locator('#gore-option').isChecked(), true, 'gore preference persists');
  assert.equal(await page.locator('#difficulty-option').inputValue(), '0', 'difficulty preference persists');
  assert.equal(await page.locator('#volume-option').inputValue(), String(volume - 1), 'volume preference persists');
  await page.locator('#difficulty-option').focus();
  await page.evaluate(()=>{window.testPad.buttons[15].pressed=true}); await page.waitForTimeout(100);
  assert.equal(await page.locator('#difficulty-option').inputValue(), '1', 'controller edits slider');
  await page.evaluate(()=>{window.testPad.buttons[15].pressed=false});
  await page.locator('#muted-option').focus();
  await page.evaluate(()=>{window.testPad.buttons[0].pressed=true}); await page.waitForTimeout(100);
  assert.equal(await page.locator('#muted-option').isChecked(), false, 'controller toggles switch');
  await page.evaluate(()=>{window.testPad.buttons[0].pressed=false});
  await page.keyboard.press('Escape'); await waitForDrawer(page, 'home');
  await page.keyboard.press('z'); assert.match(await page.locator('#splash-prompts').innerText(),/WASD/);
  // The same face button that starts a shift resumes it; Start pauses it.
  await page.locator('#start').click(); await page.locator('#overlay').waitFor({state:'hidden'});
  await page.evaluate(()=>{window.testPad.buttons[9].pressed=true}); await page.waitForTimeout(100);
  assert.match(await page.locator('#start').innerText(),/Resume/);
  await page.evaluate(()=>{window.testPad.buttons[9].pressed=false;window.testPad.buttons[0].pressed=true}); await page.waitForTimeout(100);
  assert(await page.locator('#overlay').isHidden());
  await page.evaluate(()=>{navigator.getGamepads=()=>[]}); await page.reload();
  for (const [name,width,height] of [['portrait',390,844],['small',320,568],['landscape',844,390]]) {
   await page.setViewportSize({width,height}); assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`${output}/start-${name}.png`});
   await page.locator('#start').click(); await page.locator('#overlay').waitFor({state:'hidden'});
   await page.keyboard.press('Escape'); assert.match(await page.locator('#start').innerText(),/Resume/);
   assert(await page.evaluate(()=>document.querySelector('#modal').scrollWidth<=document.querySelector('#modal').clientWidth),'drawer has no horizontal overflow');
   await page.screenshot({path:`${output}/pause-${name}.png`});
   await page.locator('#start').click(); await page.locator('#overlay').waitFor({state:'hidden'}); await page.keyboard.press('Tab'); await waitForDrawer(page, 'shift'); await page.locator('#open-notebook').click(); await waitForDrawer(page, 'notebook');
   await page.locator('#notebook-back').click(); await waitForDrawer(page, 'home'); await page.locator('#start').click(); await page.reload();
  }
  await page.emulateMedia({reducedMotion:'reduce'}); await page.locator('#start').click();
  assert(await page.locator('#overlay').isHidden()); await page.keyboard.press('p');
  await page.locator('#start').click(); assert(await page.locator('#overlay').isHidden());

  await page.context().close();
}

async function checkTouchResume() {
  // Touch driving, focus-loss pause and resume preserve the same physical game.
  const touch = await openGame(browser, html, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' }, '/?debug=1');
  const touchContext = touch.context();
  await touch.evaluate(()=>{document.querySelector('#debug-panel').hidden=true});
  const beforeDrive = await touch.evaluate(()=>__taxi.state());
  const stick = await touch.locator('#joystick').boundingBox();
  const cdp = await touchContext.newCDPSession(touch);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:stick.x+stick.width/2,y:stick.y+12,id:1}]});
  await touch.waitForTimeout(350);
  await touch.evaluate(()=>window.dispatchEvent(new Event('blur')));
  assert.equal(await touch.locator('#joystick.pressed').count(),0,'pausing releases held touch input');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const frozen = await touch.evaluate(()=>__taxi.state());
  assert.equal(frozen.mode,'paused');
  assert(Math.hypot(frozen.position.x-beforeDrive.position.x,frozen.position.y-beforeDrive.position.y)>0.1,'touch input physically drives');
  await touch.waitForTimeout(350);
  assert.deepEqual(await touch.evaluate(()=>__taxi.state()),frozen,'physics, fare and campaign clocks stay frozen');
  await touch.locator('#start').tap();
  assert.equal((await touch.evaluate(()=>__taxi.state())).mode, 'paused', 'first tap only selects even on default item');
  assert.equal(await selected(touch).getAttribute('id'), 'start');
  await touch.locator('#menu-settings').tap(); assert.equal(await selected(touch).getAttribute('id'), 'menu-settings');
  assert.equal(await touch.locator('#modal').getAttribute('data-page'), 'home', 'touch selection does not enter');
  await touch.locator('#menu-settings').tap(); await waitForDrawer(touch, 'settings');
  assert.equal(await touch.locator('#modal details, #modal summary').count(), 0);
  await touch.locator('#drawer-back').tap(); assert.equal(await touch.locator('#modal').getAttribute('data-page'), 'settings', 'new page autofocus does not arm confirmation');
  await touch.locator('#drawer-back').tap(); await waitForDrawer(touch, 'home');
  assert.equal(await selected(touch).getAttribute('id'), 'menu-settings');
  await touch.locator('#start').tap(); assert.equal((await touch.evaluate(()=>__taxi.state())).mode, 'paused');
  await touch.locator('#start').tap();
  await touch.waitForTimeout(100);
  const resumed = await touch.evaluate(()=>__taxi.state());
  assert.equal(resumed.mode,'playing'); assert(resumed.time>frozen.time);
  assert.equal(resumed.playerId,frozen.playerId); assert.equal(resumed.job.customerId,frozen.job.customerId); assert.equal(resumed.job.destination,frozen.job.destination);
  await touchContext.close();
}

async function checkTouchLayouts() {
  for (const [name, width, height] of [['portrait', 390, 844], ['small', 320, 568], ['landscape', 844, 390]]) {
    const mobile = await openGame(browser, html, { viewport: { width, height }, hasTouch: true, isMobile: true });
    await mobile.locator('#menu-settings').tap();
    assert.equal(await mobile.locator('#modal').getAttribute('data-page'), 'home');
    await mobile.locator('#menu-settings').tap(); await waitForDrawer(mobile, 'settings');
    assert(await mobile.evaluate(() => document.querySelector('#modal').scrollWidth <= document.querySelector('#modal').clientWidth));
    await mobile.screenshot({ path: `${output}/settings-touch-${name}.png` });
    await mobile.locator('#gore-option').tap();
    assert.equal(await mobile.locator('#gore-option').isChecked(), true, 'toggle edits on first tap');
    await mobile.locator('#sirens-option').scrollIntoViewIfNeeded();
    const slider = await mobile.locator('#sirens-option').boundingBox();
    const cdp = await mobile.context().newCDPSession(mobile);
    const y = slider.y + slider.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: slider.x + 7 + (slider.width - 14) * 0.25, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: slider.x + slider.width * 0.8, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert(Number(await mobile.locator('#sirens-option').inputValue()) > 50, 'touch drag edits slider');
    assert.equal(await mobile.locator('[data-setting="sirens"] output').innerText(), `${await mobile.locator('#sirens-option').inputValue()}%`);
    await tapToConfirm(mobile, '#drawer-back'); await waitForDrawer(mobile, 'home');
    await tapToConfirm(mobile, '#menu-credits'); await waitForDrawer(mobile, 'credits');
    assert.equal(await mobile.locator('.credits-section').count(), 4);
    assert(await mobile.evaluate(() => document.querySelector('#modal').scrollWidth <= document.querySelector('#modal').clientWidth), 'credits has no horizontal overflow');
    assert(await mobile.evaluate(() => document.querySelector('#modal').scrollHeight > document.querySelector('#modal').clientHeight), 'credits scroll');
    await mobile.locator('.credits-section:last-of-type').scrollIntoViewIfNeeded();
    await mobile.screenshot({ path: `${output}/credits-touch-${name}.png` });
    await tapToConfirm(mobile, '#drawer-back'); await waitForDrawer(mobile, 'home');
    await mobile.locator('#start').tap(); assert(await mobile.locator('#overlay').isVisible());
    await mobile.locator('#start').tap(); await mobile.locator('#overlay').waitFor({ state: 'hidden' });
    await mobile.locator('#shift').tap(); await waitForDrawer(mobile, 'shift');
    await mobile.screenshot({ path: `${output}/shift-touch-${name}.png` });
    await mobile.context().close();
  }
}
