import type { Game } from './game';
import { calendarLabel } from './campaign/clock';
import { formatClock } from './day-night';
import { navigationHudState } from './navigation-hud';
import { district } from './world';

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = (value: number) => `$${value.toLocaleString('en-US')}`;

/** Read-only projection of the live job, actor and authoritative navigation. */
export function pauseDashboardMarkup(game: Game, nav = navigationHudState(game)) {
  const job = game.job, pickup = job.stage === 'pickup', parcel = job.type === 'parcel';
  const mission = job.missionId ? game.missions.mission(job.missionId) : undefined;
  const target = pickup ? job.pickup : job.dropoff;
  const bike = game.player.model === 'motorcycle';
  const remaining = Math.max(0, Math.ceil(job.time - job.elapsed));
  const clock = game.campaignEnabled ? calendarLabel(game.save.campaign.minute) : formatClock(game.dayNight.snapshot().minutes);
  const vehicle = bike ? 'Motorbike' : game.player.model === 'pickup' ? 'Pickup' : 'Cab';
  const status = game.player.damage.status;
  const controls = game.onFoot
    ? [['WASD / ↑←↓→', 'Walk'], ['E', 'Enter / lift nearby vehicle'], ['R', 'Tow & repair nearby wreck']]
    : [['W / ↑', 'Accelerate'], ['S / ↓', 'Brake / reverse'], ['A D / ← →', 'Steer'], ['SPACE', bike ? 'Rear brake' : 'Handbrake / drift'], ['SHIFT', 'Boost'], ['E', bike ? 'Dismount / jump off' : 'Exit / bail out']];
  return `<header class="pause-heading"><div><span class="pause-label"><span class="live-dot"></span> OFF THE CLOCK</span><h2 id="modal-title">Paused.</h2></div><div class="pause-time"><strong>${escape(clock)}</strong><span>${escape(district(game.actor.position, game.map))}</span></div></header>
  <div class="pause-grid">
    <nav class="pause-actions" aria-label="Pause actions">
      <button class="primary" id="resume">Resume <span aria-hidden="true">→</span></button>
      <span class="pause-key-hint"><kbd>ESC</kbd> / <kbd>P</kbd> back to the streets</span>
      <div class="pause-links">
      <button class="pause-action" id="show-messages">Text messages <span aria-hidden="true">↗</span></button>
      ${game.campaignEnabled ? '<button class="pause-action" id="open-notebook">Dispatch notebook <span aria-hidden="true">↗</span></button>' : ''}
      <button class="pause-action" id="show-settings">Settings <span aria-hidden="true">↗</span></button>
      <button class="pause-action" id="show-stats">Shift stats <span aria-hidden="true">↗</span></button>
      <button class="pause-action" id="show-help">How to play <span aria-hidden="true">↗</span></button>
      </div>
      <div class="pause-session-actions">
        <button class="pause-action" id="pause-fullscreen">Fullscreen <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/></svg></button><small id="fullscreen-status" role="status"></small>
        ${game.campaignEnabled && !game.save.campaign.finished ? `<button class="pause-action" id="sleep" ${game.sleepReason ? 'disabled' : ''} title="${escape(game.sleepReason ?? `Wake ${game.sleepPreview.label}`)}">Sleep until morning <span aria-hidden="true">↗</span></button>${game.sleepReason ? `<small>${escape(game.sleepReason)}</small>` : ''}${!game.garageNear ? '<button class="pause-action" id="sleep-route">Route to Pit Stop <span aria-hidden="true">→</span></button>' : ''}` : ''}
        <button class="pause-action pause-risk" id="${pickup ? 'ordinary-fare' : 'abandon-ride'}">${pickup ? 'Request another fare' : 'Abandon this ride'} <span aria-hidden="true">↗</span></button>
      </div>
    </nav>
    <section class="pause-objective" aria-labelledby="pause-objective-title">
      <div class="pause-section-label">${pickup ? 'CURRENT DISPATCH' : parcel ? 'PARCEL ON BOARD' : 'PASSENGER ON BOARD'}<span>${pickup ? 'PICKUP' : 'DROPOFF'}</span></div>
      <h3 id="pause-objective-title">${escape(mission?.title ?? (pickup ? `Meet ${job.name}.` : job.destination))}</h3>
      <p>${escape(pickup ? parcel ? `Collect ${job.name}'s parcel, then deliver to ${job.destination}.` : `Pick up ${job.name}, then head to ${job.destination}.` : parcel ? `Deliver ${job.name}'s parcel to ${job.destination}.` : `Take ${job.name} to ${job.destination}.`)}</p>
      <dl class="pause-job-data"><div><dt>BASE FARE</dt><dd>${money(job.fare)}</dd></div><div><dt>${pickup ? 'FARE DISTANCE' : 'FAST TIP WINDOW'}</dt><dd>${pickup ? `${Math.round(Math.hypot(target.x - game.actor.position.x, target.y - game.actor.position.y))} m` : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}</dd></div>${!pickup ? `<div><dt>COMFORT</dt><dd>${Math.round(job.comfort)}%</dd></div>` : ''}</dl>
      <div class="pause-location"><div><span class="pause-section-label">${nav.vacant ? 'DISPATCH AVAILABLE' : 'ACTIVE GUIDANCE'}</span><strong>${escape(nav.vacant ? 'Choose your next fare.' : nav.title)}</strong><small>${nav.vacant ? 'Browse dispatch or text messages.' : `${nav.distance} m · ${Math.round(game.target.x)}, ${Math.round(game.target.y)}`}</small></div><div id="pause-map-slot" aria-label="Frozen local navigation"></div></div>
      <div class="pause-coordinates"><span>YOUR POSITION</span><strong>${Math.round(game.actor.position.x)}, ${Math.round(game.actor.position.y)}</strong></div>
    </section>
    <aside class="pause-reference" aria-labelledby="pause-controls-title">
      <span class="pause-section-label">QUICK REFERENCE</span><h3 id="pause-controls-title">${game.onFoot ? 'On foot.' : bike ? 'On the bike.' : 'At the wheel.'}</h3>
      <dl class="pause-keyboard">${controls.map(([key, label]) => `<div><dt><kbd>${key}</kbd></dt><dd>${label}</dd></div>`).join('')}${!game.onFoot ? '<div><dt><kbd>G</kbd></dt><dd>Garage / route to Pit Stop</dd></div><div><dt><kbd>H</kbd></dt><dd>Route to harbour</dd></div>' : ''}<div><dt><kbd>M</kbd></dt><dd>Mute sound FX</dd></div></dl>
      <dl class="pause-touch"><div><dt>JOYSTICK</dt><dd>${game.onFoot ? 'Drag in the direction to walk' : 'Up: accelerate · down: brake / reverse · left / right: steer'}</dd></div>${!game.onFoot ? `<div><dt>${bike ? 'BRAKE' : 'DRIFT'}</dt><dd>Hold ${bike ? 'rear brake' : 'handbrake'}</dd></div><div><dt>BOOST</dt><dd>Hold while accelerating</dd></div>` : ''}<div><dt>ACTION</dt><dd>Tap the contextual button to ${game.onFoot ? 'enter a nearby ride' : 'get out / bail out'}</dd></div><div><dt>PAUSE</dt><dd>Tap Pause at the bottom of the screen</dd></div></dl>
      <small class="pause-frozen-note">The city, fare timer and vehicle are frozen.</small>
    </aside>
  <footer class="pause-status"><div><span>CASH</span><strong>${money(game.save.cash)}</strong></div><div><span>${game.onFoot ? 'PARKED VEHICLE' : 'VEHICLE'}</span><strong>${vehicle} · ${Math.round(game.player.damage.health)}%${status === 'burning' ? ' · Burning' : status === 'wreck' ? ' · Wrecked' : ''}</strong></div><div class="${game.stars ? 'pause-risk' : ''}"><span>CITY HEAT</span><strong aria-label="${game.stars} of 3 wanted stars">${'★'.repeat(game.stars)}${'☆'.repeat(3 - game.stars)}</strong></div><div><span>${game.onFoot ? 'YOUR HEALTH' : 'BOOST TANK'}</span><strong>${Math.round(game.onFoot ? game.driverHealth : game.boost)}%</strong></div></footer>
  </div>
  ${game.campaignEnabled ? `<details class="pause-bulletin"><summary>${escape(game.campaignContent.title)} · City briefing</summary><p>${escape(game.campaignBulletin)}</p></details>` : ''}`;
}
