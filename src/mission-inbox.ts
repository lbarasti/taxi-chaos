import type { Game } from './game';
import { characters, isCharacterId } from './characters';
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
    if (!panel.hidden) { refresh(); root.querySelector<HTMLButtonElement>('#texts-close')!.focus(); } else focusGame();
  });
  root.querySelector('#texts-close')!.addEventListener('click', close);
  panel.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  function refresh() {
    const game = currentGame();
    const ids = game.missions.available({ deliveries: game.save.story.deliveries, careerDeliveries: game.save.deliveries,
      jobType: game.player.definition.access.job, model: game.player.model, kind: game.player.kind, time: game.save.story.campaignSeconds })
      .filter(id => game.missions.mission(id).offer);
    const receipts = game.save.playerRecords.texts;
    const unread = receipts.filter(t => t.readAt === null).length;
    toggle.textContent = `Texts · ${unread} unread`;
    toggle.hidden = game.mode !== 'playing';
    toggle.setAttribute('aria-label', `${unread} unread text messages, ${ids.length} available mission offers`);
    if (game.mode !== 'playing') { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
    const next = JSON.stringify([game.missions.catalogue.revision, receipts.map(t => t.messageId), ids, game.job.missionId, game.job.stage, game.onFoot, game.save.story.failed, game.save.story.completed]);
    if (signature !== next) {
      signature = next;
      const scroll = panel.scrollTop;
      messages.replaceChildren();
      if (!receipts.length) { const empty = document.createElement('p'); empty.textContent = 'No received texts. Keep driving — new leads arrive as the story progresses.'; messages.append(empty); }
      for (const receipt of receipts) {
        const id = receipt.missionId, mission = game.missions.mission(id);
        const actionable = ids.includes(id) && mission?.offer?.messageId === receipt.messageId;
        const article = document.createElement('article');
        article.dataset.messageId = receipt.messageId;
        const sender = document.createElement('div'); sender.className = 'inbox-sender';
        if (isCharacterId(receipt.character)) {
          const frame = document.createElement('span'); frame.className = 'story-portrait';
          const portrait = document.createElement('img'); showCharacterPortrait(portrait, characters[receipt.character]); frame.append(portrait); sender.append(frame);
        }
        const name = document.createElement('strong'); name.textContent = receipt.sender; sender.append(name);
        const title = document.createElement('h3'); title.textContent = receipt.title;
        const text = document.createElement('p'); text.textContent = receipt.text;
        const stop = document.createElement('small'); stop.textContent = `Pickup: ${receipt.pickup}${actionable ? mission.pickupChoice ? ' · Branch choice at pickup' : ' · Independent mission' : ' · Message history'}`;
        const route = document.createElement('button'); route.className = 'secondary';
        const selected = game.job.missionId === id;
        if (!actionable) {
          route.textContent = game.save.story.failed.includes(id) ? 'Missed · contact lost' : game.save.story.completed.includes(id) ? 'Delivered · message retained' : selected && game.job.stage === 'dropoff' ? 'Passenger on board' : 'Opportunity closed · message retained';
        } else route.textContent = game.job.stage === 'dropoff' ? 'Finish your current ride first' : selected ? 'Pickup routed · choice still open' : 'Route to pickup';
        route.disabled = !actionable || game.job.stage === 'dropoff' || game.onFoot;
        route.addEventListener('click', () => { if (currentGame().routeMissionOffer(id)) close(); });
        article.append(sender, title, text, stop, route); messages.append(article);
      }
      panel.scrollTop = scroll;
    }
    // Opening the inbox does not mark off-screen messages read. Record only
    // complete message bodies actually shown in the scroll viewport.
    if (!panel.hidden) {
      const bounds = panel.getBoundingClientRect();
      const shown = Array.from(messages.querySelectorAll<HTMLElement>('article')).filter(article => {
        const body = article.querySelector('p')!.getBoundingClientRect();
        return body.top >= bounds.top && body.bottom <= bounds.bottom;
      }).map(article => article.dataset.messageId!);
      game.readTextMessages(shown);
    }
  }
  panel.addEventListener('scroll', refresh);
  return refresh;
}
