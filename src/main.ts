import './style.css';
import { savedCampaignAvailable, type InputDevice } from './ui/splash';
import { GameDrawer } from './ui/game-drawer';
import './ui/drawer.css';
import { bindTouchControls } from './ui/touch-controls';
import { Game, upgradeInfo, type Upgrade } from './game/game';
import { MotorcycleDynamics, motorcycleEngineWorks } from './vehicles/motorcycle';
import { Renderer } from './rendering/renderer';
import { artworkImages } from './artwork/images';
import { dist } from './physics/physics';
import { PORT_FEE } from './world/harbour';
import { setupLab, type LabAPI } from './debug/lab';
import { AudioFX } from './audio/audio';
import { refreshAudioControls } from './audio/audio-controls';
import { MapWorkspace } from './map/workspace';
import { bindStoryView, storyMarkup } from './narrative/story-view';
import { bindMissionInbox, inboxMarkup } from './narrative/mission-inbox';
import { bindPlayerHud, playerHudMarkup } from './ui/player-hud';
import { bindNavigationHud, navigationHudMarkup } from './ui/navigation-hud';
import './ui/navigation-hud.css';
import { dialoguePreviewScene } from './missions/dialogue-preview-scene';
import type { PreviewState } from './missions/dialogue-preview';
import { ScenarioRunner, type ScenarioOptions, type CaptureView, type CaptureFrame } from './scenarios/runner';
import { createAuthoringPreview } from './catalogue/authoring-preview';
import { createPreview } from './map/preview';
import { createInspectionPanel } from './debug/inspection-panel';

const arrowIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
document.querySelector('#app')!.innerHTML = `
  <canvas id="city" aria-label="Top-down taxi driving game. Use arrow keys or WASD to drive." tabindex="0"></canvas>
  ${navigationHudMarkup}
  ${storyMarkup}
  ${inboxMarkup}
  ${playerHudMarkup}
  <div class="context-actions" role="group" aria-label="Vehicle actions"><button id="garage-action" class="context-action" hidden>Garage</button><button id="interact" class="context-action" hidden>Get in</button></div>
  <section id="roadside" class="roadside panel" role="status" hidden><strong>CAB DESTROYED</strong><p>The wreck stays here. Walk to a parked car and keep your shift going.</p><div><button id="tow">R · Tow & repair</button></div><small id="tow-price"></small></section>
  <div class="toast" id="toast" role="status"></div>
  <footer class="controls"><span><kbd>W A S D</kbd> / <kbd>↑ ← ↓ →</kbd> DRIVE / WALK</span><span><kbd>SPACE</kbd> DRIFT</span><span><kbd>SHIFT</kbd> BOOST</span><span><kbd>E</kbd> EXIT / ENTER · HOLD <kbd>A/D</kbd> FOR SIDE</span><span><kbd>G</kbd> GARAGE</span><span><kbd>H</kbd> HARBOUR</span><span><kbd>P</kbd> PAUSE</span></footer>
  <div class="touch-controls" aria-label="Touch driving controls"><div class="thumb-actions"><button data-key="boost" aria-label="Hold to boost"><span>BOOST</span></button><button data-key="handbrake" aria-label="Hold handbrake">DRIFT</button></div><div id="joystick" class="joystick" role="group" aria-label="Drag to move: up accelerates, down brakes or reverses, left and right steer. On foot, drag in the direction to walk."><span class="joystick-guides" aria-hidden="true">＋</span><span class="joystick-knob" aria-hidden="true"></span></div></div>
  <div class="modal-backdrop" id="overlay"><section class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"></section></div>
  <div class="debug-panel" id="debug-panel" hidden></div>
`;
const dialoguePreviewMode = new URLSearchParams(location.search).has('dialogue-preview');
const scenarioPreviewMode = new URLSearchParams(location.search).has('scenario-preview');
const authoringPreviewMode = new URLSearchParams(location.search).has('authoring-preview');
// Decode embedded map art before the first playable frame; failures keep procedural fallbacks.
await artworkImages.load();
const hasSavedCampaign = !dialoguePreviewMode && !scenarioPreviewMode && !authoringPreviewMode && savedCampaignAvailable();
let game = new Game(undefined, !dialoguePreviewMode && !scenarioPreviewMode && !authoringPreviewMode);
const audio = new AudioFX();
const renderer = new Renderer($('city') as HTMLCanvasElement, $('map') as HTMLCanvasElement, game);
const refreshStory = bindStoryView($('app'), () => game.dialogue, () => $('city').focus(), () => game.recordDialogue());
const { refresh: refreshInbox, open: openInbox } = bindMissionInbox($('app'), () => game, () => $('city').focus(), () => !scenarioPreviewMode, () => refreshNavigationHud.routeFare());
const refreshPlayerHud = bindPlayerHud($('app'), () => game);
const refreshNavigationHud = bindNavigationHud($('app'), () => game, { texts: openInbox, newsroom: () => drawer.openNewsroom(), focus: () => $('city').focus(), routeVisibility: visible => { renderer.navigationRouteVisible = visible; } });
let inputDevice: InputDevice = window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard';
const drawer = new GameDrawer($('modal'), { game: () => game, audio, saved: hasSavedCampaign, play: playFromMenu });
drawer.setInputDevice(inputDevice);
function detectInput(device: InputDevice) { inputDevice = device; drawer.setInputDevice(device); }
let splashExiting = false;
let lab: LabAPI | undefined;
let mapWorkspace: MapWorkspace | undefined;
let normalGame: Game | undefined;
let laboratoryGame: Game | undefined;
/** Map drafting owns the real game and must reject every user input path, not
 *  just the fixed-step API. Preview keeps physical gameplay enabled. */
