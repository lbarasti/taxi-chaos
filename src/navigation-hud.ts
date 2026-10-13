import type { Game } from './game';
import { dist } from './physics';
import { characters } from './characters';
import { showCharacterPortrait } from './story-view';

// Original, embedded line artwork; reference mock-up assets are not used.
const paths = {
  pin: '<path d="M18 10c0 5-6 11-6 11S6 15 6 10a6 6 0 1 1 12 0Z"/><circle cx="12" cy="10" r="2"/>',
  news: '<path d="M4 5h13v15H4zM17 9h3v11H7M7 9h7M7 13h7M7 17h4"/>',
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
  <div class="navigation-chart"><canvas id="map" aria-label="Local minimap: yellow is your taxi, circles or edge arrows are destinations, blue squares are the garage or parked rides, red dots are police"></canvas></div>
</aside>`;

/** View-only state: dispatch, physics, pickups and the saved game remain authoritative. */
export function navigationHudState(g: Game, fareRouted = true) {
  const job = g.job, pickup = job.stage === 'pickup', parcel = job.type === 'parcel';
  const harbour = !g.onFoot && (g.navToHarbour || g.harbour.vehicleId === g.player.id);
  const detour = g.navToGarage || g.navToNewsroom || harbour;
  const vacant = pickup && !fareRouted && !detour && !g.onFoot;
  let status = pickup ? 'ENGAGED' : 'ON BOARD';
  let title = pickup ? parcel ? `Collect ${job.name}'s parcel.` : `Meet ${job.name}.` : `${job.destination}.`;
  if (parcel && !pickup) status = 'LOADED';
  if (g.navToGarage) title = 'Pit Stop.';
  if (g.navToNewsroom) title = `Newsroom · ${g.campaignContent.newsroom.name}`;
  if (harbour) {
    const admitted = g.harbour.vehicleId === g.player.id;
    title = admitted ? g.harbour.exchanged ? 'Take the exit.' : 'Container C-76.' : g.policeVisible ? 'Lose the tail.' : g.portGateNear ? 'Pay security.' : 'Northstar Harbour.';
  }
  if (g.onFoot) {
    status = 'ON FOOT'; title = g.tumble ? 'Brace for impact.' : 'Find a ride.';
  }
  if (vacant) status = 'VACANT';
  return {
    status, title, vacant, routeVisible: !vacant,
    distance: Math.round(dist(g.actor.position, g.target)),
  };
}

export function bindNavigationHud(root: HTMLElement, currentGame: () => Game, actions: { texts: () => void; focus: () => void; routeVisibility: (visible: boolean) => void }) {
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
  get('newsroom').addEventListener('click', () => { currentGame().navigateNewsroom(); refresh(); actions.focus(); });
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
    get('job-status').textContent = state.status;
    const canClear = g.mode === 'playing' && g.job.stage === 'pickup' && !g.onFoot && !g.navToGarage && !g.navToNewsroom && !g.navToHarbour && g.harbour.vehicleId !== g.player.id;
    (get('job-status') as HTMLButtonElement).disabled = !canClear;
    get('job-status').title = canClear ? state.vacant ? 'Route the next fare' : 'Clear fare guidance and browse dispatch' : state.status;
    get('mission-title').textContent = state.title;
    get('mission-title').title = state.title;
    get('distance').textContent = `${state.distance} m`;
    (get('dispatch') as HTMLButtonElement).disabled = g.mode !== 'playing';
    for (const id of ['texts', 'newsroom']) (get(id) as HTMLButtonElement).disabled = !g.campaignEnabled || g.mode !== 'playing';
    return state;
  }
  return Object.assign(refresh, { routeFare });
}
