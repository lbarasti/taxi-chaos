import type { Game } from '../game/game';

export const stopoverActionsMarkup = `<section id="stopover-actions" class="stopover-actions" aria-label="Optional stop" hidden>
  <div class="stopover-heading"><span>F · OPTIONAL STOP</span><strong id="stopover-title"></strong></div>
  <p id="stopover-request"></p>
  <div class="stopover-buttons">
    <button id="stopover-route" aria-describedby="stopover-request" aria-pressed="false" aria-keyshortcuts="F">Wash stop</button>
    <button id="stopover-wait" aria-describedby="stopover-request" hidden>Wait for wash</button>
  </div>
</section>`;

/** A route is a reversible choice; starting the wait is a separate, explicit action. */
export function stopoverActionState(g: Pick<Game, 'mode' | 'onFoot' | 'navToStopover' | 'stopoverStatus'>) {
  const stop = g.stopoverStatus;
  if (g.mode !== 'playing' || g.onFoot || !stop || stop.completed) return null;
  const minutes = Math.max(0, Math.ceil(stop.started ? stop.remaining : stop.seconds));
  const paused = stop.started && !stop.available;
  return {
    title: stop.title, request: stop.request, routed: g.navToStopover,
    routeText: g.navToStopover ? 'Direct to destination' : 'Wash stop',
    routeLabel: g.navToStopover ? 'Route directly to your destination' : `Route to the optional stop: ${stop.title}`,
    showWait: stop.nearby || stop.started,
    waitDisabled: !stop.available || stop.started,
    waitText: paused ? `Wash paused · ${minutes} min` : stop.started ? `Washing · ${minutes} min` : `Wait for wash · ${minutes} min`,
    waitLabel: paused ? `Stop at the wash to resume: ${minutes} game minutes remaining` : stop.started ? `Washing: ${minutes} game minutes remaining` : stop.available ? `Wait ${minutes} game minutes for the wash` : 'Stop at the wash before waiting',
    shortcutWaits: stop.nearby && stop.available && !stop.started,
  };
}

export function bindStopoverActions(root: HTMLElement, currentGame: () => Game, perform: (wait: boolean) => void) {
  const panel = root.querySelector<HTMLElement>('#stopover-actions')!;
  const title = root.querySelector<HTMLElement>('#stopover-title')!;
  const request = root.querySelector<HTMLElement>('#stopover-request')!;
  const route = root.querySelector<HTMLButtonElement>('#stopover-route')!;
  const wait = root.querySelector<HTMLButtonElement>('#stopover-wait')!;
  let presented = false;
  route.addEventListener('click', () => { if (presented) perform(false); });
  wait.addEventListener('click', () => { if (presented) perform(true); });
  function refresh(visible = true) {
    const state = stopoverActionState(currentGame());
    presented = visible && !!state;
    panel.hidden = !presented;
    if (!presented || !state) return;
    title.textContent = state.title;
    request.textContent = state.request;
    route.textContent = state.routeText;
    route.setAttribute('aria-label', state.routeLabel);
    route.setAttribute('aria-pressed', String(state.routed));
    route.title = state.shortcutWaits ? state.routeLabel : `${state.routeLabel} · F`;
    route.removeAttribute('aria-keyshortcuts');
    wait.removeAttribute('aria-keyshortcuts');
    (state.shortcutWaits ? wait : route).setAttribute('aria-keyshortcuts', 'F');
    wait.hidden = !state.showWait;
    wait.disabled = state.waitDisabled;
    wait.textContent = state.waitText;
    wait.setAttribute('aria-label', state.waitLabel);
    wait.title = state.shortcutWaits ? `${state.waitLabel} · F` : state.waitLabel;
  }
  return Object.assign(refresh, {
    shortcut() {
      const state = stopoverActionState(currentGame());
      if (presented && state) perform(state.shortcutWaits);
    },
  });
}
