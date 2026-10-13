import type { Game } from './game';
import { dist } from './physics';
import { calendarLabel } from './campaign/clock';
import { PORT_FEE } from './harbour';
import { characters } from './characters';
import { showCharacterPortrait } from './story-view';

// Original, embedded line artwork; reference mock-up assets are not used.
const paths = {
  pin: '<path d="M18 10c0 5-6 11-6 11S6 15 6 10a6 6 0 1 1 12 0Z"/><circle cx="12" cy="10" r="2"/>',
  news: '<path d="M4 5h13v15H4zM17 9h3v11H7M7 9h7M7 13h7M7 17h4"/>',
  notebook: '<path d="M6 3h14v18H6zM3 7h5M3 12h5M3 17h5M11 7h5M11 11h5M11 15h3"/>',
  camera: '<path d="M3 7h5l2-3h4l2 3h5v13H3z"/><circle cx="12" cy="13" r="4"/>',
  boost: '<path d="m14 2-9 12h6l-1 8 9-13h-6z"/>',
};
const icon = (name: keyof typeof paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;

export const navigationHudMarkup = `<aside class="navigation-hud panel" aria-label="Taxi navigation and status">
  <header class="navigation-header">
    <div id="navigation-destination"><span class="navigation-pin">${icon('pin')}</span><div><h1 id="mission-title">Meet Mia.</h1><p id="distance"></p></div></div>
    <div id="navigation-contacts" hidden>
      <button id="dispatch" title="Dispatch · route the next fare" aria-label="Dispatch: route the next fare"><span class="story-portrait"><img id="dispatch-portrait" alt=""></span></button>
      <button id="texts" title="Bookings · read text messages" aria-label="Bookings: read text messages"><span class="story-portrait"><img id="bookings-portrait" alt=""></span></button>
      <button id="newsroom" title="Route to the newsroom" aria-label="Route to the newsroom">${icon('news')}</button>
    </div>
    <button id="job-status" class="taxi-state" title="Clear fare guidance and browse dispatch">ENGAGED</button>
  </header>
  <div class="navigation-chart"><div id="map-content"><canvas id="map" aria-label="Local minimap: yellow is your taxi, circles or edge arrows are destinations, blue squares are the garage or parked rides, red dots are police"></canvas></div><button id="map-toggle" class="map-toggle" aria-expanded="true" aria-controls="map-content" aria-label="Collapse navigation map"><span id="map-status">LIVE</span><span class="map-chevron" aria-hidden="true">⌄</span></button></div>
  <p id="mission-description" class="navigation-instruction"></p>
  <div class="job-progress"><i id="job-progress"></i></div>
  <footer class="navigation-footer">
    <div id="navigation-fare"><small id="fare-label">BASE FARE</small><strong id="fare"></strong><div id="ride-bonuses"><span id="fast-tip"></span><span id="comfort"></span></div></div>
    <div id="navigation-tools" hidden><button id="notebook" title="Dispatch notebook" aria-label="Open Dispatch notebook">${icon('notebook')}</button><button id="photo" title="Bookmark café frontage" aria-label="Bookmark café frontage">${icon('camera')}</button></div>
    <div class="navigation-speed"><div id="boost-meter" class="navigation-boost" role="meter" aria-label="Boost reserve" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i id="boost-bar"></i>${icon('boost')}</div><div><strong id="speed">0</strong><small id="speed-unit">MPH</small></div></div>
  </footer>
  <div class="navigation-services"><button id="garage">Pit Stop <kbd>G</kbd></button><button id="harbour">Harbour · $75 <kbd>H</kbd></button></div>
</aside>`;

/** View-only state: dispatch, physics, pickups and the saved game remain authoritative. */
export function navigationHudState(g: Game, fareRouted = true) {
  const job = g.job, pickup = job.stage === 'pickup', parcel = job.type === 'parcel';
  const harbour = !g.onFoot && (g.navToHarbour || g.harbour.vehicleId === g.player.id);
  const detour = g.navToGarage || g.navToNewsroom || harbour;
  const vacant = pickup && !fareRouted && !detour && !g.onFoot;
  let status = pickup ? 'ENGAGED' : 'ON BOARD';
  let title = pickup ? parcel ? `Collect ${job.name}'s parcel.` : `Meet ${job.name}.` : `${job.destination}.`;
  let instruction = pickup ? parcel ? 'Stop in yellow to collect the parcel.' : 'Stop in yellow to pick up.' : 'Stop in green to deliver.';
  if (pickup && job.missionId && g.campaignContent.jobWindows[job.missionId]) instruction += ` Pickup before ${calendarLabel(g.campaignContent.jobWindows[job.missionId].until)}.`;
  if (parcel && !pickup) status = 'LOADED';
  if (g.navToGarage) { title = 'Pit Stop.'; instruction = 'Stop at Pit Stop, then press G to enter.'; }
  if (g.navToNewsroom) { title = `Newsroom · ${g.campaignContent.newsroom.name}`; instruction = 'Stop nearby · Open Notebook to leave copies.'; }
  if (harbour) {
    const admitted = g.harbour.vehicleId === g.player.id;
    title = admitted ? g.harbour.exchanged ? 'Take the exit.' : 'Container C-76.' : g.policeVisible ? 'Lose the tail.' : g.portGateNear ? 'Pay security.' : 'Northstar Harbour.';
    instruction = g.harbourPrompt ?? (admitted ? g.harbour.exchanged ? 'Fresh car ready · follow cyan to the exit.' : 'Stop fully inside container C-76, out of police sight.' : `Follow cyan · Entry and car swap $${PORT_FEE}.`);
  }
  if (g.onFoot) {
    status = 'ON FOOT'; title = g.tumble ? 'Brace for impact.' : 'Find a ride.';
    instruction = g.tumble ? 'Recover from the roll before taking another ride.' : g.enterableCar ? 'E / action button to take this ride.' : 'Walk to a blue marker to find a parked ride.';
  }
  if (vacant) { status = 'VACANT'; instruction = 'Dispatch for a fare · Bookings for texts · Newsroom for a lead.'; }
  return {
    status, title, instruction, vacant, routeVisible: !vacant,
    distance: Math.round(dist(g.actor.position, g.target)),
    arriving: !pickup && !detour && !g.onFoot && dist(g.actor.position, g.target) < 150,
    fareLabel: harbour ? 'ENTRY + SWAP' : 'BASE FARE',
    fare: harbour ? g.harbour.vehicleId === g.player.id ? 'PAID' : `$${PORT_FEE}` : `$${job.fare}`,
    bonuses: !pickup && !detour && !g.onFoot,
    tip: job.elapsed < job.time ? `FAST TIP · ${Math.ceil(job.time - job.elapsed)}s` : 'NO RUSH · BASE FARE',
    comfort: `${Math.round(job.comfort)}% ${parcel ? 'intact' : 'comfort'}`,
    progress: g.onFoot || vacant ? 0 : harbour ? g.harbour.progress / 2.5 : job.wait / 0.8,
    speed: Math.round(g.speed * 2.236936), boost: Math.max(0, Math.min(100, g.boost)),
  };
}

export function bindNavigationHud(root: HTMLElement, currentGame: () => Game, actions: { texts: () => void; notebook: () => void; focus: () => void; routeVisibility: (visible: boolean) => void }) {
  const get = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const panel = root.querySelector<HTMLElement>('.navigation-hud')!;
  const views = new WeakMap<Game, { job: Game['job']; routed: boolean }>();
  const view = () => {
    const game = currentGame();
    let state = views.get(game);
    if (!state) { state = { job: game.job, routed: game.jobsDone === 0 }; views.set(game, state); }
    if (state.job !== game.job) {
      // A selected text booking is engaged; automatically dispatched ordinary work
      // returns to the vacant shortcuts after each completed ride.
      state.job = game.job; state.routed = !!game.job.missionId;
    }
    return state;
  };
  const routeFare = () => { const g = currentGame(); if (g.mode !== 'playing' || g.onFoot || g.job.stage !== 'pickup') return; g.navToGarage = g.navToHarbour = g.navToNewsroom = false; view().routed = true; refresh(); actions.focus(); };
  get('dispatch').addEventListener('click', routeFare);
  get('job-status').addEventListener('click', () => {
    const g = currentGame();
    if (g.mode !== 'playing' || g.onFoot || g.job.stage !== 'pickup' || g.navToGarage || g.navToNewsroom || g.navToHarbour || g.harbour.vehicleId === g.player.id) return;
    view().routed = !view().routed; refresh(); actions.focus();
  });
  get('texts').addEventListener('click', actions.texts);
  get('notebook').addEventListener('click', actions.notebook);
  get('newsroom').addEventListener('click', () => { currentGame().navigateNewsroom(); refresh(); actions.focus(); });
  get('photo').addEventListener('click', () => { const g = currentGame(); if (g.mode === 'playing' && !g.observeScene()) g.notify('Stop near the café frontage to bookmark an observation.'); actions.focus(); });
  get('map-toggle').addEventListener('click', () => {
    const collapsed = !get('map-content').hidden;
    get('map-content').hidden = collapsed; panel.classList.toggle('collapsed', collapsed);
    get('map-toggle').setAttribute('aria-expanded', String(!collapsed));
    get('map-toggle').setAttribute('aria-label', collapsed ? 'Expand navigation map' : 'Collapse navigation map');
  });
  let dispatcher = '';
  function refresh() {
    const g = currentGame(), state = navigationHudState(g, view().routed);
    actions.routeVisibility(state.routeVisible);
    if (dispatcher !== g.campaignContent.dispatcher) {
      dispatcher = g.campaignContent.dispatcher;
      showCharacterPortrait(get('dispatch-portrait') as HTMLImageElement, characters[g.campaignContent.dispatcher]);
      showCharacterPortrait(get('bookings-portrait') as HTMLImageElement, characters.iris);
    }
    panel.dataset.state = state.status.toLowerCase().replace(' ', '-');
    get('navigation-destination').hidden = state.vacant; get('navigation-contacts').hidden = !state.vacant;
    const toolsVisible = state.vacant || g.onFoot || g.navToNewsroom;
    get('navigation-fare').hidden = toolsVisible; get('navigation-tools').hidden = !toolsVisible;
    get('job-status').textContent = state.status;
    const canClear = g.mode === 'playing' && g.job.stage === 'pickup' && !g.onFoot && !g.navToGarage && !g.navToNewsroom && !g.navToHarbour && g.harbour.vehicleId !== g.player.id;
    (get('job-status') as HTMLButtonElement).disabled = !canClear;
    get('job-status').title = canClear ? state.vacant ? 'Route the next fare' : 'Clear fare guidance and browse dispatch' : state.status;
    get('mission-title').textContent = state.title;
    get('distance').textContent = `${state.distance} m${state.arriving ? ' · Arriving soon' : ''}`;
    get('mission-description').textContent = state.instruction;
    get('fare-label').textContent = state.fareLabel; get('fare').textContent = state.fare;
    get('ride-bonuses').hidden = !state.bonuses;
    get('fast-tip').textContent = state.tip; get('comfort').textContent = state.comfort;
    get('job-progress').style.width = `${Math.max(0, Math.min(1, state.progress)) * 100}%`;
    get('speed').textContent = String(state.speed); get('speed-unit').textContent = g.onFoot ? 'WALK' : 'MPH';
    get('boost-bar').style.height = `${state.boost}%`;
    get('boost-meter').setAttribute('aria-valuenow', String(state.boost));
    get('boost-meter').hidden = g.onFoot; panel.classList.toggle('boosting', !g.onFoot && g.controls.boost);
    get('map-status').textContent = g.stars ? 'PURSUIT' : 'LIVE';
    (get('dispatch') as HTMLButtonElement).disabled = g.mode !== 'playing';
    for (const id of ['texts', 'newsroom', 'notebook', 'photo']) (get(id) as HTMLButtonElement).disabled = !g.campaignEnabled || g.mode !== 'playing';
    return state;
  }
  return Object.assign(refresh, { routeFare });
}
