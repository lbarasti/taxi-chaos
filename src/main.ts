import './style.css';
import { bindTouchControls } from './touch-controls';
import { bindFullscreen } from './fullscreen';
import { Game, upgradeInfo, type Upgrade } from './game';
import { MotorcycleDynamics, motorcycleEngineWorks } from './motorcycle';
import { Renderer } from './renderer';
import { dist } from './physics';
import { PORT_FEE } from './harbour';
import { district } from './world';
import { difficulties, type Difficulty } from './rules';
import { setupLab, type LabAPI } from './lab';
import { AudioFX } from './audio';
import { audioMarkup, bindAudioControls, refreshAudioControls } from './audio-controls';
import { MapEditor } from './map/editor';
import { bindStoryView, storyMarkup } from './story-view';
import { bindMissionInbox, inboxMarkup } from './mission-inbox';
import { notebookMarkup } from './campaign/view';
import { dialoguePreviewScene } from './missions/dialogue-preview-scene';
import type { PreviewState } from './missions/dialogue-preview';

const icons = {
  fullscreen: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  cab: '<path d="M5 17H3V9l2-5h14l2 5v8h-2M5 17h14M5 17v3M19 17v3M3 9h18M7 13h2M15 13h2M9 4V2h6v2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  wrench: '<path d="m14 6 4 4 4-4a7 7 0 0 1-9 9l-7 7-4-4 7-7a7 7 0 0 1 9-9z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  target: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  sound: '<path d="M11 5 6 9H3v6h3l5 4V5M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
};
const icon = (name: keyof typeof icons) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
document.querySelector('#app')!.innerHTML = `
  <canvas id="city" aria-label="Top-down taxi driving game. Use arrow keys or WASD to drive." tabindex="0"></canvas>
  <header class="topbar">
    <div class="brand"><button id="taxi-menu-toggle" class="brand-icon" aria-label="Open Taxi Chaos menu" aria-expanded="false" aria-controls="taxi-menu">${icon('cab')}</button><span>TAXI<span class="brand-light">CHAOS</span><small>THE STREETS ARE YOURS.</small></span></div><nav id="taxi-menu" class="taxi-menu panel" aria-label="Taxi Chaos menu" hidden><button id="help">How to play</button><button id="notebook-menu">Dispatch notebook</button><button id="photo-menu">Bookmark café frontage</button><button id="lab-button">Test lab <kbd>F2</kbd></button></nav>
    <div class="top-center"><span class="live-dot"></span> ON THE CLOCK <span class="divider">/</span><span id="district">OLD TOWN</span></div>
    <div class="hud-clock" id="hud-clock" role="timer" aria-label="World time 07:00, morning, day 1"><span class="hud-clock-icon" id="clock-sun">${icon('sun')}</span><span class="hud-clock-icon" id="clock-moon" hidden>${icon('moon')}</span><span class="hud-clock-text"><strong id="clock-time">07:00</strong><small id="clock-period">MORNING</small></span></div>
    <div class="top-actions"><div class="cash"><small>YOUR WALLET</small><strong id="cash">$80</strong></div><button id="sound-toggle" class="icon-button" title="Mute FX · M" aria-label="Mute sound FX" aria-pressed="false">${icon('sound')}</button><button id="pause" class="icon-button" title="Pause · P" aria-label="Pause game">${icon('pause')}</button><button id="fullscreen" class="icon-button" title="Enter fullscreen" aria-label="Enter fullscreen" aria-pressed="false">${icon('fullscreen')}</button></div>
  </header>
  <aside class="mission panel" aria-label="Current driving job">
    <div class="eyebrow"><span id="job-label">YOUR FIRST FARE</span><span class="tiny-tag" id="job-status">PICKUP</span></div>
    <div class="mission-heading"><span class="mission-icon">${icon('target')}</span><h1 id="mission-title">Meet Mia.</h1></div>
    <p class="mobile-hint" id="mobile-hint"></p><p id="mission-description">A customer is waiting just up the street.</p>
    <div class="mission-data"><div><small>BASE FARE</small><strong id="fare">$83 <span>+ tips</span></strong></div><div><small id="distance-label">TO PICKUP</small><strong id="distance">18 <span>m</span></strong></div></div>
    <div class="mission-footer" id="mission-footer"><span class="ring-dot"></span> Stop inside the yellow ring to pick up.</div>
    <div class="job-progress"><i id="job-progress"></i></div>
  </aside>
  ${storyMarkup}
  <button id="texts-toggle" class="texts-toggle panel" aria-expanded="false" aria-controls="mission-inbox">Texts · 0</button>
  ${inboxMarkup}
  <section class="dashboard panel" aria-label="Cab condition"><div class="speed"><strong id="speed">00</strong><span>MPH<small id="gear">IDLE</small></span></div><div class="cab-meters"><div><span>CHASSIS</span><div class="meter"><i id="health-bar"></i></div><b id="health">100%</b></div><div><span>BOOST <kbd>⇧</kbd></span><div class="meter"><i id="boost-bar"></i></div><b id="boost">100%</b></div></div><div class="dashboard-footer"><span id="deliveries">0 fares this shift</span><span id="earnings">+$0 earned</span></div><div class="heat-panel" id="heat-panel" role="status"><div class="heat-top"><span id="heat-title">KEEP IT CLEAN</span><span id="stars">☆ ☆ ☆</span></div><div class="heat-track"><i id="heat-fill"></i></div><small id="heat-description">A little mischief goes a long way.</small></div></section>
  <div class="critical-status panel" id="critical-status" hidden><strong id="condition">ENGINE DAMAGE</strong><span id="components"></span></div>
  <button id="interact" class="context-action" hidden>Get in</button>
  <section id="roadside" class="roadside panel" role="status" hidden><strong>CAB DESTROYED</strong><p>The wreck stays here. Walk to a parked car and keep your shift going.</p><div><button id="tow">R · Tow & repair</button></div><small id="tow-price"></small></section>
  <div class="toast" id="toast" role="status"></div>
  <aside class="map-panel panel" aria-label="Local radar"><button id="map-toggle" class="map-toggle" aria-expanded="true" aria-controls="map-content" aria-label="Collapse radar"><span>RADAR</span><span id="map-status">LIVE</span><span class="map-chevron" aria-hidden="true">⌄</span></button><div id="map-content"><canvas id="map" aria-label="Local minimap: yellow is your taxi, circle or edge arrow is your destination, blue square is the garage, red dots are police"></canvas></div><button id="garage" class="garage-button">${icon('wrench')}<span>Pit Stop garage</span><kbd>G</kbd></button><button id="harbour" class="garage-button"><span>Harbour · $75</span><kbd>H</kbd></button></aside>
  <footer class="controls"><span><kbd>W A S D</kbd> / <kbd>↑ ← ↓ →</kbd> DRIVE / WALK</span><span><kbd>SPACE</kbd> DRIFT</span><span><kbd>SHIFT</kbd> BOOST</span><span><kbd>E</kbd> EXIT / ENTER · HOLD <kbd>A/D</kbd> FOR SIDE</span><span><kbd>G</kbd> GARAGE</span><span><kbd>H</kbd> HARBOUR</span><span><kbd>P</kbd> PAUSE</span></footer>
  <div class="touch-controls" aria-label="Touch driving controls"><div class="thumb-actions"><button data-key="boost" aria-label="Hold to boost">BOOST</button><button data-key="handbrake" aria-label="Hold handbrake">DRIFT</button></div><div id="joystick" class="joystick" role="group" aria-label="Drag to move: up accelerates, down brakes or reverses, left and right steer. On foot, drag in the direction to walk."><span class="joystick-guides" aria-hidden="true">＋</span><span class="joystick-knob" aria-hidden="true"></span></div></div>
  <div class="modal-backdrop" id="overlay"><section class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"></section></div>
  <div class="debug-panel" id="debug-panel" hidden></div>
`;
const dialoguePreviewMode = new URLSearchParams(location.search).has('dialogue-preview');
let game = new Game(undefined, !dialoguePreviewMode);
const audio = new AudioFX();
const renderer = new Renderer($('city') as HTMLCanvasElement, $('map') as HTMLCanvasElement, game);
const refreshStory = bindStoryView($('app'), () => game.dialogue, () => $('city').focus());
const refreshInbox = bindMissionInbox($('app'), () => game, () => $('city').focus());
let helpOpen = false;
let statsOpen = false;
let notebookOpen = false;
let lab: LabAPI | undefined;
let mapEditor: MapEditor | undefined;
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
  const overlay = $('overlay'), card = $('modal'); overlay.hidden = game.mode === 'playing';
  overlay.classList.toggle('game-over', game.mode === 'wasted' || game.mode === 'arrested');
  card.className = `modal ${game.mode === 'garage' ? 'garage-modal' : ''}`;
  if (game.mode === 'intro' || helpOpen) card.innerHTML = introduction(helpOpen).replace('<button class="primary"', `${settingsMarkup()}<button class="primary"`);
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
    if (game.campaignEnabled) card.innerHTML += `<div class="campaign-summary"><small>${game.save.campaign.finished ? 'ELECTION DAY · OFF THE CLOCK' : `OPEN SHORE · SHIFT ${game.save.campaign.shift} OF 14`}</small><p>${game.campaignBulletin}</p><button class="secondary" id="open-notebook">Dispatch notebook</button><button class="secondary" id="end-shift" ${game.job.stage === 'dropoff' || game.save.campaign.finished ? 'disabled' : ''}>${game.save.campaign.finished ? 'Campaign finished · free driving continues' : game.job.stage === 'dropoff' ? 'Finish or abandon your current ride first' : game.save.campaign.shift === 14 ? 'End election-day shift' : `End shift · start shift ${game.save.campaign.shift + 1}`}</button><p class="campaign-hint">Ending a shift advances the campaign and closes dated bookings. Pausing, hospital recovery and reloading leave the date alone.</p>${game.job.stage === 'dropoff' ? '<button class="secondary" id="abandon-ride">Abandon this ride</button>' : ''}</div>`;
  }
  if (game.mode === 'intro' || helpOpen) card.innerHTML = card.innerHTML.replace('Buildings bite back.', 'Buildings bite back. Hold W + Shift for a nitro burst.');
  if (game.mode === 'intro' || helpOpen) card.innerHTML = card.innerHTML.replace('No fuel stops. No time-outs. Just one more fare.', 'Two weeks of shifts. End a shift from the pause menu when you’re ready.<br>Texts hold bookings. The Taxi menu holds your dispatch notebook.');
  $('start')?.addEventListener('click', () => { realtime(); externalClock = false; helpOpen = false; if (game.mode === 'intro') game.start(); else game.setMode('playing'); $('city').focus(); });
  $('resume')?.addEventListener('click', () => { realtime(); externalClock = false; statsOpen = notebookOpen = false; game.setMode('playing'); $('city').focus(); });
  $('recover')?.addEventListener('click', () => { realtime(); externalClock = false; game.recover(); renderer.camera = { ...game.actor.position }; $('city').focus(); });
  $('gore-option')?.addEventListener('change', e => game.configure({ gore: (e.target as HTMLInputElement).checked }));
  $('difficulty-option')?.addEventListener('change', e => game.configure({ difficulty: (e.target as HTMLSelectElement).value as Difficulty }));
  $('show-help')?.addEventListener('click', showHelp);
  $('show-stats')?.addEventListener('click', () => { statsOpen = true; modal(); });
  $('open-notebook')?.addEventListener('click', openNotebook);
  $('end-shift')?.addEventListener('click', () => { if (game.endShift() && !game.save.campaign.finished) { realtime(); externalClock = false; renderer.camera = { ...game.actor.position }; $('city').focus(); } });
  $('abandon-ride')?.addEventListener('click', () => { game.newJob(false, 'shift'); modal(); });
  $('notebook-back')?.addEventListener('click', () => { notebookOpen = false; modal(); });
  $('notebook-route')?.addEventListener('click', () => { notebookOpen = false; realtime(); externalClock = false; game.setMode('playing'); game.navigateNewsroom(); hud(); $('city').focus(); });
  card.querySelectorAll<HTMLButtonElement>('[data-submit]').forEach(button => button.addEventListener('click', () => { if (game.submitMaterial(button.dataset.submit!)) { button.textContent = 'Copy received · retained here'; button.disabled = true; } }));
  $('notebook-search')?.addEventListener('input', e => { const query = (e.target as HTMLInputElement).value.toLocaleLowerCase(); card.querySelectorAll<HTMLElement>('[data-record]').forEach(article => { article.hidden = !article.textContent?.toLocaleLowerCase().includes(query); }); });
  $('stats-back')?.addEventListener('click', () => { statsOpen = false; modal(); $('show-stats').focus(); });
  $('repair')?.addEventListener('click', () => game.repair());
  document.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach(button => button.addEventListener('click', () => game.buy(button.dataset.upgrade as Upgrade)));
  bindAudioControls(card, audio);
  if (!overlay.hidden) (card.querySelector('button:not(:disabled)') as HTMLButtonElement | null)?.focus();
}
function showHelp() { if (game.mode !== 'playing' && game.mode !== 'paused' && game.mode !== 'intro') return; statsOpen = notebookOpen = false; helpOpen = true; game.setMode('paused'); }
function openNotebook() { if (!game.campaignEnabled || (game.mode !== 'playing' && game.mode !== 'paused')) return; notebookOpen = true; statsOpen = helpOpen = false; game.setMode('paused'); }
function bindGame() { game.onModeChange = () => { resetTouch(); game.keys.clear(); setMenu(false); modal(); hud(); }; game.onChange = () => { modal(); hud(); }; }
bindGame();
function hud() {
  refreshInbox();
  const { inSand } = game.map.beach;
  const g = game, job = g.job, pickup = job.stage === 'pickup', speed = Math.round(g.speed * 2.237), parcel = job.type === 'parcel', bike = g.player.definition.graphics.sprite === 'motorcycle', vehicleName = bike ? 'BIKE' : g.player.model === 'pickup' ? 'PICKUP' : 'CAB';
  const dayNight = g.dayNight.snapshot(), night = dayNight.period === 'night';
  $('clock-time').textContent = dayNight.time; $('clock-period').textContent = dayNight.period.toUpperCase();
  $('hud-clock').setAttribute('aria-label', `World time ${dayNight.time}, ${dayNight.period}, campaign shift ${g.save.campaign.shift} of 14`);
  $('clock-sun').hidden = night; $('clock-moon').hidden = !night;
  $('cash').textContent = `$${g.save.cash.toLocaleString()}`; $('district').textContent = district(g.actor.position, g.map);
  $('job-label').textContent = g.jobsDone === 0 && pickup ? 'YOUR FIRST FARE' : `FARE ${String(g.jobsDone + 1).padStart(2, '0')} / ${pickup ? 'CUSTOMER WAITING' : 'PASSENGER ON BOARD'}`;
  $('job-status').textContent = pickup ? 'PICKUP' : 'ON BOARD'; $('job-status').classList.toggle('green', !pickup);
  $('mission-title').textContent = pickup ? `Meet ${job.name}.` : `${job.destination}.`;
  $('mission-description').textContent = pickup ? `${job.name} needs a lift. Follow the yellow route on the radar.` : `${job.name} is riding with you. Make it a good one.`;
  $('fare').innerHTML = `$${job.fare} <span>+ tips</span>`; $('distance-label').textContent = pickup ? 'TO PICKUP' : 'TO DROP-OFF'; $('distance').innerHTML = `${Math.round(dist(g.actor.position, g.target))} <span>m</span>`;
  $('mission-footer').innerHTML = pickup ? '<span class="ring-dot"></span> Stop in the yellow ring to pick up.' : `<span class="ring-dot green"></span> ${job.elapsed < job.time ? `FAST TIP · ${Math.ceil(job.time - job.elapsed)}s` : 'NO RUSH · Still earning your base fare'} <span class="comfort">${Math.round(job.comfort)}% comfort</span>`;
  if (parcel) {
    $('job-label').textContent = `COURIER / DELIVERY ${String(g.jobsDone + 1).padStart(2, '0')}`;
    $('job-status').textContent = pickup ? 'PARCEL PICKUP' : 'PARCEL LOADED';
    $('mission-title').textContent = pickup ? `Collect ${job.name}'s parcel.` : `${job.destination}.`;
    $('mission-description').textContent = pickup ? 'Stop in the yellow ring to load your courier rack. Follow the radar route.' : 'Parcel secured on the rear rack. Stop in the green ring to deliver.';
    $('mission-footer').innerHTML = pickup ? '<span class="ring-dot"></span> Stop in yellow to load the parcel.' : `<span class="ring-dot green"></span> ${job.elapsed < job.time ? `FAST TIP · ${Math.ceil(job.time - job.elapsed)}s` : 'NO RUSH · Base delivery pay guaranteed'} <span class="comfort">${Math.round(job.comfort)}% intact</span>`;
  }
  $('job-progress').style.width = `${job.wait / 0.8 * 100}%`; $('job-progress').style.background = pickup ? '#f7ce55' : '#a3ddc2';
  if (g.navToGarage) { $('job-label').textContent = 'TUNING & REPAIRS'; $('job-status').textContent = 'GARAGE'; $('mission-title').textContent = 'Pit Stop.'; $('mission-description').textContent = 'Follow the blue radar route back to Old Town.'; $('distance-label').textContent = 'TO GARAGE'; $('mission-footer').innerHTML = '<span class="ring-dot"></span> Stop at Pit Stop, then press G to enter.'; }
  if (g.navToNewsroom) { $('job-label').textContent = 'CITY DESK'; $('job-status').textContent = 'DROP-IN'; $('mission-title').textContent = 'Newsroom · Old Town South'; $('mission-description').textContent = 'Stop nearby and open the Dispatch notebook to leave selected material.'; $('distance-label').textContent = 'TO NEWSROOM'; $('mission-footer').textContent = 'Stop nearby · Taxi menu → Dispatch notebook to leave copies.'; }
  if (g.onFoot && g.tumble) { $('job-label').textContent = 'BAILOUT'; $('job-status').textContent = g.tumble.grounded ? 'ROLLING' : 'IN THE AIR'; $('mission-title').textContent = 'Brace for impact.'; $('mission-description').textContent = 'You carry the ride’s momentum into the fall. Landing hurts more at higher speeds.'; $('mission-footer').textContent = 'Recover from the roll before taking another ride.'; }
  else if (g.onFoot) { $('job-label').textContent = 'KEEP YOUR SHIFT GOING'; $('job-status').textContent = 'ON FOOT'; $('mission-title').textContent = 'Find a ride.'; $('mission-description').textContent = 'WASD / arrows to walk. Blue radar markers show parked cars and motorbikes.'; $('distance-label').textContent = 'TO NEXT RIDE'; $('mission-footer').textContent = g.enterableCar ? `Press E to ${g.enterableCar.definition.graphics.sprite === 'motorcycle' ? 'ride' : 'get in'}. Wallet & upgrades carry over.` : 'Follow the blue radar route. E takes a parked ride.'; }
  document.querySelector('.mission')!.classList.toggle('on-foot', g.onFoot);
  $('mobile-hint').textContent = g.navToNewsroom ? 'Stop nearby · Notebook to leave copies' : g.onFoot ? '' : g.navToGarage ? 'Stop at Pit Stop' : pickup ? parcel ? 'Stop in yellow to collect' : 'Stop in yellow to pick up' : `Stop in green to deliver${job.elapsed < job.time ? ` · ${Math.ceil(job.time - job.elapsed)}s tip` : ''}`;
  document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button => { button.disabled = g.onFoot || g.mode !== 'playing'; });
  if (!g.onFoot && (g.navToHarbour || g.harbour.vehicleId === g.player.id)) {
    const admitted = g.harbour.vehicleId === g.player.id;
    $('job-label').textContent = 'NORTHSTAR HARBOUR'; $('job-status').textContent = admitted ? g.harbour.exchanged ? 'CLEAN RECORD' : 'ADMITTED' : 'SECURITY';
    $('mission-title').textContent = admitted ? g.harbour.exchanged ? 'Take the exit.' : 'Container C-76.' : g.policeVisible ? 'Lose the tail.' : g.portGateNear ? 'Pay security.' : 'Northstar Harbour.';
    $('mission-description').textContent = admitted ? g.harbour.exchanged ? 'Your fresh car has a new identity. All police warnings are cleared.' : 'Follow cyan, drive fully inside the open container, then stop. Police must stay out of sight.' : `Follow cyan to the north docks. Entry + one car swap costs $${PORT_FEE}. Police must be out of line of sight.`;
    $('distance-label').textContent = admitted ? g.harbour.exchanged ? 'TO EXIT' : 'TO EXCHANGE' : 'TO SECURITY'; $('mission-footer').textContent = g.harbourPrompt ?? (admitted ? 'Use the marked lanes. Keep clear of the loading cranes.' : 'Stop before the security arm, then press E to pay.');
    $('fare').textContent = admitted ? 'PAID' : `$${PORT_FEE}`; document.querySelector('.mission-data small')!.textContent = 'ENTRY + SWAP';
    $('mobile-hint').textContent = admitted ? g.harbour.exchanged ? 'New car ready · use the exit' : g.harbourPrompt ?? 'Stop fully inside container C-76' : g.policeVisible ? 'Lose the tail before paying' : g.portGateNear ? `Stop and pay $${PORT_FEE} at security` : 'Follow cyan to port security';
    $('job-progress').style.width = `${g.harbour.progress / 2.5 * 100}%`; $('job-progress').style.background = '#8edbe8';
  } else document.querySelector('.mission-data small')!.textContent = 'BASE FARE';
  $('speed').textContent = String(speed).padStart(2, '0'); $('gear').textContent = g.onFoot ? g.tumble ? 'TUMBLING' : 'ON FOOT' : g.pendingExit ? bike ? 'JUMPING OFF' : 'DOOR OPENING' : g.player.damage.status === 'wreck' ? `${vehicleName} DOWN` : bike && !motorcycleEngineWorks(g.player.damage) ? 'ENGINE STALLED' : g.controls.boost ? 'NITRO ACTIVE' : g.controls.handbrake ? bike ? 'REAR BRAKE' : 'SLIDING' : speed < 2 ? bike ? 'COURIER BIKE' : 'IDLE' : g.controls.throttle < 0 ? 'BRAKING' : inSand(g.actor.position) ? g.player.model === 'pickup' ? 'OFF-ROAD' : 'SOFT SAND' : bike ? `BIKE · ${Math.round(Math.abs(g.lean) * 180 / Math.PI)}° LEAN` : 'ON THE MOVE';
  document.querySelector('.controls>span:nth-child(2)')!.lastChild!.textContent = bike && !g.onFoot ? ' REAR BRAKE' : ' DRIFT';
  document.querySelector<HTMLButtonElement>('[data-key="handbrake"]')!.textContent = bike && !g.onFoot ? 'BRAKE' : 'DRIFT';
  document.querySelector('.dashboard')!.setAttribute('aria-label', g.onFoot ? 'Driver health' : bike ? 'Motorbike condition' : 'Cab condition');
  document.querySelector('.cab-meters>div>span')!.textContent = g.onFoot ? 'HEALTH' : 'CHASSIS';
  document.querySelector('.dashboard')!.classList.toggle('boosting', !!g.controls.boost);
  $('health').textContent = `${Math.ceil(g.health)}%`; $('health-bar').style.width = `${g.health}%`; $('health-bar').style.background = g.health < 30 ? '#ee8675' : '#a3ddc2';
  $('boost').textContent = `${Math.round(g.boost)}%`; $('boost-bar').style.width = `${g.boost}%`;
  $('deliveries').textContent = `${g.jobsDone} job${g.jobsDone === 1 ? '' : 's'} this shift`; $('earnings').textContent = `+$${g.shiftEarnings} earned`;
  $('stars').textContent = [0, 1, 2].map(i => i < g.stars ? '★' : '☆').join(' '); $('heat-panel').classList.toggle('wanted', g.stars > 0);
  $('heat-title').textContent = g.arrest > 0 ? 'GET MOVING!' : g.stars > 0 ? (g.escape > 0 ? 'LOSING THEM…' : 'POLICE PURSUIT') : g.heat > 5 ? 'MAKING A SCENE' : 'KEEP IT CLEAN';
  $('heat-fill').style.width = `${g.stars && g.escape ? (1 - g.escape / g.rules.escapeTime) * 100 : g.heat}%`;
  $('heat-description').textContent = g.arrest > 0 ? `Arrest in ${(g.rules.arrestTime - g.arrest).toFixed(1)}s. Drive!` : g.stars > 0 ? (g.escape > 0 ? `Stay out of sight for ${Math.ceil(g.rules.escapeTime - g.escape)}s to escape.` : 'Break line of sight. Police use shared sightings.') : 'Damage & speeding draw unwanted attention.';
  $('map-status').textContent = g.stars ? 'PURSUIT' : 'LIVE'; $('garage').classList.toggle('near', g.garageNear);
  $('toast').textContent = g.toast; $('toast').className = `toast ${g.toastTime > 0 && g.mode === 'playing' ? 'visible' : ''} ${g.toastKind}`;
  $('pause').setAttribute('aria-label', g.mode === 'paused' ? 'Resume game' : 'Pause game');
  const damage = g.player.damage;
  $('critical-status').hidden = g.mode !== 'playing' || (g.onFoot ? damage.status !== 'burning' : damage.status === 'intact' && damage.critical.engine + damage.critical.fuel + damage.critical.tyres < 15);
  $('critical-status').classList.toggle('burning', damage.status === 'burning');
  $('condition').textContent = g.onFoot ? damage.status === 'burning' ? `ABANDONED ${vehicleName} · ${damage.fuse.toFixed(1)}s` : 'ON FOOT · FIND A PARKED RIDE' : damage.status === 'burning' ? `${vehicleName} ON FIRE · ${damage.fuse.toFixed(1)}s` : damage.status === 'wreck' ? `${vehicleName} DESTROYED` : bike && !motorcycleEngineWorks(damage) ? 'BIKE ENGINE STALLED' : 'COMPONENT DAMAGE';
  $('components').textContent = g.onFoot ? damage.status === 'burning' ? 'Run clear! The fire will still detonate.' : g.bikeTowable ? 'Motorbike will not start · R to tow & repair' : 'WASD / arrows to walk · E beside a car or bike' : damage.status === 'burning' ? 'E · BAIL OUT NOW, THEN RUN CLEAR. Pit Stop can extinguish fire before detonation.' : bike && !motorcycleEngineWorks(damage) ? 'Engine will not start · Repair or find another ride' : `ENGINE ${Math.round(damage.critical.engine)} · FUEL ${Math.round(damage.critical.fuel)} · TYRES ${Math.round(damage.critical.tyres)}`;
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
    $('critical-status').hidden = false; $('condition').textContent = g.portGateNear ? 'PORT SECURITY' : 'CONTAINER C-76'; $('components').textContent = g.harbourPrompt;
    $('interact').hidden = !g.portGateNear; $('interact').textContent = `Pay $${PORT_FEE}`; ($('interact') as HTMLButtonElement).disabled = false;
  }
  $('harbour').classList.toggle('near', g.navToHarbour || g.harbour.vehicleId === g.player.id);
  // Emergency and recovery instructions take priority on compact screens.
  refreshStory(g.mode === 'playing' && !g.onFoot && !g.player.sinking && $('critical-status').hidden && $('roadside').hidden);
  lab?.refreshUI();
  refreshAudioControls(audio);
  const muted = audio.preferences.muted;
  $('sound-toggle').setAttribute('aria-pressed', String(muted));
  $('sound-toggle').setAttribute('aria-label', muted ? 'Unmute sound FX' : 'Mute sound FX');
  $('sound-toggle').title = `${muted ? 'Unmute' : 'Mute'} FX · M`;
  $('sound-toggle').classList.toggle('sound-muted', muted);
}
function toggleSound() { audio.configure({ muted: !audio.preferences.muted }); void audio.unlock(); hud(); }
function realtime() { if (mapEditor?.active) mapEditor.api.live(); else lab?.realtime(); }
function interact() { if (game.mode !== 'playing') return; if (externalClock && lab) realtime(); externalClock = false; game.interact(); hud(); $('city').focus(); }
function tow() { if (game.mode !== 'playing' || !game.onFoot || !(game.player.damage.status === 'wreck' && dist(game.driver.position, game.player.body.position) < 6 || game.bikeTowable)) return; realtime(); externalClock = false; game.recover(); renderer.camera = { ...game.actor.position }; $('city').focus(); }
$('interact').addEventListener('click', interact); $('tow').addEventListener('click', tow);
$('sound-toggle').addEventListener('click', toggleSound);
// Lazy browser activation. Merely loading the page never creates an AudioContext.
document.addEventListener('pointerdown', event => { if (event.isTrusted) void audio.unlock(); }, { capture: true });
function pause() { if (game.mode === 'playing') { statsOpen = notebookOpen = false; game.setMode('paused'); } else if (game.mode === 'paused' || game.mode === 'garage') { realtime(); externalClock = false; helpOpen = false; statsOpen = notebookOpen = false; game.setMode('playing'); } }
bindFullscreen($('fullscreen'), message => game.notify(message));
$('harbour').addEventListener('click', () => { game.navigateHarbour(); hud(); });
$('pause').addEventListener('click', pause); $('garage').addEventListener('click', () => game.garage()); $('help').addEventListener('click', showHelp);
$('notebook-menu').addEventListener('click', openNotebook);
$('photo-menu').addEventListener('click', () => { setMenu(false); if (!game.photographCafe()) game.notify('Stop near Garden Café from shift 3 onward to bookmark its frontage.'); });
$('map-toggle').addEventListener('click', () => {
  const collapsed = !$('map-content').hidden;
  $('map-content').hidden = collapsed;
  $('map-toggle').setAttribute('aria-expanded', String(!collapsed));
  $('map-toggle').setAttribute('aria-label', collapsed ? 'Expand radar' : 'Collapse radar');
  document.querySelector('.map-panel')!.classList.toggle('collapsed', collapsed);
});
$('lab-button').addEventListener('click', () => { setMenu(false); if (game.mode === 'intro') game.start(); else if (game.mode === 'paused') game.setMode('playing'); ensureLab().toggle(); });
function setMenu(open: boolean) {
  $('taxi-menu').hidden = !open;
  $('taxi-menu-toggle').setAttribute('aria-expanded', String(open));
}
$('taxi-menu-toggle').addEventListener('click', () => setMenu($('taxi-menu').hidden));
document.addEventListener('pointerdown', event => { if (event.target instanceof Node && !$('taxi-menu').contains(event.target) && !$('taxi-menu-toggle').contains(event.target)) setMenu(false); });
$('taxi-menu').addEventListener('keydown', event => {
  const buttons = Array.from($('taxi-menu').querySelectorAll('button'));
  if (event.code === 'ArrowDown' || event.code === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(index + (event.code === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus(); }
});
document.addEventListener('contextmenu', event => { if (event.target instanceof Element && !event.target.closest('input, select, textarea, .audio-credits a')) event.preventDefault(); });
window.addEventListener('keydown', e => {
  if (mapEditor?.handleKey(e)) return;
  const target = e.target instanceof HTMLElement ? e.target : null;
  if (e.isTrusted && !e.repeat && !target?.closest('input, select, textarea')) void audio.unlock();
  if (e.code === 'Escape' && !$('taxi-menu').hidden) { e.preventDefault(); setMenu(false); $('taxi-menu-toggle').focus(); return; }
  if (e.code === 'F2') { e.preventDefault(); if (!e.repeat) { setMenu(false); if (game.mode === 'intro') game.start(); else if (game.mode === 'paused') game.setMode('playing'); ensureLab().toggle(); } return; }
  if (e.code === 'Space' && (game.mode === 'wasted' || game.mode === 'arrested') && !target?.closest('input, select, textarea')) {
    e.preventDefault(); if (!e.repeat) $('recover').click(); return;
  }
  // Preserve native keyboard activation for HUD buttons, including radar toggle.
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
let last = performance.now(), accumulator = 0, hudClock = 0, externalClock = dialoguePreviewMode, timeScale = 1;
const STEP = 1 / 120;
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (!externalClock) { accumulator += dt * timeScale; while (accumulator >= STEP) { game.update(STEP); accumulator -= STEP; } }
  audio.update(game, !externalClock, !document.hidden && document.hasFocus());
  if (!mapEditor?.editing) renderer.draw(dt);
  hudClock += dt; if (hudClock > 0.1) { hud(); hudClock = 0; }
  requestAnimationFrame(frame);
}
modal(); hud(); requestAnimationFrame(frame);

// The same test lab works in dev and the standalone HTML. Opt in via ?debug=1 or F2.
function ensureLab() {
  if (!mapEditor) mapEditor = new MapEditor(game, renderer, {
    clock: () => externalClock,
    freeze: frozen => { externalClock = frozen; accumulator = 0; },
    clearInput: () => { resetTouch(); game.keys.clear(); game.touchMove = null; game.controls = { throttle: 0, turn: 0, handbrake: false, boost: false }; },
    activate: active => { game = active; renderer.game = active; bindGame(); modal(); hud(); },
    silence: () => audio.silence(game),
  });
  if (!lab) lab = setupLab(game, renderer, {
    map: mapEditor.api,
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
    if (view === 'offer') $('texts-toggle').click();
    return { job: scene.job, state: scene.preview.state, context: scene.preview.context };
  },
});
