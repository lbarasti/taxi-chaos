import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { openGame, waitForDrawer, tapToConfirm } from './helpers/drawer.mjs';
const output = process.env.SCREENSHOT_DIR || 'docs/screenshots/start-pause';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,args:['--no-sandbox']});
const problems = { errors: [], requests: [] };
const html = await readFile('dist/index.html', 'utf8');
const selected = page => page.locator('[data-selected]');
try {
  await checkDesktop();
  await checkTouchResume();
  await checkTouchLayouts();
  assert.deepEqual(problems.errors, []);
  assert.deepEqual(problems.requests, []);
  console.log('Offline drawer QA passed: keyboard/pointer selection, full pages, touch select/confirm, stable settings controls, Back/focus, reduced motion, controller, frozen state, physical touch driving, desktop/portrait/compact/landscape; no console errors or external requests.');
} finally { await browser.close(); }

async function checkDesktop() {
  const page = await openGame(browser, html, { viewport: { width: 1440, height: 900 } }, problems);
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
  const pausedCanvas = await page.locator('#city').screenshot(); await page.waitForTimeout(400);
  assert(pausedCanvas.equals(await page.locator('#city').screenshot()),'paused backdrop stays frozen');
  await page.mouse.move(1300, 800);
  await page.keyboard.press('ArrowUp'); assert.equal(await selected(page).getAttribute('id'), 'menu-shift', 'navigation wraps');
  await page.keyboard.press('ArrowDown'); assert.equal(await selected(page).getAttribute('id'), 'start');
  await page.keyboard.press('ArrowRight'); assert.equal(await selected(page).getAttribute('id'), 'menu-rules');
  await page.keyboard.press('Enter'); await waitForDrawer(page, 'rules');
  assert(await page.locator('.intro-grid').isVisible()); await page.screenshot({path:`${output}/rules-desktop.png`}); assert.equal(await page.locator('#start').count(), 0, 'page replaces the entire drawer');
  assert.equal(await page.locator('#modal details, #modal summary').count(), 0);
  await page.keyboard.press('Escape'); await waitForDrawer(page, 'home');
  assert.equal(await selected(page).getAttribute('id'), 'menu-rules', 'Back restores selection');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await waitForDrawer(page, 'settings');
  assert.equal(await page.locator('.splash-save').count(), 0); await page.screenshot({path:`${output}/settings-desktop.png`});
  await page.locator('#gore-option').evaluate(element => { window.originalSetting = element; });
  await page.locator('#gore-option').check();
  assert(await page.locator('#gore-option').evaluate(element => element === window.originalSetting), 'setting edits keep the control mounted');
  await page.keyboard.press('Space'); assert.equal(await page.locator('#gore-option').isChecked(), false);
  await page.keyboard.press('Space'); assert.equal(await page.locator('#gore-option').isChecked(), true);
  assert.equal(await page.locator('#modal').getAttribute('data-page'), 'settings', 'settings stays visible after an edit');
  assert.equal(await selected(page).getAttribute('id'), 'gore-option', 'edit retains focus');
  await page.locator('[data-audio="volume"]').focus();
  const volume = await page.locator('[data-audio="volume"]').inputValue(); await page.keyboard.press('ArrowLeft');
  assert.equal(Number(await page.locator('[data-audio="volume"]').inputValue()), Number(volume) - 1, 'slider arrows edit value');
  assert.equal(await selected(page).getAttribute('data-audio'), 'volume');
  await page.locator('#difficulty-option').focus(); await page.keyboard.press('ArrowDown');
  assert.equal(await selected(page).getAttribute('id'), 'difficulty-option', 'select retains native arrows');
  await page.keyboard.press('Tab'); assert.equal(await selected(page).getAttribute('data-audio'), 'muted');
  await page.locator('#menu-credits').click(); await waitForDrawer(page, 'credits');
  assert.equal(await page.locator('#modal details').count(), 0); assert(await page.locator('.audio-credits a').count() > 0);
  await page.keyboard.press('Escape'); await waitForDrawer(page, 'settings');
  assert.equal(await selected(page).getAttribute('id'), 'menu-credits');
  await page.keyboard.press('Escape'); await waitForDrawer(page, 'home');
  await page.locator('#menu-shift').hover(); assert.equal(await selected(page).getAttribute('id'), 'menu-shift', 'mouse hover selects');
  await page.keyboard.press('Enter'); await waitForDrawer(page, 'shift');
  assert(await page.locator('.shift-stats').isVisible());
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
  await page.evaluate(()=>{window.testPad.buttons[2].pressed=false}); await page.keyboard.press('z'); assert.match(await page.locator('#splash-prompts').innerText(),/WASD/);
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
   await page.locator('#menu-shift').click(); await waitForDrawer(page, 'shift'); await page.locator('#open-notebook').click(); await waitForDrawer(page, 'notebook');
   await page.locator('#notebook-back').click(); await waitForDrawer(page, 'home'); await page.locator('#start').click(); await page.reload();
  }
  await page.emulateMedia({reducedMotion:'reduce'}); await page.locator('#start').click();
  assert(await page.locator('#overlay').isHidden()); await page.keyboard.press('p');
  await page.locator('#start').click(); assert(await page.locator('#overlay').isHidden());

  await page.context().close();
}

async function checkTouchResume() {
  // Touch driving, focus-loss pause and resume preserve the same physical game.
  const touch = await openGame(browser, html, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' }, problems, '/?debug=1');
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
    const mobile = await openGame(browser, html, { viewport: { width, height }, hasTouch: true, isMobile: true }, problems);
    await mobile.locator('#menu-settings').tap();
    assert.equal(await mobile.locator('#modal').getAttribute('data-page'), 'home');
    await mobile.locator('#menu-settings').tap(); await waitForDrawer(mobile, 'settings');
    assert(await mobile.evaluate(() => document.querySelector('#modal').scrollWidth <= document.querySelector('#modal').clientWidth));
    await mobile.screenshot({ path: `${output}/settings-touch-${name}.png` });
    await tapToConfirm(mobile, '#menu-credits'); await waitForDrawer(mobile, 'credits');
    await tapToConfirm(mobile, '#drawer-back'); await waitForDrawer(mobile, 'settings');
    await tapToConfirm(mobile, '#drawer-back'); await waitForDrawer(mobile, 'home');
    await mobile.locator('#start').tap(); assert(await mobile.locator('#overlay').isVisible());
    await mobile.locator('#start').tap(); await mobile.locator('#overlay').waitFor({ state: 'hidden' });
    await mobile.keyboard.press('p');
    await tapToConfirm(mobile, '#menu-shift'); await waitForDrawer(mobile, 'shift');
    await mobile.screenshot({ path: `${output}/shift-touch-${name}.png` });
    await mobile.context().close();
  }
}
