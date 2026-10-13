import type { Game } from './game';

export const playerHudMarkup = `<section class="player-hud" aria-label="Player status">
  <time id="player-time" aria-label="Time of day">07:00</time>
  <strong id="player-cash" aria-label="Cash">$0</strong>
  <div id="player-health" class="player-health" role="meter" aria-label="Personal health" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i></i></div>
</section>`;

export function playerHudState(game: Pick<Game, 'dayNight' | 'save' | 'driverHealth'>) {
  return {
    time: game.dayNight.snapshot().time,
    cash: `$${Math.floor(game.save.cash).toLocaleString('en-US')}`,
    health: Math.max(0, Math.min(100, game.driverHealth)),
  };
}

export function bindPlayerHud(root: HTMLElement, currentGame: () => Game) {
  const panel = root.querySelector<HTMLElement>('.player-hud')!;
  const time = root.querySelector<HTMLTimeElement>('#player-time')!;
  const cash = root.querySelector<HTMLElement>('#player-cash')!;
  const health = root.querySelector<HTMLElement>('#player-health')!;
  const fill = health.querySelector<HTMLElement>('i')!;
  return () => {
    const state = playerHudState(currentGame());
    time.textContent = state.time;
    time.dateTime = state.time;
    cash.textContent = state.cash;
    // Keep the complete balance readable even for unusually large Lab wallets.
    panel.style.setProperty('--cash-length', String(Math.max(8, state.cash.length)));
    fill.style.width = `${state.health}%`;
    health.setAttribute('aria-valuenow', String(state.health));
    health.setAttribute('aria-valuetext', `${Math.ceil(state.health)}%`);
  };
}
