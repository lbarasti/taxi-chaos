import type { Game } from '../game/game';
import { wantedThresholds } from '../game/rules';

const starPath = 'M12 2 15.1 8.3 22 9.3 17 14.2 18.2 21 12 17.8 5.8 21 7 14.2 2 9.3 8.9 8.3Z';
const starMarkup = wantedThresholds.map((_, index) => `<svg class="heat-star" viewBox="0 0 24 24" aria-hidden="true">
  <defs><clipPath id="player-heat-clip-${index}"><rect x="2" y="0" width="0" height="24" /></clipPath></defs>
  <path class="heat-star-empty" d="${starPath}" />
  <path class="heat-star-fill" d="${starPath}" clip-path="url(#player-heat-clip-${index})" />
</svg>`).join('');

export const playerHudMarkup = `<section class="player-hud" aria-label="Player status">
  <time id="player-time" aria-label="Time of day">07:00</time>
  <strong id="player-cash" aria-label="Cash">$0</strong>
  <div id="player-health" class="player-health" role="meter" aria-label="Personal health" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i></i></div>
  <div id="player-heat" class="player-heat" role="meter" aria-label="Police attention" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${starMarkup}</div>
</section>`;

export function playerHudState(game: Pick<Game, 'dayNight' | 'save' | 'driverHealth' | 'heat' | 'stars'>) {
  const heat = Math.max(0, Math.min(100, game.heat));
  return {
    time: game.dayNight.snapshot().time,
    cash: `$${Math.floor(game.save.cash).toLocaleString('en-US')}`,
    health: Math.max(0, Math.min(100, game.driverHealth)),
    heat,
    stars: game.stars,
    starFills: wantedThresholds.map((threshold, index) => {
      const from = index === 0 ? 0 : wantedThresholds[index - 1];
      return Math.max(0, Math.min(1, (heat - from) / (threshold - from)));
    }),
  };
}

export function bindPlayerHud(root: HTMLElement, currentGame: () => Game) {
  const panel = root.querySelector<HTMLElement>('.player-hud')!;
  const time = root.querySelector<HTMLTimeElement>('#player-time')!;
  const cash = root.querySelector<HTMLElement>('#player-cash')!;
  const health = root.querySelector<HTMLElement>('#player-health')!;
  const fill = health.querySelector<HTMLElement>('i')!;
  const heat = root.querySelector<HTMLElement>('#player-heat')!;
  const starClips = Array.from(heat.querySelectorAll('clipPath rect'));
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
    state.starFills.forEach((amount, index) => starClips[index].setAttribute('width', String(amount * 20)));
    heat.setAttribute('aria-valuenow', String(state.heat));
    heat.setAttribute('aria-valuetext', `${state.stars} of 3 wanted stars; ${Math.round(state.heat)}% police attention`);
  };
}
