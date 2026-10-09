import './style.css';
import { Game, upgradeInfo, type Upgrade } from './game';
import { Renderer } from './renderer';
import { dist } from './physics';
import { district } from './world';
import { difficulties, type Difficulty } from './rules';
import { setupLab, type LabAPI } from './lab';
import { AudioFX } from './audio';
import { audioMarkup, bindAudioControls, refreshAudioControls } from './audio-controls';

const icons = {
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
    <a class="brand" href="#" aria-label="Fare City home"><span class="brand-icon">${icon('cab')}</span><span>FARE<span class="brand-light">CITY</span><small>THE STREETS ARE YOURS.</small></span></a>
    <div class="top-center"><span class="live-dot"></span> ON THE CLOCK <span class="divider">/</span><span id="district">OLD TOWN</span></div>
    <div class="hud-clock" id="hud-clock" role="timer" aria-label="World time 07:00, morning, day 1"><span class="hud-clock-icon" id="clock-sun">${icon('sun')}</span><span class="hud-clock-icon" id="clock-moon" hidden>${icon('moon')}</span><span class="hud-clock-text"><strong id="clock-time">07:00</strong><small id="clock-period">MORNING</small></span></div>
    <div class="top-actions"><div class="cash"><small>YOUR WALLET</small><strong id="cash">$80</strong></div><button id="sound-toggle" class="icon-button" title="Mute FX · M" aria-label="Mute sound FX" aria-pressed="false">${icon('sound')}</button><button id="pause" class="icon-button" title="Pause · P" aria-label="Pause game">${icon('pause')}</button></div>
  </header>
  <aside class="mission panel" aria-label="Current taxi job">
    <div class="eyebrow"><span id="job-label">YOUR FIRST FARE</span><span class="tiny-tag" id="job-status">PICKUP</span></div>
    <div class="mission-heading"><span class="mission-icon">${icon('target')}</span><h1 id="mission-title">Meet Mia.</h1></div>
    <p id="mission-description">A customer is waiting just up the street.</p>
    <div class="mission-data"><div><small>BASE FARE</small><strong id="fare">$83 <span>+ tips</span></strong></div><div><small id="distance-label">TO PICKUP</small><strong id="distance">18 <span>m</span></strong></div></div>
    <div class="mission-footer" id="mission-footer"><span class="ring-dot"></span> Stop inside the yellow ring to pick up.</div>
    <div class="job-progress"><i id="job-progress"></i></div>
  </aside>
  <div class="heat-panel panel" id="heat-panel"><div class="heat-top"><span id="heat-title">KEEP IT CLEAN</span><span id="stars">☆ ☆ ☆</span></div><div class="heat-track"><i id="heat-fill"></i></div><small id="heat-description">A little mischief goes a long way.</small></div>
  <div class="world-tag"><span class="live-dot"></span> A LIVING, BREAKABLE CITY <span id="world-mode">STREET / DAY SHIFT</span></div>
  <section class="dashboard panel" aria-label="Cab condition"><div class="speed"><strong id="speed">00</strong><span>MPH<small id="gear">IDLE</small></span></div><div class="cab-meters"><div><span>CHASSIS</span><div class="meter"><i id="health-bar"></i></div><b id="health">100%</b></div><div><span>BOOST <kbd>⇧</kbd></span><div class="meter"><i id="boost-bar"></i></div><b id="boost">100%</b></div></div><div class="dashboard-footer"><span id="deliveries">0 fares this shift</span><span id="earnings">+$0 earned</span></div></section>
  <div class="critical-status panel" id="critical-status" hidden><strong id="condition">ENGINE DAMAGE</strong><span id="components"></span><button id="interact" class="escape-button">E · Get out</button></div>
  <section id="roadside" class="roadside panel" role="status" hidden><strong>CAB DESTROYED</strong><p>The wreck stays here. Walk to a parked car and keep your shift going.</p><div><button id="wreck-exit">E · Get out</button><button id="tow">R · Tow & repair</button></div><small id="tow-price"></small></section>
  <div class="toast" id="toast" role="status"></div>
  <aside class="map-panel panel"><div class="eyebrow"><span>CITY RADAR</span><span id="map-status">LIVE</span></div><canvas id="map" aria-label="Minimap: yellow is your taxi, circle is your destination, blue square is the garage, red dots are police"></canvas><button id="garage" class="garage-button">${icon('wrench')}<span>Pit Stop garage</span><kbd>G</kbd></button></aside>
  <footer class="controls"><span><kbd>W A S D</kbd> / <kbd>↑ ← ↓ →</kbd> DRIVE / WALK</span><span><kbd>SPACE</kbd> DRIFT</span><span><kbd>SHIFT</kbd> BOOST</span><span><kbd>E</kbd> EXIT / ENTER</span><span><kbd>G</kbd> GARAGE</span><span><kbd>P</kbd> PAUSE</span><button id="help">HOW TO PLAY <span>↗</span></button><button id="lab-button">TEST LAB <kbd>F2</kbd></button></footer>
  <div class="touch-controls" aria-label="Touch driving controls"><div><button data-key="left" aria-label="Steer left">←</button><button data-key="right" aria-label="Steer right">→</button></div><div><button data-key="handbrake">DRIFT</button><button data-key="boost">BOOST</button><button data-key="down" aria-label="Brake and reverse">↓</button><button data-key="up" aria-label="Accelerate">↑</button></div></div>
  <div class="modal-backdrop" id="overlay"><section class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"></section></div>
  <div class="debug-panel" id="debug-panel" hidden></div>
`;
const game = new Game();
const audio = new AudioFX();
const renderer = new Renderer($('city') as HTMLCanvasElement, $('map') as HTMLCanvasElement, game);
let helpOpen = false;
let lab: LabAPI | undefined;
function settingsMarkup() {
  return `<div class="play-options"><label><input id="gore-option" type="checkbox" ${game.settings.gore ? 'checked' : ''}> Pulp gore <span>Fatal impacts & blood</span></label><label>Difficulty <select id="difficulty-option" aria-label="Gameplay difficulty">${(Object.entries(difficulties) as [Difficulty, typeof difficulties.standard][]).map(([key, value]) => `<option value="${key}" ${game.settings.difficulty === key ? 'selected' : ''}>${value.name}</option>`).join('')}</select></label></div>${audioMarkup(audio)}`;
}
function introduction(help = false) {
  return `<div class="intro-eyebrow"><span class="live-dot"></span> WELCOME TO FARE CITY</div><div class="intro-cab">${icon('cab')}</div><h2 id="modal-title">A little cab.<br><em>A lot of trouble.</em></h2><p class="intro-copy">Pick up. Drop off. Get paid.<br>How you get there is entirely your business.</p><div class="intro-grid"><div><span>01</span><strong>Chase the fare.</strong><p>Stop in the yellow ring. Deliver to green. Fast, smooth rides earn bigger tips.</p></div><div><span>02</span><strong>Make your own route.</strong><p>Drift corners. Smash crates, kiosks and hydrants. Buildings bite back.</p></div><div><span>03</span><strong>Stay one step ahead.</strong><p>Damage and speeding attract cops. Break line of sight to escape. Or pay the bail.</p></div></div><div class="intro-controls"><kbd>WASD / ARROWS</kbd> drive <kbd>SPACE</kbd> handbrake <kbd>SHIFT</kbd> boost</div><button class="primary" id="start">${help ? 'Back to the streets' : 'Start your shift'} ${icon('arrow')}</button><div class="intro-note">No fuel stops. No time-outs. Just one more fare.<br><span>Physics foundation: Pat Kerr's Motion Lab · Built for the joy of driving.</span></div>`;
}
function modal() {
  const overlay = $('overlay'), card = $('modal'); overlay.hidden = game.mode === 'playing' || game.mode === 'wrecked';
  card.className = `modal ${game.mode === 'garage' ? 'garage-modal' : ''}`;
  if (game.mode === 'intro' || helpOpen) card.innerHTML = introduction(helpOpen).replace('<button class="primary"', `${settingsMarkup()}<button class="primary"`);
  else if (game.mode === 'paused') card.innerHTML = `<div class="eyebrow">OFF THE CLOCK</div><h2 id="modal-title">Take a breather.</h2><p>The city can wait a minute.</p><div class="pause-stats"><div><small>SHIFT EARNINGS</small><strong>$${game.shiftEarnings}</strong></div><div><small>FARES COMPLETE</small><strong>${game.jobsDone}</strong></div><div><small>OBJECTS SMASHED</small><strong>${game.smashed}</strong></div></div><button class="primary" id="resume">Back to the streets ${icon('arrow')}</button><button class="secondary" id="show-help">How to play</button>`;
  else if (game.mode === 'garage') {
    const upgrades = (Object.entries(upgradeInfo) as [Upgrade, typeof upgradeInfo.engine][]).map(([key, u]) => { const level = game.save.upgrades[key], price = game.price(key); return `<div class="upgrade"><div><span class="upgrade-number">0${Object.keys(upgradeInfo).indexOf(key) + 1}</span><h3>${u.name}</h3><p>${u.subtitle}</p><small>${u.detail}</small><div class="level">${[1, 2, 3].map(i => `<i class="${i <= level ? 'filled' : ''}"></i>`).join('')}<span>LEVEL ${level} / 3</span></div></div><button class="buy" data-upgrade="${key}" ${level >= 3 || game.save.cash < price ? 'disabled' : ''}>${level >= 3 ? 'MAXED' : `$${price}`}</button></div>`; }).join('');
    const repairPrice = game.repairPrice;
    card.innerHTML = `<div class="eyebrow">OLD TOWN / TUNING & REPAIRS <span class="garage-wallet">$${game.save.cash}</span></div><h2 id="modal-title">Pit Stop.</h2><p>Good drivers invest in bad decisions.</p><div class="upgrades">${upgrades}</div><div class="repair"><div><strong>Patch it up</strong><small>Restore your chassis to 100%.</small></div><button class="buy" id="repair" ${repairPrice === 0 || game.save.cash < repairPrice ? 'disabled' : ''}>${repairPrice === 0 ? 'ALL GOOD' : `$${repairPrice}`}</button></div><button class="primary" id="resume">Back to the streets ${icon('arrow')}</button>`;
  } else if (game.mode === 'arrested') {
    const fee = Math.min(game.save.cash, 75 + game.stars * 45);
    card.innerHTML = `<div class="eyebrow danger">BUSTED / CITY POLICE</div><h2 id="modal-title">End of the chase.</h2><p>They caught the cab. They couldn’t catch the spirit.</p><div class="bill"><span>BAIL & IMPOUND</span><strong>$${fee}</strong><small>Cab repaired. Boost refilled. Fresh start in Old Town.</small></div><button class="primary" id="recover">Pay bail & get back out ${icon('arrow')}</button>`;
  }
  if (game.mode === 'paused' && !helpOpen) card.innerHTML = card.innerHTML.replace('<button class="primary"', `${settingsMarkup()}<button class="primary"`);
  if (game.mode === 'intro' || helpOpen) card.innerHTML = card.innerHTML.replace('Buildings bite back.', 'Buildings bite back. Hold W + Shift for a nitro burst.').replace('Or pay the bail.', 'Or pay the bail. Cab on fire? Press E to get out, run clear with WASD, then E beside a parked car to get in.');
  $('start')?.addEventListener('click', () => { lab?.realtime(); externalClock = false; helpOpen = false; if (game.mode === 'intro') game.start(); else game.setMode('playing'); $('city').focus(); });
  $('resume')?.addEventListener('click', () => { lab?.realtime(); externalClock = false; game.setMode('playing'); $('city').focus(); });
  $('recover')?.addEventListener('click', () => { lab?.realtime(); externalClock = false; game.recover(); renderer.camera = { ...game.player.body.position }; $('city').focus(); });
  $('gore-option')?.addEventListener('change', e => game.configure({ gore: (e.target as HTMLInputElement).checked }));
  $('difficulty-option')?.addEventListener('change', e => game.configure({ difficulty: (e.target as HTMLSelectElement).value as Difficulty }));
  $('show-help')?.addEventListener('click', showHelp);
  $('repair')?.addEventListener('click', () => game.repair());
  document.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach(button => button.addEventListener('click', () => game.buy(button.dataset.upgrade as Upgrade)));
  bindAudioControls(card, audio);
  if (!overlay.hidden) (card.querySelector('button:not(:disabled)') as HTMLButtonElement | null)?.focus();
}
function showHelp() { helpOpen = true; game.setMode('paused'); }
game.onModeChange = () => { modal(); hud(); }; game.onChange = () => { modal(); hud(); };
function hud() {
  const g = game, job = g.job, pickup = job.stage === 'pickup', speed = Math.round(g.speed * 2.237);
  const dayNight = g.dayNight.snapshot(), night = dayNight.period === 'night';
  $('clock-time').textContent = dayNight.time; $('clock-period').textContent = dayNight.period.toUpperCase();
  $('hud-clock').setAttribute('aria-label', `World time ${dayNight.time}, ${dayNight.period}, day ${dayNight.day}`);
  $('clock-sun').hidden = night; $('clock-moon').hidden = !night;
  $('cash').textContent = `$${g.save.cash.toLocaleString()}`; $('district').textContent = district(g.actor.position);
  $('job-label').textContent = g.jobsDone === 0 && pickup ? 'YOUR FIRST FARE' : `FARE ${String(g.jobsDone + 1).padStart(2, '0')} / ${pickup ? 'CUSTOMER WAITING' : 'PASSENGER ON BOARD'}`;
  $('job-status').textContent = pickup ? 'PICKUP' : 'ON BOARD'; $('job-status').classList.toggle('green', !pickup);
  $('mission-title').textContent = pickup ? `Meet ${job.name}.` : `${job.destination}.`;
  $('mission-description').textContent = pickup ? `${job.name} needs a lift. Follow the yellow route.` : `${job.name} is riding with you. Make it a good one.`;
  $('fare').innerHTML = `$${job.fare} <span>+ tips</span>`; $('distance-label').textContent = pickup ? 'TO PICKUP' : 'TO DROP-OFF'; $('distance').innerHTML = `${Math.round(dist(g.actor.position, g.target))} <span>m</span>`;
  $('mission-footer').innerHTML = pickup ? '<span class="ring-dot"></span> Stop in the yellow ring to pick up.' : `<span class="ring-dot green"></span> ${job.elapsed < job.time ? `FAST TIP · ${Math.ceil(job.time - job.elapsed)}s` : 'NO RUSH · Still earning your base fare'} <span class="comfort">${Math.round(job.comfort)}% comfort</span>`;
  $('job-progress').style.width = `${job.wait / 0.8 * 100}%`; $('job-progress').style.background = pickup ? '#f7ce55' : '#a3ddc2';
  if (g.navToGarage) { $('job-label').textContent = 'TUNING & REPAIRS'; $('job-status').textContent = 'GARAGE'; $('mission-title').textContent = 'Pit Stop.'; $('mission-description').textContent = 'Follow the blue route back to Old Town.'; $('distance-label').textContent = 'TO GARAGE'; $('mission-footer').innerHTML = '<span class="ring-dot"></span> Stop at Pit Stop, then press G to enter.'; }
  if (g.onFoot) { $('job-label').textContent = 'KEEP YOUR SHIFT GOING'; $('job-status').textContent = 'ON FOOT'; $('mission-title').textContent = 'Find a ride.'; $('mission-description').textContent = 'Walk with WASD / arrows. Blue cars on the radar are available.'; $('distance-label').textContent = 'TO NEXT CAR'; $('mission-footer').textContent = g.enterableCar ? 'Press E to get in. Wallet & upgrades carry over.' : 'Follow the blue route. Press E beside a parked car.'; }
  $('speed').textContent = String(speed).padStart(2, '0'); $('gear').textContent = g.onFoot ? 'ON FOOT' : g.player.damage.status === 'wreck' ? 'CAB DOWN' : g.controls.boost ? 'NITRO ACTIVE' : g.controls.handbrake ? 'SLIDING' : speed < 2 ? 'IDLE' : g.controls.throttle < 0 ? 'BRAKING' : 'ON THE MOVE';
  document.querySelector('.dashboard')!.classList.toggle('boosting', !!g.controls.boost);
  $('health').textContent = `${Math.ceil(g.health)}%`; $('health-bar').style.width = `${g.health}%`; $('health-bar').style.background = g.health < 30 ? '#ee8675' : '#a3ddc2';
  $('boost').textContent = `${Math.round(g.boost)}%`; $('boost-bar').style.width = `${g.boost}%`;
  $('deliveries').textContent = `${g.jobsDone} fare${g.jobsDone === 1 ? '' : 's'} this shift`; $('earnings').textContent = `+$${g.shiftEarnings} earned`;
  $('stars').textContent = [0, 1, 2].map(i => i < g.stars ? '★' : '☆').join(' '); $('heat-panel').classList.toggle('wanted', g.stars > 0);
  $('heat-title').textContent = g.arrest > 0 ? 'GET MOVING!' : g.stars > 0 ? (g.escape > 0 ? 'LOSING THEM…' : 'POLICE PURSUIT') : g.heat > 5 ? 'MAKING A SCENE' : 'KEEP IT CLEAN';
  $('heat-fill').style.width = `${g.stars && g.escape ? (1 - g.escape / g.rules.escapeTime) * 100 : g.heat}%`;
  $('heat-description').textContent = g.arrest > 0 ? `Arrest in ${(g.rules.arrestTime - g.arrest).toFixed(1)}s. Drive!` : g.stars > 0 ? (g.escape > 0 ? `Stay out of sight for ${Math.ceil(g.rules.escapeTime - g.escape)}s to escape.` : 'Break line of sight. Police use shared sightings.') : 'Damage & speeding draw unwanted attention.';
  $('map-status').textContent = g.stars ? 'PURSUIT' : 'LIVE'; $('garage').classList.toggle('near', g.garageNear);
  $('toast').textContent = g.toast; $('toast').className = `toast ${g.toastTime > 0 && g.mode === 'playing' ? 'visible' : ''} ${g.toastKind}`;
  $('pause').setAttribute('aria-label', g.mode === 'paused' ? 'Resume game' : 'Pause game');
  const damage = g.player.damage;
  $('critical-status').hidden = g.mode === 'wrecked' || !g.onFoot && damage.status === 'intact' && damage.critical.engine + damage.critical.fuel + damage.critical.tyres < 15;
  $('critical-status').classList.toggle('burning', damage.status === 'burning');
  $('condition').textContent = g.onFoot ? damage.status === 'burning' ? `ABANDONED CAB · ${damage.fuse.toFixed(1)}s` : 'ON FOOT · FIND A PARKED CAR' : damage.status === 'burning' ? `CAB ON FIRE · ${damage.fuse.toFixed(1)}s` : damage.status === 'wreck' ? 'CAB DESTROYED' : 'COMPONENT DAMAGE';
  $('components').textContent = g.onFoot ? damage.status === 'burning' ? 'Run clear! The fire will still detonate.' : 'WASD / arrows to walk · E beside a car' : damage.status === 'burning' ? 'E · BAIL OUT NOW, THEN RUN CLEAR. Pit Stop can extinguish fire before detonation.' : `ENGINE ${Math.round(damage.critical.engine)} · FUEL ${Math.round(damage.critical.fuel)} · TYRES ${Math.round(damage.critical.tyres)}`;
  $('interact').textContent = g.onFoot ? 'E · Get in' : 'E · Bail out'; ($('interact') as HTMLButtonElement).disabled = g.onFoot && !g.enterableCar;
  $('interact').hidden = !g.onFoot && damage.status !== 'burning';
  const wreck = damage.status === 'wreck' && (g.mode === 'wrecked' || g.onFoot && g.mode === 'playing');
  $('roadside').hidden = !wreck || g.time - g.player.wreckAt < 0.65;
  $('wreck-exit').hidden = g.onFoot; ($('tow') as HTMLButtonElement).disabled = g.time - g.player.wreckAt < 1.2;
  $('tow-price').textContent = `Optional tow & repair: $${Math.min(g.save.cash, 60)} · or take another car for free`;
  $('world-mode').textContent = g.settings.gore ? `PULP MODE / ${g.kills} DOWN` : `${g.rules.name.toUpperCase()} / ${dayNight.period.toUpperCase()} SHIFT`;
  lab?.refreshUI();
  refreshAudioControls(audio);
  const muted = audio.preferences.muted;
  $('sound-toggle').setAttribute('aria-pressed', String(muted));
  $('sound-toggle').setAttribute('aria-label', muted ? 'Unmute sound FX' : 'Mute sound FX');
  $('sound-toggle').title = `${muted ? 'Unmute' : 'Mute'} FX · M`;
  $('sound-toggle').classList.toggle('sound-muted', muted);
}
function toggleSound() { audio.configure({ muted: !audio.preferences.muted }); void audio.unlock(); hud(); }
function interact() { if (externalClock && lab) lab.realtime(); externalClock = false; game.interact(); hud(); $('city').focus(); }
function tow() { if (game.mode !== 'wrecked' && !(game.onFoot && game.player.damage.status === 'wreck')) return; lab?.realtime(); externalClock = false; game.recover(); renderer.camera = { ...game.actor.position }; $('city').focus(); }
$('interact').addEventListener('click', interact); $('wreck-exit').addEventListener('click', interact); $('tow').addEventListener('click', tow);
$('sound-toggle').addEventListener('click', toggleSound);
// Lazy browser activation. Merely loading the page never creates an AudioContext.
document.addEventListener('pointerdown', event => { if (event.isTrusted) void audio.unlock(); }, { capture: true });
function pause() { if (game.mode === 'playing') game.setMode('paused'); else if (game.mode === 'paused' || game.mode === 'garage') { lab?.realtime(); externalClock = false; helpOpen = false; game.setMode('playing'); } }
$('pause').addEventListener('click', pause); $('garage').addEventListener('click', () => game.garage()); $('help').addEventListener('click', showHelp);
$('lab-button').addEventListener('click', () => { if (game.mode === 'intro') game.start(); else if (game.mode === 'paused') game.setMode('playing'); ensureLab().toggle(); });
document.querySelector('.brand')!.addEventListener('click', e => { e.preventDefault(); showHelp(); });
window.addEventListener('keydown', e => {
  const target = e.target instanceof HTMLElement ? e.target : null;
  if (e.isTrusted && !e.repeat && !target?.closest('input, select, textarea')) void audio.unlock();
  if (e.code === 'F2') { e.preventDefault(); if (!e.repeat) { if (game.mode === 'intro') game.start(); else if (game.mode === 'paused') game.setMode('playing'); ensureLab().toggle(); } return; }
  if (e.code !== 'Tab' && target?.closest('input, select, textarea')) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code) && e.code !== 'Tab') e.preventDefault();
   if (e.code === 'Tab' && game.mode !== 'playing' && game.mode !== 'wrecked' && !target?.closest('#debug-panel')) { const buttons = Array.from($('modal').querySelectorAll<HTMLElement>('button:not(:disabled),input,select')); const current = buttons.indexOf(document.activeElement as HTMLElement); if (buttons.length) { e.preventDefault(); buttons[(current + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus(); } }
    if (!e.repeat) { if (e.code === 'KeyP' || e.code === 'Escape') pause(); if (e.code === 'KeyG') game.garage(); if (e.code === 'KeyM') toggleSound(); if (e.code === 'KeyE') interact(); if (e.code === 'KeyR') tow(); }
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { if (externalClock && lab) lab.realtime(); externalClock = false; }
  if (game.mode === 'playing') game.keys.add(e.code);
});
window.addEventListener('keyup', e => game.keys.delete(e.code));
window.addEventListener('blur', () => { audio.silence(game); game.keys.clear(); if (game.mode === 'playing') game.setMode('paused'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { audio.silence(game); if (game.mode === 'playing') game.setMode('paused'); } });
document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button => {
  button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); game.keys.add(button.dataset.key!); button.classList.add('pressed'); });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => { game.keys.delete(button.dataset.key!); button.classList.remove('pressed'); });
});
let last = performance.now(), accumulator = 0, hudClock = 0, externalClock = false, timeScale = 1;
const STEP = 1 / 120;
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (!externalClock) { accumulator += dt * timeScale; while (accumulator >= STEP) { game.update(STEP); accumulator -= STEP; } }
  audio.update(game, !externalClock, !document.hidden && document.hasFocus());
  renderer.draw(dt);
  hudClock += dt; if (hudClock > 0.1) { hud(); hudClock = 0; }
  requestAnimationFrame(frame);
}
modal(); hud(); requestAnimationFrame(frame);

// The same test lab works in dev and the standalone HTML. Opt in via ?debug=1 or F2.
function ensureLab() {
  if (!lab) lab = setupLab(game, renderer, {
    setExternalClock: frozen => { externalClock = frozen; accumulator = 0; if (frozen) audio.silence(game); },
    setTimeScale: scale => { timeScale = scale; },
    refresh: () => { hud(); renderer.draw(1 / 60); },
    focus: () => $('city').focus(),
    audio,
  });
  return lab;
}
if (new URLSearchParams(location.search).has('debug')) { ensureLab().open(); game.start(); }
