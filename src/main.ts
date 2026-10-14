import './style.css';
import { savedCampaignAvailable, splashMarkup, splashPrompts, type InputDevice } from './splash';
import { bindTouchControls } from './touch-controls';
import { Game, upgradeInfo, type Upgrade } from './game';
import { MotorcycleDynamics, motorcycleEngineWorks } from './motorcycle';
import { Renderer } from './renderer';
import { dist } from './physics';
import { PORT_FEE } from './harbour';
import { difficulties, type Difficulty } from './rules';
import { setupLab, type LabAPI } from './lab';
import { AudioFX } from './audio';
import { audioMarkup, bindAudioControls, refreshAudioControls } from './audio-controls';
import { MapEditor } from './map/editor';
import { bindStoryView, storyMarkup } from './story-view';
import { bindMissionInbox, inboxMarkup } from './mission-inbox';
import { bindPlayerHud, playerHudMarkup } from './player-hud';
import { bindNavigationHud, navigationHudMarkup } from './navigation-hud';
import './navigation-hud.css';
import { calendarLabel } from './campaign/clock';
import type { Allegation } from './campaign/model';
import { notebookMarkup } from './campaign/view';
import { dialoguePreviewScene } from './missions/dialogue-preview-scene';
import type { PreviewState } from './missions/dialogue-preview';
import { ScenarioRunner, type ScenarioOptions, type CaptureView, type CaptureFrame } from './scenarios/runner';

