import type { Game } from '../game';
import { district } from '../world/world';
import { navigationTargetKind, type NavigationTargetKind } from '../rendering/radar';
import { onBoardCue } from '../rendering/onboard-cue';

// Original, embedded line artwork; reference mock-up assets are not used.
const paths = {
  dispatch: '<path d="M4.5 13.5v-1.6a7.5 7.5 0 0 1 15 0v1.6"/><path d="M4.5 12.5h2.2a1 1 0 0 1 1 1v3.4a1 1 0 0 1-1 1H5.6a1.1 1.1 0 0 1-1.1-1.1zM19.5 12.5h-2.2a1 1 0 0 0-1 1v3.4a1 1 0 0 0 1 1h1.1a1.1 1.1 0 0 0 1.1-1.1z"/><path d="M17 19.4a3.4 3.4 0 0 1-3 1.6h-1.4"/>',
  message: '<path d="M21 14a3 3 0 0 1-3 3H8l-5 4V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3zM7 8h10M7 12h7"/>',
  news: '<path d="M4 5h13v15H4zM17 9h3v11H7M7 9h7M7 13h7M7 17h4"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
const icon = (name: keyof typeof paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;

const mapLegend = 'Yellow is your taxi, symbols or edge arrows are destinations, blue markers are parked rides, red dots are police';

export const navigationHudMarkup = `<aside class="navigation-hud" aria-label="Taxi navigation and status">
  <div class="navigation-chart">
    <canvas id="map" role="img" aria-label="Local minimap: ${mapLegend}"></canvas>
  </div>
</aside>
<div class="navigation-actions" role="group" aria-label="Dispatch and campaign shortcuts">
  <button id="dispatch" aria-pressed="true" aria-label="Dispatch: route the next fare" title="Dispatch: route the next fare">${icon('dispatch')}</button>
  <button id="texts" aria-label="Bookings: read text messages" title="Bookings · read text messages">${icon('message')}</button>
  <button id="newsroom" aria-label="Newsroom: view records and story readiness" title="Newsroom · records and story readiness" aria-haspopup="dialog" aria-controls="modal">${icon('news')}</button>
  <button id="observe" aria-label="Record a nearby observation" title="Record a nearby observation" hidden disabled>${icon('camera')}<span class="observation-recorded" aria-hidden="true">${icon('check')}</span></button>
</div>`;

export type NavigationStatus = 'ENGAGED' | 'ON BOARD' | 'LOADED' | 'ON FOOT' | 'VACANT';
export type NavigationLoad = 'passenger' | 'parcel';

/** Prefer a new, recordable nearby scene; never assume the first authored ID is local. */
export function observationActionState(g: Game) {
  const nearby = g.campaignContent.observations.map(observation => g.observationStatus(observation.id))
    .filter((status): status is NonNullable<typeof status> => status !== null && status.nearby && status.sceneEligible)
    .sort((a, b) => a.distance - b.distance);
  const status = nearby.find(status => !status.recorded && status.available) ?? nearby.find(status => !status.recorded) ?? nearby[0];
  if (!status) return null;
  const title = g.campaignContent.materials[status.observation.id].title;
  return { id: status.observation.id, recorded: status.recorded, disabled: !status.available || status.recorded,
    label: status.recorded ? `Already recorded: ${title}. Saved in your Dispatch notebook.` : status.available ? status.observation.label : `${status.observation.label}: ${status.reason}` };
}

/** View-only state: dispatch, physics, pickups and the saved game remain authoritative. */
export function navigationHudState(g: Game, fareRouted = true) {
  const job = g.job, pickup = job.stage === 'pickup', parcel = job.type === 'parcel';
  const admitted = g.harbour.vehicleId === g.player.id;
  const harbour = !g.onFoot && (g.navToHarbour || admitted);
  const detour = g.navToGarage || g.navToNewsroom || harbour;
  const vacant = pickup && !fareRouted && !detour && !g.onFoot;
  let status: NavigationStatus = pickup ? 'ENGAGED' : 'ON BOARD';
  let label = pickup ? 'PICK UP' : 'DELIVER';
  let title = pickup ? parcel ? `${job.name}'s parcel.` : `Meet ${job.name}.` : `${job.destination}.`;
  if (parcel && !pickup) status = 'LOADED';
  if (g.navToGarage) { label = 'GARAGE'; title = 'Pit Stop.'; }
  if (g.navToNewsroom) { label = 'NEWSROOM'; title = `Newsroom · ${g.campaignContent.newsroom.name}`; }
  if (harbour) {
    label = 'HARBOUR';
    title = admitted ? g.harbour.exchanged ? 'Take the exit.' : 'Container C-76.' : g.policeVisible ? 'Lose the tail.' : g.portGateNear ? 'Pay security.' : 'Northstar Harbour.';
  }
  if (g.onFoot) { status = 'ON FOOT'; label = g.tumble ? 'BRACE' : ''; title = g.tumble ? 'Brace for impact.' : 'Find a ride.'; }
  if (vacant) { status = 'VACANT'; label = 'DISPATCH'; title = 'Route the next fare.'; }
  const kind: NavigationTargetKind = navigationTargetKind({ onFoot: g.onFoot, stage: job.stage, navToGarage: g.navToGarage, navToHarbour: g.navToHarbour, navToNewsroom: g.navToNewsroom, admitted, exchanged: g.harbour.exchanged });
  return {
    status, label, title, vacant, kind, routeVisible: !vacant,
    // Guidance texts feed the map's accessible label only: the wheel carries no visible
    // caption, distance counter or status bar, so its glyphs and markers explain themselves.
    caption: label ? `${label} · ${title.replace(/\.$/, '')}` : '',
    load: (g.onFoot || pickup ? null : parcel ? 'parcel' : 'passenger') as NavigationLoad | null,
  };
}

export function bindNavigationHud(root: HTMLElement, currentGame: () => Game, actions: { texts: () => void; newsroom: () => void; focus: () => void; routeVisibility: (visible: boolean) => void }) {
  const get = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const panel = root.querySelector<HTMLElement>('.navigation-hud')!;
  const dispatch = get('dispatch') as HTMLButtonElement;
  const observe = get('observe') as HTMLButtonElement;
  const map = get('map');
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
  // Route the current pickup, dropping any garage, harbour or newsroom detour. Returns
  // false when the fare cannot be routed so callers can skip a refresh.
  const selectFare = () => {
    const g = currentGame();
    if (g.mode !== 'playing' || g.onFoot || g.job.stage !== 'pickup') return false;
    g.navToGarage = g.navToHarbour = g.navToNewsroom = false; view().routed = true; return true;
  };
  /** Inbox entry point: engage the chosen booking and refresh the HUD. */
  const routeFare = () => { if (selectFare()) { refresh(); actions.focus(); } };
  // One real toggle covers both fare routing and clearing guidance, so the map needs no
  // canvas hotspots: hidden guidance returns to VACANT, a second press routes again.
  dispatch.addEventListener('click', () => {
    const g = currentGame();
    if (g.mode !== 'playing') return;
    if (g.navToNewsroom) { g.navigateNewsroom(); view().routed = false; }
    else if (view().routed) view().routed = false;
    else selectFare();
    refresh(); actions.focus();
  });
  get('texts').addEventListener('click', actions.texts);
  get('newsroom').addEventListener('click', () => {
    const g = currentGame();
    if (g.mode === 'playing' && g.campaignEnabled) actions.newsroom();
  });
  observe.addEventListener('click', () => {
    const g = currentGame(), action = observationActionState(g);
    if (action && !action.disabled) g.observeScene(action.id);
    refresh(); actions.focus();
  });
  let dispatchLabel = '';
  function refresh() {
    const g = currentGame(), state = navigationHudState(g, view().routed);
    actions.routeVisibility(state.routeVisible);
    panel.dataset.state = state.status.toLowerCase().replace(' ', '-');
    panel.dataset.target = state.kind;
    // The world renderer paints the on-board aura on the cab roof or bike body. This
    // attribute only mirrors the same pure cue decision for offline browser QA, so the
    // wheel keeps no badge, silhouette or package icon.
    panel.dataset.cue = onBoardCue(g, g.player) ?? '';
    const neighbourhood = district(g.actor.position, g.map);
    const load = state.load === 'parcel' ? 'Carrying a parcel. ' : state.load === 'passenger' ? 'Carrying a passenger. ' : '';
    // No visible readout sits on the wheel; its accessible label carries the detail instead.
    const description = `Local minimap: ${neighbourhood}. ${load}${state.caption ? `${state.caption}. ` : ''}${mapLegend}`;
    if (map.getAttribute('aria-label') !== description) map.setAttribute('aria-label', description);
    // The toggle only acts while a pickup can still be routed, matching the old status button.
    const canToggle = g.mode === 'playing' && g.job.stage === 'pickup' && !g.onFoot && !g.navToGarage && !g.navToHarbour && g.harbour.vehicleId !== g.player.id;
    dispatch.disabled = !canToggle;
    dispatch.setAttribute('aria-pressed', String(!state.vacant));
    const action = !canToggle
      ? g.onFoot ? 'no fare while walking' : g.job.stage === 'dropoff' ? 'this ride is already routed' : 'finish the current detour first'
      : g.navToNewsroom ? 'clear newsroom guidance' : state.vacant ? 'route the next fare' : 'hide fare guidance';
    const text = `Dispatch: ${action}`;
    if (text !== dispatchLabel) { dispatchLabel = text; dispatch.setAttribute('aria-label', text); dispatch.title = text; }
    for (const id of ['texts', 'newsroom']) (get(id) as HTMLButtonElement).disabled = !g.campaignEnabled || g.mode !== 'playing';
    const observation = observationActionState(g);
    observe.hidden = !observation;
    observe.disabled = !observation || observation.disabled;
    observe.dataset.state = observation?.recorded ? 'recorded' : observation && !observation.disabled ? 'available' : 'unavailable';
    const observationLabel = observation?.label ?? 'Record a nearby observation';
    if (observe.getAttribute('aria-label') !== observationLabel) { observe.setAttribute('aria-label', observationLabel); observe.title = observationLabel; }
    return state;
  }
  return Object.assign(refresh, { routeFare });
}
