import type { Game } from './game';
import { characters } from './characters';
import { showCharacterPortrait } from './story-view';

export const inboxMarkup = `<aside id="mission-inbox" class="mission-inbox panel" aria-label="Mission text messages" hidden>
  <header><strong>TEXT MESSAGES</strong><button id="texts-close" aria-label="Close text messages">×</button></header>
  <p class="inbox-help">Route a message, then drive to its pickup. Your choice locks in only when you stop and collect. One passenger at a time; independent offers can wait.</p>
  <div id="mission-texts"></div>
</aside>`;

export function bindMissionInbox(root: HTMLElement, currentGame: () => Game, focusGame: () => void) {
  const panel = root.querySelector<HTMLElement>('#mission-inbox')!;
  const toggle = root.querySelector<HTMLButtonElement>('#texts-toggle')!;
  const messages = root.querySelector<HTMLElement>('#mission-texts')!;
  let signature = '';
  const close = () => { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); focusGame(); };
  toggle.addEventListener('click', () => {
    currentGame().keys.clear();
    panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) root.querySelector<HTMLButtonElement>('#texts-close')!.focus(); else focusGame();
  });
  root.querySelector('#texts-close')!.addEventListener('click', close);
  panel.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  return () => {
    const game = currentGame();
    const ids = game.missions.available({ deliveries: game.save.story.deliveries, careerDeliveries: game.save.deliveries,
      jobType: game.player.definition.access.job, model: game.player.model, kind: game.player.kind, time: game.save.story.campaignSeconds })
      .filter(id => game.missions.mission(id).offer);
    toggle.textContent = `Texts · ${ids.length}`;
    toggle.hidden = game.mode !== 'playing';
    toggle.setAttribute('aria-label', `${ids.length} available mission text messages`);
    if (game.mode !== 'playing') { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
    const next = JSON.stringify([game.missions.catalogue.revision, ids, game.job.missionId, game.job.stage, game.onFoot]);
    if (signature === next) return;
    signature = next;
    messages.replaceChildren();
    if (!ids.length) { const empty = document.createElement('p'); empty.textContent = 'No outstanding texts. Keep driving — new leads arrive as the story progresses.'; messages.append(empty); }
    for (const id of ids) {
      const mission = game.missions.mission(id), offer = mission.offer!, character = characters[offer.character];
      const article = document.createElement('article');
      const sender = document.createElement('div'); sender.className = 'inbox-sender';
      const frame = document.createElement('span'); frame.className = 'story-portrait';
      const portrait = document.createElement('img'); showCharacterPortrait(portrait, character); frame.append(portrait);
      const name = document.createElement('strong'); name.textContent = character.name; sender.append(frame, name);
      const title = document.createElement('h3'); title.textContent = mission.title;
      const text = document.createElement('p'); text.textContent = offer.text;
      const stop = document.createElement('small'); stop.textContent = `Pickup: ${game.missions.catalogue.stops.byId[mission.stopIds.pickup].name}${mission.pickupChoice ? ' · Branch choice at pickup' : ' · Independent mission'}`;
      const route = document.createElement('button'); route.className = 'secondary';
      const selected = game.job.missionId === id;
      route.textContent = game.job.stage === 'dropoff' ? 'Finish your current ride first' : selected ? 'Pickup routed · choice still open' : 'Route to pickup';
      route.disabled = game.job.stage === 'dropoff' || game.onFoot;
      route.addEventListener('click', () => { if (currentGame().routeMissionOffer(id)) close(); });
      article.append(sender, title, text, stop, route); messages.append(article);
    }
  };
}