const icons = {
  cab: '<path d="M5 17H3V9l2-5h14l2 5v8h-2M5 17h14M5 17v3M19 17v3M3 9h18M7 13h2M15 13h2M9 4V2h6v2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  wrench: '<path d="m14 6 4 4 4-4a7 7 0 0 1-9 9l-7 7-4-4 7-7a7 7 0 0 1 9-9z"/>',
  target: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
};
const icon = (name: keyof typeof icons) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
document.querySelector('#app')!.innerHTML = `
  <canvas id="city" aria-label="Top-down taxi driving game. Use arrow keys or WASD to drive." tabindex="0"></canvas>
  ${navigationHudMarkup}
  ${storyMarkup}
  ${inboxMarkup}
  ${playerHudMarkup}
  <button id="interact" class="context-action" hidden>Get in</button>
  <section id="roadside" class="roadside panel" role="status" hidden><strong>CAB DESTROYED</strong><p>The wreck stays here. Walk to a parked car and keep your shift going.</p><div><button id="tow">R · Tow & repair</button></div><small id="tow-price"></small></section>
  <div class="toast" id="toast" role="status"></div>
  <footer class="controls"><span><kbd>W A S D</kbd> / <kbd>↑ ← ↓ →</kbd> DRIVE / WALK</span><span><kbd>SPACE</kbd> DRIFT</span><span><kbd>SHIFT</kbd> BOOST</span><span><kbd>E</kbd> EXIT / ENTER · HOLD <kbd>A/D</kbd> FOR SIDE</span><span><kbd>G</kbd> GARAGE</span><span><kbd>H</kbd> HARBOUR</span><span><kbd>P</kbd> PAUSE</span></footer>
  <div class="touch-controls" aria-label="Touch driving controls"><div class="thumb-actions"><button data-key="boost" aria-label="Hold to boost"><span>BOOST</span></button><button data-key="handbrake" aria-label="Hold handbrake">DRIFT</button></div><div id="joystick" class="joystick" role="group" aria-label="Drag to move: up accelerates, down brakes or reverses, left and right steer. On foot, drag in the direction to walk."><span class="joystick-guides" aria-hidden="true">＋</span><span class="joystick-knob" aria-hidden="true"></span></div></div>
  <div class="modal-backdrop" id="overlay"><section class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"></section></div>
  <div class="debug-panel" id="debug-panel" hidden></div>
`;
const dialoguePreviewMode = new URLSearchParams(location.search).has('dialogue-preview');
const scenarioPreviewMode = new URLSearchParams(location.search).has('scenario-preview');
const hasSavedCampaign = !dialoguePreviewMode && !scenarioPreviewMode && savedCampaignAvailable();
let game = new Game(undefined, !dialoguePreviewMode && !scenarioPreviewMode);
const audio = new AudioFX();
const renderer = new Renderer($('city') as HTMLCanvasElement, $('map') as HTMLCanvasElement, game);
const refreshStory = bindStoryView($('app'), () => game.dialogue, () => $('city').focus(), () => game.recordDialogue());
const { refresh: refreshInbox, open: openInbox } = bindMissionInbox($('app'), () => game, () => $('city').focus(), () => !scenarioPreviewMode, () => refreshNavigationHud.routeFare());
const refreshPlayerHud = bindPlayerHud($('app'), () => game);
const refreshNavigationHud = bindNavigationHud($('app'), () => game, { texts: openInbox, focus: () => $('city').focus(), routeVisibility: visible => { renderer.navigationRouteVisible = visible; } });
let inputDevice: InputDevice = 'keyboard';
function detectInput(device: InputDevice) {
  inputDevice = device;
  const prompts = $('splash-prompts');
  if (prompts) prompts.innerHTML = splashPrompts(device);
  const glyph = document.querySelector('.splash-action-glyph');
  if (glyph) glyph.textContent = device === 'touch' ? '→' : device === 'playstation' ? '×' : device === 'xbox' ? 'A' : '↵';
}
let helpOpen = false;
let splashExiting = false;
let statsOpen = false;
let notebookOpen = false;
let lab: LabAPI | undefined;
let mapEditor: MapEditor | undefined;
let normalGame: Game | undefined;
let laboratoryGame: Game | undefined;
function settingsMarkup() {
  return `<div class="play-options"><label><input id="gore-option" type="checkbox" ${game.settings.gore ? 'checked' : ''}> Pulp gore <span>Fatal impacts & blood</span></label><label>Difficulty <select id="difficulty-option" aria-label="Gameplay difficulty">${(Object.entries(difficulties) as [Difficulty, typeof difficulties.standard][]).map(([key, value]) => `<option value="${key}" ${game.settings.difficulty === key ? 'selected' : ''}>${value.name}</option>`).join('')}</select></label></div>${audioMarkup(audio)}`;
}
function introduction(help = false) {
  return `<div class="intro-eyebrow"><span class="live-dot"></span> WELCOME TO TAXI CHAOS</div><div class="intro-cab">${icon('cab')}</div><h2 id="modal-title">A little cab.<br><em>A lot of trouble.</em></h2><p class="intro-copy">Pick up. Drop off. Get paid.<br>How you get there is entirely your business.</p><div class="intro-grid"><div><span>01</span><strong>Chase the fare.</strong><p>Stop in the yellow ring. Deliver to green. Fast, smooth rides earn bigger tips.</p></div><div><span>02</span><strong>Make your own route.</strong><p>Drift corners. Smash crates, kiosks and hydrants. Buildings bite back.</p></div><div><span>03</span><strong>Stay one step ahead.</strong><p>Damage and speeding attract cops. Break line of sight to escape. H routes to the harbour: $75 buys entry and a fresh car when police cannot see you.</p></div></div><div class="intro-controls"><kbd>WASD / ARROWS</kbd> drive <kbd>SPACE</kbd> handbrake <kbd>SHIFT</kbd> boost</div><button class="primary" id="start">${help ? 'Back to the streets' : 'Start your shift'} ${icon('arrow')}</button><div class="intro-note">No fuel stops. No time-outs. Just one more fare.<br><span>Physics foundation: Pat Kerr's Motion Lab · Built for the joy of driving.</span></div>`;
}
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
  overlay.classList.toggle('splash-backdrop', game.mode === 'intro' && !helpOpen);
  document.body.classList.toggle('splash-active', game.mode === 'intro' && !helpOpen);
  card.className = `modal ${game.mode === 'garage' ? 'garage-modal' : ''}`;
  if (game.mode === 'intro' && !helpOpen) { card.classList.add('splash-modal'); card.innerHTML = splashMarkup(game, hasSavedCampaign, settingsMarkup()); detectInput(inputDevice); }
  else if (helpOpen) card.innerHTML = introduction(helpOpen).replace('<button class="primary"', `${settingsMarkup()}<button class="primary"`);
  else if (game.mode === 'paused' && notebookOpen) { card.classList.add('notebook-modal'); card.innerHTML = notebookMarkup(game); }
  else if (game.mode === 'paused' && statsOpen) card.innerHTML = `<div class="eyebrow">THIS SHIFT</div><h2 id="modal-title">Shift stats.</h2><p>Your time on the streets, in numbers.</p><div class="pause-stats shift-stats"><div><small>SHIFT EARNINGS</small><strong>$${game.shiftEarnings}</strong></div><div><small>JOBS COMPLETE</small><strong>${game.jobsDone}</strong></div><div><small>OBJECTS SMASHED</small><strong>${game.smashed}</strong></div><div><small>PEDESTRIAN FATALITIES</small><strong>${game.kills}</strong></div></div><button class="primary" id="stats-back">Back to pause menu ${icon('arrow')}</button>`;
  else if (game.mode === 'paused') card.innerHTML = `<div class="eyebrow">OFF THE CLOCK</div><h2 id="modal-title">Take a breather.</h2><p>The city can wait a minute.</p><div class="pause-stats"><div><small>SHIFT EARNINGS</small><strong>$${game.shiftEarnings}</strong></div><div><small>JOBS COMPLETE</small><strong>${game.jobsDone}</strong></div><div><small>OBJECTS SMASHED</small><strong>${game.smashed}</strong></div></div><button class="primary" id="resume">Back to the streets ${icon('arrow')}</button><button class="secondary" id="show-stats">Shift stats</button><button class="secondary" id="show-help">How to play</button>`;
  else if (game.mode === 'garage') {
    const upgrades = (Object.entries(upgradeInfo) as [Upgrade, typeof upgradeInfo.engine][]).map(([key, u]) => { const level = game.save.upgrades[key], price = game.price(key); return `<div class="upgrade"><div><span class="upgrade-number">0${Object.keys(upgradeInfo).indexOf(key) + 1}</span><h3>${u.name}</h3><p>${u.subtitle}</p><small>${u.detail}</small><div class="level">${[1, 2, 3].map(i => `<i class="${i <= level ? 'filled' : ''}"></i>`).join('')}<span>LEVEL ${level} / 3</span></div></div><button class="buy" data-upgrade="${key}" ${level >= 3 || game.save.cash < price ? 'disabled' : ''}>${level >= 3 ? 'MAXED' : `$${price}`}</button></div>`; }).join('');
    const repairPrice = game.repairPrice;
    card.innerHTML = `<div class="eyebrow">OLD TOWN / TUNING & REPAIRS <span class="garage-wallet">$${game.save.cash}</span></div><h2 id="modal-title">Pit Stop.</h2><p>Good drivers invest in bad decisions.</p><div class="upgrades">${upgrades}</div><div class="repair"><div><strong>Patch it up</strong><small>Restore your chassis to 100%.</small></div><button class="buy" id="repair" ${repairPrice === 0 || game.save.cash < repairPrice ? 'disabled' : ''}>${repairPrice === 0 ? 'ALL GOOD' : `$${repairPrice}`}</button></div><button class="primary" id="resume">Back to the streets ${icon('arrow')}</button>`;
  } else if (game.mode === 'wasted') {
    const bill = game.hospitalBill;
    const charges = [{ label: 'Medical bill', amount: bill.medical }];
    if (game.player.damage.status === 'wreck' || game.player.sinking) charges.push({ label: `${game.player.model === 'motorcycle' ? 'Bike' : 'Car'} repairs`, amount: bill.repairs });
    card.innerHTML = gameOverMarkup('WASTED', charges);
  } else if (game.mode === 'arrested') {
    const bill = game.arrestBill;
    card.innerHTML = gameOverMarkup('BUSTED', [{ label: 'Impound bill', amount: bill.impound }, { label: 'Bail', amount: bill.bail }]);
  }
  if (game.mode === 'paused' && !helpOpen && !statsOpen && !notebookOpen) {
    card.innerHTML = card.innerHTML.replace('<button class="primary"', `${settingsMarkup()}<button class="primary"`);
    if (game.campaignEnabled) {
      const preview = game.sleepPreview;
      card.innerHTML += `<div class="campaign-summary"><small>${game.save.campaign.finished ? game.campaignContent.finishedLabel : `${game.campaignContent.title.toUpperCase()} · DAY ${game.save.campaign.shift} OF 14 · ${calendarLabel(game.save.campaign.minute).split(' · ')[1]}`}</small><p>${game.campaignBulletin}</p><button class="secondary" id="open-notebook">Dispatch notebook</button><button class="secondary" id="sleep" ${game.sleepReason ? 'disabled' : ''}>${game.sleepReason ?? `Sleep at Pit Stop · wake ${preview.label}`}</button><p class="campaign-hint">The city clock advances while you drive. Sleep skips ${preview.hours.toFixed(1)} game hours; the world keeps changing. ${preview.expiring.length ? `Known bookings closing: ${preview.expiring.join(', ')}.` : 'No known bookings close during this sleep.'} Your parked car and cash stay as they are.</p>${!game.garageNear && !game.save.campaign.finished ? '<button class="secondary" id="sleep-route">Route to Pit Stop</button>' : ''}${game.job.stage === 'dropoff' ? '<button class="secondary" id="abandon-ride">Abandon this ride</button>' : '<button class="secondary" id="ordinary-fare">Ask dispatch for an ordinary fare</button>'}</div>`;
    }
  }
  if (game.mode === 'intro' || helpOpen) card.innerHTML = card.innerHTML.replace('Buildings bite back.', 'Buildings bite back. Hold W + Shift for a nitro burst.');
  if (game.mode === 'intro' || helpOpen) card.innerHTML = card.innerHTML.replace('No fuel stops. No time-outs. Just one more fare.', 'Two weeks pass while you drive. Park at Pit Stop to sleep until morning.<br>Dispatch mixes everyday and recurring customers. Texts let you choose a booking. Keep records in the pause menu’s Dispatch notebook.');
  $('start')?.addEventListener('click', () => {
    realtime(); externalClock = false; helpOpen = false;
    if (game.mode === 'intro') {
      splashExiting = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (splashExiting) { overlay.classList.add('splash-exiting'); overlay.inert = true; }
      game.start(); renderer.startIntroTransition();
      if (splashExiting) window.setTimeout(() => { if (splashExiting) { splashExiting = false; modal(); } }, 550);
    } else game.setMode('playing');
    $('city').focus();
  });
  $('resume')?.addEventListener('click', () => { realtime(); externalClock = false; statsOpen = notebookOpen = false; game.setMode('playing'); $('city').focus(); });
  $('recover')?.addEventListener('click', () => { realtime(); externalClock = false; game.recover(); renderer.camera = { ...game.actor.position }; $('city').focus(); });
  $('gore-option')?.addEventListener('change', e => game.configure({ gore: (e.target as HTMLInputElement).checked }));
  $('difficulty-option')?.addEventListener('change', e => game.configure({ difficulty: (e.target as HTMLSelectElement).value as Difficulty }));
  $('show-help')?.addEventListener('click', showHelp);
  $('show-stats')?.addEventListener('click', () => { statsOpen = true; modal(); });
  $('open-notebook')?.addEventListener('click', openNotebook);
  $('sleep')?.addEventListener('click', () => { if (game.sleep()) { realtime(); externalClock = false; $('city').focus(); } });
  $('sleep-route')?.addEventListener('click', () => { realtime(); externalClock = false; game.setMode('playing'); game.garage(); $('city').focus(); });
  $('ordinary-fare')?.addEventListener('click', () => { game.newJob(false, 'replaced', true); realtime(); externalClock = false; game.setMode('playing'); $('city').focus(); });
  $('abandon-ride')?.addEventListener('click', () => { game.newJob(false, 'shift'); modal(); });
  $('notebook-back')?.addEventListener('click', () => { notebookOpen = false; modal(); });
  $('notebook-route')?.addEventListener('click', () => { notebookOpen = false; realtime(); externalClock = false; game.setMode('playing'); game.navigateNewsroom(); hud(); $('city').focus(); });
  card.querySelectorAll<HTMLButtonElement>('[data-submit]').forEach(button => button.addEventListener('click', () => { if (game.submitMaterial(button.dataset.submit!)) { modal(); } }));
  card.querySelectorAll<HTMLButtonElement>('[data-publish]').forEach(button => button.addEventListener('click', () => { if (game.requestPublication(button.dataset.publish as Allegation)) modal(); }));
  $('notebook-search')?.addEventListener('input', e => { const query = (e.target as HTMLInputElement).value.toLocaleLowerCase(); card.querySelectorAll<HTMLElement>('[data-record]').forEach(article => { article.hidden = !article.textContent?.toLocaleLowerCase().includes(query); }); });
  $('stats-back')?.addEventListener('click', () => { statsOpen = false; modal(); $('show-stats').focus(); });
  $('repair')?.addEventListener('click', () => game.repair());
  document.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach(button => button.addEventListener('click', () => game.buy(button.dataset.upgrade as Upgrade)));
  bindAudioControls(card, audio);
  if (!overlay.hidden) ((game.mode === 'intro' ? $('start') : null) ?? card.querySelector('button:not(:disabled)') as HTMLButtonElement | null)?.focus();
}
function showHelp() { if (game.mode !== 'playing' && game.mode !== 'paused' && game.mode !== 'intro') return; statsOpen = notebookOpen = false; helpOpen = true; game.setMode('paused'); }
function openNotebook() { if (!game.campaignEnabled || (game.mode !== 'playing' && game.mode !== 'paused')) return; notebookOpen = true; statsOpen = helpOpen = false; game.setMode('paused'); }
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
  refreshAudioControls(audio);
}
function toggleSound() { audio.configure({ muted: !audio.preferences.muted }); void audio.unlock(); hud(); }
function realtime() { if (mapEditor?.active) mapEditor.api.live(); else lab?.realtime(); }
function interact() { if (game.mode !== 'playing') return; if (externalClock && lab) realtime(); externalClock = false; game.interact(); hud(); $('city').focus(); }
function tow() { if (game.mode !== 'playing' || !game.onFoot || !(game.player.damage.status === 'wreck' && dist(game.driver.position, game.player.body.position) < 6 || game.bikeTowable)) return; realtime(); externalClock = false; game.recover(); renderer.camera = { ...game.actor.position }; $('city').focus(); }
$('interact').addEventListener('click', interact); $('tow').addEventListener('click', tow);
// Lazy browser activation. Merely loading the page never creates an AudioContext.
document.addEventListener('pointerdown', event => { detectInput(event.pointerType === 'touch' ? 'touch' : 'keyboard'); if (event.isTrusted) void audio.unlock(); }, { capture: true });
function pause() { if (game.mode === 'playing') { statsOpen = notebookOpen = false; game.setMode('paused'); } else if (game.mode === 'paused' || game.mode === 'garage') { realtime(); externalClock = false; helpOpen = false; statsOpen = notebookOpen = false; game.setMode('playing'); } }
document.addEventListener('contextmenu', event => { if (event.target instanceof Element && !event.target.closest('input, select, textarea, .audio-credits a')) event.preventDefault(); });
window.addEventListener('keydown', e => {
  detectInput('keyboard');
  if (mapEditor?.handleKey(e)) return;
  const target = e.target instanceof HTMLElement ? e.target : null;
  if (e.isTrusted && !e.repeat && !target?.closest('input, select, textarea')) void audio.unlock();
  if (e.code === 'F2') { e.preventDefault(); if (!e.repeat) { if (game.mode === 'intro') game.start(); else if (game.mode === 'paused') game.setMode('playing'); ensureLab().toggle(); } return; }
  if (e.code === 'Space' && (game.mode === 'wasted' || game.mode === 'arrested') && !target?.closest('input, select, textarea')) {
    e.preventDefault(); if (!e.repeat) $('recover').click(); return;
  }
  // Preserve native keyboard activation for HUD buttons.
  if (target?.closest('button') && (e.code === 'Space' || e.code === 'Enter')) return;
  if (e.code !== 'Tab' && target?.closest('input, select, textarea')) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code) && e.code !== 'Tab') e.preventDefault();
   if (e.code === 'Tab' && game.mode !== 'playing' && !target?.closest('#debug-panel')) { const buttons = Array.from($('modal').querySelectorAll<HTMLElement>('button:not(:disabled),input,select')).filter(element => element.getClientRects().length > 0); const current = buttons.indexOf(document.activeElement as HTMLElement); if (buttons.length) { e.preventDefault(); buttons[(current + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus(); } }
    if (!e.repeat) { if (e.code === 'KeyP' || e.code === 'Escape') pause(); if (e.code === 'KeyG') game.garage(); if (e.code === 'KeyH') { game.navigateHarbour(); hud(); } if (e.code === 'KeyM') toggleSound(); if (e.code === 'KeyE') interact(); if (e.code === 'KeyR') tow(); }
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { if (externalClock && lab) { if (mapEditor?.active) mapEditor.api.live(); else lab.realtime(); } externalClock = false; }
  if (game.mode === 'playing') game.keys.add(e.code);
});
window.addEventListener('keyup', e => game.keys.delete(e.code));
window.addEventListener('blur', () => { audio.silence(game); resetTouch(); game.keys.clear(); if (!mapEditor?.editing && game.mode === 'playing') game.setMode('paused'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { resetTouch(); game.keys.clear(); audio.silence(game); if (!mapEditor?.editing && game.mode === 'playing') game.setMode('paused'); } });
window.addEventListener('pagehide', () => game.persist());
const resetTouch = bindTouchControls($('joystick'), document.querySelectorAll<HTMLButtonElement>('[data-key]'), {
  active: () => !mapEditor?.editing && game.mode === 'playing',
  move: value => { game.touchMove = value; },
  action: (key, pressed) => { if (pressed) game.keys.add(key); else game.keys.delete(key); },
  begin: () => { if (externalClock && lab) { if (mapEditor?.active) mapEditor.api.live(); else lab.realtime(); } externalClock = false; },
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
  if (pad && game.mode === 'intro' && pressed[0] && !previousPadButtons[0]) $('start')?.click();
  else if (pad && pressed[9] && !previousPadButtons[9]) pause();
  for (const key of padKeys) game.keys.delete(key);
  padKeys.clear();
  if (pad && game.mode === 'playing' && (inputDevice === 'xbox' || inputDevice === 'playstation')) {
    const add = (key: string, active: boolean) => { if (active) { padKeys.add(key); game.keys.add(key); } };
    add('KeyA', pad.axes[0] < -0.2); add('KeyD', pad.axes[0] > 0.2);
    add('KeyW', pressed[7] || pad.axes[1] < -0.2); add('KeyS', pressed[6] || pad.axes[1] > 0.2);
    add('Space', pressed[2]); add('ShiftLeft', pressed[0]);
  }
  previousPadButtons = pressed;
  previousPadAxes = pad ? [...pad.axes] : [];
}
let last = performance.now(), accumulator = 0, hudClock = 0, externalClock = dialoguePreviewMode || scenarioPreviewMode, timeScale = 1;
const STEP = 1 / 120;
function frame(now: number) {
  // Scenario mode renders only at explicit command boundaries. Wall-clock RAFs
  // must never move the simulation, reveal dialogue or change a captured scene.
  if (scenarioPreviewMode) return;
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (!externalClock) { accumulator += dt * timeScale; while (accumulator >= STEP) { game.update(STEP); accumulator -= STEP; } }
  pollController();
  audio.update(game, !externalClock, !document.hidden && document.hasFocus());
  if (!mapEditor?.editing) renderer.draw(dt);
  hudClock += dt; if (hudClock > 0.1) { hud(); hudClock = 0; }
  requestAnimationFrame(frame);
}
modal(); hud(); requestAnimationFrame(frame);

// The same test lab works in dev and the standalone HTML. Opt in via ?debug=1 or F2.
function ensureLab() {
  if (!laboratoryGame) { normalGame = game; normalGame.persist(); laboratoryGame = new Game(game.map, false, true, game.save); }
  const activateLab = () => { if (game === normalGame) { audio.silence(game); game = laboratoryGame!; renderer.game = game; bindGame(); renderer.camera = { ...game.actor.position }; modal(); hud(); } };
  activateLab();
  if (!mapEditor) mapEditor = new MapEditor(game, renderer, {
    clock: () => externalClock,
    freeze: frozen => { externalClock = frozen; accumulator = 0; },
    clearInput: () => { resetTouch(); game.keys.clear(); game.touchMove = null; game.controls = { throttle: 0, turn: 0, handbrake: false, boost: false }; },
    activate: active => { game = active; renderer.game = active; bindGame(); modal(); hud(); },
    silence: () => audio.silence(game),
  });
  if (!lab) lab = setupLab(game, renderer, {
    map: mapEditor.api,
    enter: activateLab,
    leave: () => { if (mapEditor?.active) mapEditor.api.close(); audio.silence(game); externalClock = false; accumulator = 0; timeScale = 1; game = normalGame!; renderer.game = game; bindGame(); renderer.camera = { ...game.actor.position }; $('debug-panel').hidden = true; modal(); hud(); $('city').focus(); },
    setExternalClock: frozen => { externalClock = frozen; accumulator = 0; if (frozen) audio.silence(game); },
    setTimeScale: scale => { timeScale = scale; },
    refresh: () => { hud(); renderer.draw(1 / 60); },
    focus: () => $('city').focus(),
    audio,
  });
  return lab;
}
if (new URLSearchParams(location.search).has('debug')) { ensureLab().open(); game.start(); }

// Opt-in CLI screenshot entry point. Uses the actual HUD, inbox, story panel and
// portrait renderer; each shot replaces only this isolated page's unsaved game.
if (dialoguePreviewMode) Object.assign(window, {
  __dialoguePreview: (input: PreviewState, missionId: string, view: 'offer' | 'pickup', legacy = false) => {
    externalClock = true; accumulator = 0; resetTouch();
    const scene = dialoguePreviewScene(input, missionId, view, legacy);
    game = scene.game; renderer.game = game; renderer.camera = { ...game.actor.position };
    helpOpen = statsOpen = notebookOpen = false;
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
    bindGame(); helpOpen = statsOpen = notebookOpen = false;
    $('mission-inbox').hidden = true;
    const mode = game.mode;
    try {
      if (view === 'notebook' || view === 'pause') { game.mode = 'paused'; notebookOpen = view === 'notebook'; }
      modal(); hud(); renderer.draw(0);
      if (view === 'texts') { if (mode !== 'playing') throw new Error('Texts capture requires playing mode'); openInbox(); }
      if (view === 'story' && $('story').hidden) throw new Error('No visible ride conversation to capture');
    } finally { game.mode = mode; }
  };
  Object.assign(window, { __scenario: {
    start: (options: ScenarioOptions) => { runner = new ScenarioRunner(options); show(); return { inputs: runner.inputs(), state: runner.snapshot() }; },
    execute: (command: unknown) => { const result = runner.execute(command); show(); return result; },
    render: (view: CaptureView, frame: CaptureFrame) => { show(view, frame); return runner.snapshot(); },
  } });
}