const drafting = () => mapWorkspace?.editing === true;
function gameOverMarkup(title: 'WASTED' | 'BUSTED', charges: { label: string; amount: number }[]) {
  const rows = charges.map(({ label, amount }) => `<div><span>${label}</span><strong>−$${amount}</strong></div>`).join('');
  return `<h2 id="modal-title" class="danger">${title}</h2><div class="game-over-bill">${rows}</div><button class="primary" id="recover"><span class="continue-keyboard">Press space bar to continue</span><span class="continue-touch">Tap to continue</span></button>`;
}
function modal() {
  const overlay = $('overlay'), card = $('modal');
  if (splashExiting && game.mode === 'playing') return;
  splashExiting = false; overlay.classList.remove('splash-exiting'); overlay.inert = false;
  overlay.hidden = game.mode === 'playing';
  overlay.classList.toggle('game-over', game.mode === 'wasted' || game.mode === 'arrested');
  const sharedMenu = drawer.active;
  overlay.classList.toggle('splash-backdrop', sharedMenu);
  document.body.classList.toggle('splash-active', sharedMenu);
  card.className = `modal ${game.mode === 'garage' ? 'garage-modal' : ''}`;
  if (sharedMenu) drawer.refresh();
  else drawer.reset();
  if (game.mode === 'garage') {
    const upgrades = (Object.entries(upgradeInfo) as [Upgrade, typeof upgradeInfo.engine][]).map(([key, u]) => { const level = game.player.upgrades[key], price = game.price(key); return `<div class="upgrade"><div><span class="upgrade-number">0${Object.keys(upgradeInfo).indexOf(key) + 1}</span><h3>${u.name}</h3><p>${u.subtitle}</p><small>${u.detail}</small><div class="level">${[1, 2, 3].map(i => `<i class="${i <= level ? 'filled' : ''}"></i>`).join('')}<span>LEVEL ${level} / 3</span></div></div><button class="buy" data-upgrade="${key}" ${level >= 3 || game.save.cash < price ? 'disabled' : ''}>${level >= 3 ? 'MAXED' : `$${price}`}</button></div>`; }).join('');
    const repairPrice = game.repairPrice;
    card.innerHTML = `<div class="eyebrow">OLD TOWN / TUNING & REPAIRS <span class="garage-wallet">$${game.save.cash}</span></div><h2 id="modal-title">Pit Stop.</h2><p><strong>THIS VEHICLE · ${game.player.model === 'car' ? 'City car' : game.player.definition.name}</strong><br>Upgrades stay with this vehicle. Total it or trade it away and the investment is gone.</p><div class="upgrades">${upgrades}</div><div class="repair"><div><strong>Patch it up</strong><small>Restore your chassis to 100%.</small></div><button class="buy" id="repair" ${repairPrice === 0 || game.save.cash < repairPrice ? 'disabled' : ''}>${repairPrice === 0 ? 'ALL GOOD' : `$${repairPrice}`}</button></div><button class="primary" id="resume">Back to the streets ${arrowIcon}</button>`;
  } else if (game.mode === 'wasted') {
    const bill = game.hospitalBill;
    const charges = [{ label: 'Medical bill', amount: bill.medical }];
    if (game.player.damage.status === 'wreck' || game.player.sinking) charges.push({ label: `${game.player.model === 'motorcycle' ? 'Bike' : 'Car'} repairs`, amount: bill.repairs });
    card.innerHTML = gameOverMarkup('WASTED', charges);
  } else if (game.mode === 'arrested') {
    const bill = game.arrestBill;
    card.innerHTML = gameOverMarkup('BUSTED', [{ label: 'Impound bill', amount: bill.impound }, { label: 'Bail', amount: bill.bail }]);
  }
  $('resume')?.addEventListener('click', playFromMenu);
  $('recover')?.addEventListener('click', () => { if (drafting()) return; realtime(); externalClock = false; game.recover(); renderer.camera = { ...game.actor.position }; $('city').focus(); });
  $('repair')?.addEventListener('click', () => { if (!drafting()) game.repair(); });
  document.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach(button => button.addEventListener('click', () => { if (!drafting()) game.buy(button.dataset.upgrade as Upgrade); }));
  if (!overlay.hidden && !sharedMenu) (card.querySelector('button:not(:disabled)') as HTMLButtonElement | null)?.focus();
}
function playFromMenu() {
  if (drafting()) return;
  const overlay = $('overlay');
  realtime(); externalClock = false;
  if (game.mode === 'intro') {
    splashExiting = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (splashExiting) { overlay.classList.add('splash-exiting'); overlay.inert = true; }
    game.start(); renderer.startIntroTransition();
    if (splashExiting) window.setTimeout(() => { if (splashExiting) { splashExiting = false; modal(); } }, 550);
  } else if (game.mode !== 'playing') game.setMode('playing');
  $('city').focus();
}
function bindGame() { game.onModeChange = () => { resetTouch(); game.keys.clear(); modal(); hud(); }; game.onChange = () => { modal(); hud(); }; }
bindGame();

function hud() {
  refreshInbox();
  refreshPlayerHud();
  const g = game, bike = g.player.definition.graphics.sprite === 'motorcycle', vehicleName = bike ? 'BIKE' : g.player.model === 'pickup' ? 'PICKUP' : 'CAB';
  refreshNavigationHud();
  document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button => { button.disabled = g.onFoot || g.mode !== 'playing'; });
  const boostButton = document.querySelector<HTMLButtonElement>('[data-key="boost"]')!;
  boostButton.style.setProperty('--boost-level', String(g.boost / 100));
  boostButton.setAttribute('aria-label', `Hold to boost (${Math.round(g.boost)}% tank remaining)`);
  document.querySelector('.controls>span:nth-child(2)')!.lastChild!.textContent = bike && !g.onFoot ? ' REAR BRAKE' : ' DRIFT';
  document.querySelector<HTMLButtonElement>('[data-key="handbrake"]')!.textContent = bike && !g.onFoot ? 'BRAKE' : 'DRIFT';
  $('toast').textContent = g.toast; $('toast').className = `toast ${g.toastTime > 0 && g.mode === 'playing' ? 'visible' : ''} ${g.toastKind}`;
  const damage = g.player.damage;
  const garageAction = $<HTMLButtonElement>('garage-action');
  garageAction.hidden = g.mode !== 'playing' || !g.garageNear || g.stars > 0 || !g.player.alive || !!g.player.sinking || damage.status === 'wreck' || !!g.pendingExit || !!g.tumble;
  garageAction.disabled = g.speed > 3;
  garageAction.textContent = garageAction.disabled ? 'Stop for garage' : 'Garage';
  $('interact').textContent = g.onFoot ? g.enterableCar?.model === 'motorcycle' && (g.enterableCar.dynamics as MotorcycleDynamics).fallen ? 'Lift motorbike' : g.enterableCar?.definition.graphics.sprite === 'motorcycle' ? 'Ride motorbike' : 'Get in' : g.pendingExit ? bike ? 'Jumping…' : 'Opening door…' : damage.status === 'burning' ? 'Bail out!' : g.speed > 1.2 ? bike ? 'Jump off' : 'Jump out' : bike ? 'Dismount' : 'Get out';
  ($('interact') as HTMLButtonElement).disabled = !!g.pendingExit;
  $('interact').hidden = g.mode !== 'playing' || (g.onFoot ? !g.enterableCar : !!g.player.sinking);
  const wreck = (damage.status === 'wreck' && !g.player.sinking && g.onFoot && dist(g.driver.position, g.player.body.position) < 6 || g.bikeTowable) && g.mode === 'playing';
  $('roadside').hidden = !wreck || damage.status === 'wreck' && g.time - g.player.wreckAt < 0.65;
  $('roadside').querySelector('strong')!.textContent = g.bikeDisabled && damage.status !== 'wreck' ? 'BIKE ENGINE DEAD' : `${vehicleName} DESTROYED`;
  $('roadside').querySelector('p')!.textContent = g.bikeDisabled && damage.status !== 'wreck' ? 'This motorbike is too damaged to start. Tow it for a repair or find another ride.' : 'The wreck stays here. Walk to a parked car or motorbike and keep your shift going.';
  ($('tow') as HTMLButtonElement).disabled = damage.status === 'wreck' && g.time - g.player.wreckAt < 1.2;
  $('tow-price').textContent = `Optional tow & repair: $${Math.min(g.save.cash, 60)} · or take another ride for free`;
  if (g.harbourPrompt && g.mode === 'playing' && damage.status !== 'burning') {
    $('interact').hidden = !g.portGateNear; $('interact').textContent = `Pay $${PORT_FEE}`; ($('interact') as HTMLButtonElement).disabled = false;
  }
  // Keep conversations out of emergencies and harbour interactions, without a warning banner.
  const drivingEmergency = damage.status === 'burning' || damage.status === 'wreck' || bike && !motorcycleEngineWorks(damage);
  refreshStory(g.mode === 'playing' && !g.onFoot && !g.player.sinking && !drivingEmergency && !g.harbourPrompt && $('roadside').hidden);
  lab?.refreshUI();
  inspection.refresh();
  refreshAudioControls(audio);
}
function toggleSound() { audio.configure({ muted: !audio.preferences.muted }); void audio.unlock(); hud(); }
function realtime() { if (mapWorkspace?.previewing) mapWorkspace.api.live(); else if (!drafting()) lab?.realtime(); }
function interact() { if (drafting() || renderer.inspection.paused || renderer.inspection.freeCamera || game.mode !== 'playing') return; if (externalClock && lab) realtime(); externalClock = false; game.interact(); hud(); $('city').focus(); }
function garage() { if (drafting()) return; game.garage(); hud(); if (game.mode === 'playing') $('city').focus(); }
function tow() { if (drafting() || game.mode !== 'playing' || !game.onFoot || !(game.player.damage.status === 'wreck' && dist(game.driver.position, game.player.body.position) < 6 || game.bikeTowable)) return; realtime(); externalClock = false; game.recover(); renderer.camera = { ...game.actor.position }; $('city').focus(); }
$('garage-action').addEventListener('click', garage); $('interact').addEventListener('click', interact); $('tow').addEventListener('click', tow);
// Lazy browser activation. Merely loading the page never creates an AudioContext.
document.addEventListener('pointerdown', event => {
  inputDevice = event.pointerType === 'touch' ? 'touch' : 'keyboard';
  if (event.isTrusted) void audio.unlock();
}, { capture: true });
// Refresh hints after the click target is fixed. Changing their wrapping while a
// finger is down can shift a scrolled menu row away from the release position.
document.addEventListener('click', () => detectInput(inputDevice), { capture: true });
function pause() { if (drafting()) return; if (game.mode === 'playing') game.setMode('paused'); else if (game.mode === 'paused' || game.mode === 'garage') playFromMenu(); }
document.addEventListener('contextmenu', event => { if (event.target instanceof Element && !event.target.closest('input, select, textarea, .audio-credits a, .credits-section a')) event.preventDefault(); });
window.addEventListener('keydown', e => {
  detectInput('keyboard');
  // A draft owns the game and the LAB panel. Reject keyboard shortcuts before
  // any caller can clear the external clock or mutate the original run. Programmatic
  // `__taxi.map` calls do not pass through this listener.
  if (drafting()) { e.preventDefault(); return; }
  if (inspection.keydown(e)) return;
  const target = e.target instanceof HTMLElement ? e.target : null;
  if (e.isTrusted && !e.repeat && !target?.closest('input, select, textarea')) void audio.unlock();
  if (!$('overlay').inert && !target?.closest('#debug-panel') && drawer.handleKey(e)) return;
  if (e.code === 'F2') { e.preventDefault(); if (!e.repeat) { if (game.mode === 'intro') game.start(); else if (game.mode === 'paused') game.setMode('playing'); ensureLab().toggle(); } return; }
  if (e.code === 'Space' && (game.mode === 'wasted' || game.mode === 'arrested') && !target?.closest('input, select, textarea')) {
    e.preventDefault(); if (!e.repeat) $('recover').click(); return;
  }
  // Preserve native keyboard activation for HUD buttons.
  if (target?.closest('button') && (e.code === 'Space' || e.code === 'Enter')) return;
  if (e.code !== 'Tab' && target?.closest('input, select, textarea')) return;
  if (renderer.inspection.paused && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyG', 'KeyH', 'KeyR'].includes(e.code)) { e.preventDefault(); return; }
  if (renderer.inspection.freeCamera && ['Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyG', 'KeyH', 'KeyR'].includes(e.code)) { e.preventDefault(); return; }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code) && e.code !== 'Tab') e.preventDefault();
   if (e.code === 'Tab' && game.mode !== 'playing' && !target?.closest('#debug-panel')) { const buttons = Array.from($('modal').querySelectorAll<HTMLElement>('button:not(:disabled),input,select')).filter(element => element.getClientRects().length > 0); const current = buttons.indexOf(document.activeElement as HTMLElement); if (buttons.length) { e.preventDefault(); buttons[(current + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus(); } }
    if (!e.repeat) { if (e.code === 'KeyP' || e.code === 'Escape') pause(); if (e.code === 'KeyG') garage(); if (e.code === 'KeyH') { game.navigateHarbour(); hud(); } if (e.code === 'KeyM') toggleSound(); if (e.code === 'KeyE') interact(); if (e.code === 'KeyR') tow(); }
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { if (externalClock && lab) realtime(); externalClock = false; }
  if (game.mode === 'playing') game.keys.add(e.code);
});
window.addEventListener('keyup', e => game.keys.delete(e.code));
window.addEventListener('blur', () => { audio.silence(game); resetTouch(); game.keys.clear(); if (!mapWorkspace?.editing && game.mode === 'playing') game.setMode('paused'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { resetTouch(); game.keys.clear(); audio.silence(game); if (!mapWorkspace?.editing && game.mode === 'playing') game.setMode('paused'); } });
window.addEventListener('pagehide', () => game.persist());
const resetTouch = bindTouchControls($('joystick'), document.querySelectorAll<HTMLButtonElement>('[data-key]'), {
  active: () => !mapWorkspace?.editing && !renderer.inspection.freeCamera && !renderer.inspection.paused && game.mode === 'playing',
  move: value => { game.touchMove = value; },
  action: (key, pressed) => { if (pressed) game.keys.add(key); else game.keys.delete(key); },
  begin: () => { if (drafting()) return; if (externalClock && lab) realtime(); externalClock = false; },
});
window.addEventListener('resize', resetTouch);
let previousPadButtons: boolean[] = [];
let previousPadAxes: number[] = [];
const padKeys = new Set<string>();
function pollController() {
  const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected && p.mapping === 'standard');
  const pressed = pad?.buttons.map(b => b.pressed) ?? [];
  const activity = pressed.some((value, index) => value && !previousPadButtons[index]) || !!pad?.axes.some((a, index) => Math.abs(a) > 0.25 && Math.abs(a - (previousPadAxes[index] ?? 0)) > 0.1);
  if (activity && pad) { detectInput(/sony|playstation|dualsense|dualshock|054c/i.test(pad.id) ? 'playstation' : 'xbox'); void audio.unlock(); }
  const locked = drafting() || renderer.inspection.freeCamera || renderer.inspection.paused;
  if (!locked && pad && drawer.active && !$('overlay').inert) {
    if (pressed[12] && !previousPadButtons[12]) drawer.move(-1);
    if (pressed[14] && !previousPadButtons[14]) drawer.adjust(-1);
    if (pressed[15] && !previousPadButtons[15]) drawer.adjust(1);
    if (pressed[13] && !previousPadButtons[13]) drawer.move(1);
    if (pressed[0] && !previousPadButtons[0]) drawer.activate();
    if (pressed[1] && !previousPadButtons[1]) drawer.back();
  }
  if (!locked && pad && pressed[9] && !previousPadButtons[9]) pause();
  for (const key of padKeys) game.keys.delete(key);
  padKeys.clear();
  if (!locked && pad && game.mode === 'playing' && (inputDevice === 'xbox' || inputDevice === 'playstation')) {
    const add = (key: string, active: boolean) => { if (active) { padKeys.add(key); game.keys.add(key); } };
    add('KeyA', pad.axes[0] < -0.2); add('KeyD', pad.axes[0] > 0.2);
    add('KeyW', pressed[7] || pad.axes[1] < -0.2); add('KeyS', pressed[6] || pad.axes[1] > 0.2);
    add('Space', pressed[2]); add('ShiftLeft', pressed[0]);
  }
  previousPadButtons = pressed;
  previousPadAxes = pad ? [...pad.axes] : [];
}
let last = performance.now(), accumulator = 0, hudClock = 0, externalClock = dialoguePreviewMode || scenarioPreviewMode || authoringPreviewMode, timeScale = 1;
const STEP = 1 / 120;
const inspection = createInspectionPanel(renderer, {
  available: () => !!laboratoryGame && game !== normalGame && !drafting(),
  clearInput: () => { resetTouch(); game.keys.clear(); game.touchMove = null; },
  redraw: () => renderer.draw(0),
  clockFrozen: () => externalClock,
});
function frame(now: number) {
  // Scenario mode renders only at explicit command boundaries. Wall-clock RAFs
  // must never move the simulation, reveal dialogue or change a captured scene.
  if (scenarioPreviewMode) return;
  // Authoring previews freeze while the CLI captures a deterministic frame, but the
  // animation loop must stay alive: returning here without rescheduling would kill it, so
  // `realtime()` could never resume the restored game. Simulation and painting stay frozen.
  if (authoringPreviewMode && externalClock) { last = now; requestAnimationFrame(frame); return; }
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  const locked = drafting() || renderer.inspection.paused;
  if (!externalClock && !locked) { accumulator += dt * timeScale; while (accumulator >= STEP) { game.update(STEP); accumulator -= STEP; } }
  pollController();
  audio.update(game, !externalClock && !locked, !document.hidden && document.hasFocus());
  renderer.draw(game.mode === 'paused' || renderer.inspection.paused ? 0 : dt);
  hudClock += dt; if (hudClock > 0.1) { hud(); hudClock = 0; }
  requestAnimationFrame(frame);
}
modal(); hud(); requestAnimationFrame(frame);

// The same test lab works in dev and the standalone HTML. Opt in via ?debug=1 or F2.
function ensureLab() {
  if (!laboratoryGame) { normalGame = game; normalGame.persist(); laboratoryGame = new Game(game.map, false, true, game.save); }
  const activateLab = () => { if (game === normalGame) { audio.silence(game); game = laboratoryGame!; renderer.game = game; bindGame(); renderer.camera = { ...game.actor.position }; modal(); hud(); } };
  activateLab();
  if (!mapWorkspace) mapWorkspace = new MapWorkspace(game, renderer, {
    clock: () => externalClock,
    freeze: frozen => { externalClock = frozen; accumulator = 0; if (!frozen) renderer.inspection.options.paused = false; },
    clearInput: () => { resetTouch(); game.keys.clear(); game.touchMove = null; game.controls = { throttle: 0, turn: 0, handbrake: false, boost: false }; },
    activate: active => { inspection.api.close(); game = active; renderer.game = active; bindGame(); modal(); hud(); },
    silence: () => audio.silence(game),
    lock: (panel, gameUi) => { $('debug-panel').inert = panel; $('app').inert = gameUi; },
  }, createPreview);
  if (!lab) lab = setupLab(game, renderer, {
    map: mapWorkspace.api,
    layers: inspection.api,
    enter: activateLab,
    leave: () => { if (mapWorkspace?.active) mapWorkspace.api.close(); inspection.api.close(); audio.silence(game); externalClock = false; accumulator = 0; timeScale = 1; game = normalGame!; renderer.game = game; bindGame(); renderer.camera = { ...game.actor.position }; $('debug-panel').hidden = true; modal(); hud(); $('city').focus(); },
    setExternalClock: frozen => { externalClock = frozen; accumulator = 0; if (frozen) audio.silence(game); else renderer.inspection.options.paused = false; },
    setTimeScale: scale => { timeScale = scale; },
    refresh: () => { hud(); renderer.draw(1 / 60); },
    focus: () => $('city').focus(),
    audio,
  });
  return lab;
}
if (new URLSearchParams(location.search).has('debug')) { ensureLab().open(); game.start(); }
// The authoring preview replaces this game while it is open. Start it up front so the
// handoff restores a live, playable world, and `realtime()` can be verified with real
// physics instead of a splash that automation cannot dismiss.
if (authoringPreviewMode) game.start();

// Opt-in CLI screenshot entry point. Uses the actual HUD, inbox, story panel and
// portrait renderer; each shot replaces only this isolated page's unsaved game.
if (dialoguePreviewMode) Object.assign(window, {
  __dialoguePreview: (input: PreviewState, missionId: string, view: 'offer' | 'pickup', legacy = false) => {
    externalClock = true; accumulator = 0; resetTouch();
    const scene = dialoguePreviewScene(input, missionId, view, legacy);
    game = scene.game; renderer.game = game; renderer.camera = { ...game.actor.position };
    drawer.reset();
    $('mission-inbox').hidden = true;
    bindGame(); modal(); hud(); refreshStory(true); renderer.draw(0);
    if (view === 'offer') openInbox();
    return { job: scene.job, state: scene.preview.state, context: scene.preview.context };
  },
});

// A single isolated game survives all CLI commands, including save reconstruction.
// Capture views temporarily project real panels; opening a notebook for a PNG
// does not pause the underlying scenario or change its narrative state.
if (scenarioPreviewMode) {
  let runner: ScenarioRunner;
  const show = (view: CaptureView = 'world', frame: CaptureFrame = {}) => {
    externalClock = true; accumulator = 0; resetTouch();
    game = runner.game; renderer.game = game;
    const focus = frame.focus && frame.focus !== 'actor' ? game.campaignSites[frame.focus]?.body.position : game.actor.position;
    if (!focus) throw new Error(`Unavailable camera focus: ${frame.focus}`);
    renderer.camera = { ...focus };
    renderer.zoom = frame.zoom ?? Math.max(5, Math.min(10.5, window.innerWidth / 125, window.innerHeight / 86));
    bindGame(); drawer.reset();
    $('mission-inbox').hidden = true;
    const mode = game.mode;
    try {
      if (view === 'notebook' || view === 'pause') { game.mode = 'paused'; void drawer.open(view === 'notebook' ? 'notebook' : 'home', { animate: false }); }
      modal(); hud(); renderer.draw(0);
      if (view === 'texts') { if (mode !== 'playing') throw new Error('Texts capture requires playing mode'); openInbox(); }
      if (view === 'story' && $('story').hidden) throw new Error('No visible ride conversation to capture');
    } finally { game.mode = mode; }
  };
  Object.assign(window, { __scenario: {
    start: (options: ScenarioOptions) => { runner = new ScenarioRunner(options); show(); return { inputs: runner.inputs(), state: runner.snapshot() }; },
    execute: (command: unknown) => { const result = runner.execute(command); show(); return result; },
    render: (view: CaptureView, frame: CaptureFrame) => { show(view, frame); return runner.snapshot(); },
    // QA: paint a world frame and report the on-board aura the renderer actually drew.
    aura: () => { show('world'); return renderer.lastAura ? { ...renderer.lastAura } : null; },
  } });
}

// Authoring previews use the same standalone build and actual renderer as normal play.
// The DOM-free checker compiles/validates the supplied document, and this hook only
// activates the resulting game and paints report geometry over it.
if (authoringPreviewMode) {
  const originalGame = game, originalCamera = { ...renderer.camera }, originalZoom = renderer.zoom;
  Object.assign(window, { __authoringPreview: createAuthoringPreview({
    renderer,
    activate: next => { game = next; renderer.game = next; bindGame(); },
    restore: () => { game = originalGame; renderer.game = originalGame; renderer.camera = { ...originalCamera }; renderer.zoom = originalZoom; bindGame(); },
    freeze: frozen => { externalClock = frozen; accumulator = 0; },
    draw: () => renderer.draw(0),
    refreshChrome: () => { drawer.reset(); $('mission-inbox').hidden = true; modal(); hud(); },
    silence: () => audio.silence(game),
    realtime: () => { externalClock = false; accumulator = 0; modal(); hud(); renderer.draw(0); $('city').focus(); },
    focus: () => $('city').focus(),
    // Read the live main game, so a handoff can be verified with real physics and time
    // rather than a restored boolean or a screenshot difference.
    probe: () => ({ mode: game.mode, time: game.time, position: { ...game.actor.position } }),
  }) });
}
