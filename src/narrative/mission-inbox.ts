import type { Game } from '../game';
import { characters, isCharacterId } from './characters';
import { showCharacterPortrait } from './story-view';
import { calendarLabel } from '../campaign/clock';
import { formatClock } from '../day-night';
import { textDay, textTiming, textHistory, textExpiryDiscs, TEXT_HISTORY_DAYS } from './text-messages';

export const inboxMarkup = `<aside id="mission-inbox" class="mission-inbox panel" aria-label="Mission text messages" hidden>
  <header><strong>TEXT MESSAGES</strong><button id="texts-close" aria-label="Close text messages">×</button></header>
  <div id="mission-texts"></div>
  <button id="texts-load-more" class="secondary" hidden>Load more</button>
</aside>`;

export function bindMissionInbox(root: HTMLElement, currentGame: () => Game, focusGame: () => void, recordVisible: () => boolean = () => true, routed: () => void = () => {}) {
  const panel = root.querySelector<HTMLElement>('#mission-inbox')!;
  const messages = root.querySelector<HTMLElement>('#mission-texts')!;
  const loadMore = root.querySelector<HTMLButtonElement>('#texts-load-more')!;
  let signature = '';
  let historyDays = TEXT_HISTORY_DAYS, historyGame = currentGame(), countdownMinute = -1;
  const close = () => { panel.hidden = true; focusGame(); };
  const open = () => {
    if (currentGame().mode !== 'playing') return;
    currentGame().keys.clear();
    historyDays = TEXT_HISTORY_DAYS; signature = ''; panel.scrollTop = 0;
    panel.hidden = false;
    refresh(); root.querySelector<HTMLButtonElement>('#texts-close')!.focus();
  };
  root.querySelector('#texts-close')!.addEventListener('click', close);
  loadMore.addEventListener('click', () => { historyDays += TEXT_HISTORY_DAYS; refresh(); });
  panel.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  function refresh() {
    const game = currentGame();
    if (historyGame !== game) { historyGame = game; historyDays = TEXT_HISTORY_DAYS; signature = ''; panel.scrollTop = 0; }
    const now = game.textMessageMinute;
    const windowFor = (id: string) => game.campaignEnabled ? game.campaignContent.jobWindows[id] : undefined;
    const ids = game.missions.available({ deliveries: game.save.story.deliveries, careerDeliveries: game.save.deliveries,
      jobType: game.player.definition.access.job, model: game.player.model, kind: game.player.kind, time: game.save.story.campaignSeconds, minute: game.save.campaign.minute, shift: game.save.campaign.finished ? 15 : game.save.campaign.shift })
      .filter(id => game.missions.mission(id).offer && !game.save.playerRecords.texts.some(t => t.missionId === id && textTiming(t, windowFor(id)).expiresMinute <= now));
    const receipts = game.save.playerRecords.texts;
    const history = textHistory(receipts, now, historyDays, windowFor);
    if (game.mode !== 'playing') panel.hidden = true;
    const next = JSON.stringify([game.missions.catalogue.revision, receipts.map(t => [t.messageId, t.receivedMinute, t.expiresMinute]), textDay(now), historyDays, ids, game.job.missionId, game.job.stage, game.onFoot, game.save.story.failed, game.save.story.completed]);
    if (signature !== next) {
      signature = next;
      const scroll = panel.scrollTop;
      messages.replaceChildren();
      loadMore.hidden = !history.hasOlder;
      if (!history.visible.length) { const empty = document.createElement('p'); empty.textContent = receipts.length ? 'No texts from the last two days.' : 'No received texts. Keep driving — new leads arrive as the story progresses.'; messages.append(empty); }
      let previousDay = -1;
      for (const receipt of history.visible) {
        const timing = textTiming(receipt, windowFor(receipt.missionId)), day = textDay(timing.receivedMinute);
        if (day !== previousDay) {
          const separator = document.createElement('h2'); separator.className = 'inbox-day'; separator.dataset.day = String(day);
          separator.textContent = `Day ${day}${day === textDay(now) ? ' · Today' : day === textDay(now) - 1 ? ' · Yesterday' : ''}`;
          messages.append(separator); previousDay = day;
        }
        const id = receipt.missionId, mission = game.missions.mission(id);
        const actionable = ids.includes(id) && mission?.offer?.messageId === receipt.messageId;
        const article = document.createElement('article');
        article.dataset.messageId = receipt.messageId;
        const sender = document.createElement('div'); sender.className = 'inbox-sender';
        if (isCharacterId(receipt.character)) {
          const frame = document.createElement('span'); frame.className = 'story-portrait';
          const portrait = document.createElement('img'); showCharacterPortrait(portrait, characters[receipt.character]); frame.append(portrait); sender.append(frame);
        }
        const details = document.createElement('div'); details.className = 'inbox-contact';
        const name = document.createElement('strong'); name.textContent = receipt.sender;
        const time = document.createElement('span'); time.className = 'inbox-time'; time.textContent = formatClock(timing.receivedMinute); time.setAttribute('aria-label', `Received ${calendarLabel(timing.receivedMinute)}`);
        details.append(name, time); sender.append(details);
        const title = document.createElement('h3'); title.textContent = receipt.title;
        const text = document.createElement('p'); text.textContent = mission?.offer?.messageId === receipt.messageId ? mission.offer.text : receipt.text;
        const stop = document.createElement('small'); stop.textContent = `Pickup: ${receipt.pickup}${actionable ? mission.pickupChoice ? ' · Competing booking · choice at pickup' : ' · Independent booking' : ' · Message history'}`;
        const route = document.createElement('button'); route.className = 'secondary';
        const selected = game.job.missionId === id;
        const countdown = document.createElement('div'); countdown.className = 'inbox-expiry'; countdown.setAttribute('role', 'img');
        countdown.dataset.received = String(timing.receivedMinute); countdown.dataset.expires = String(timing.expiresMinute);
        countdown.dataset.active = String(actionable && !(selected && game.job.stage === 'dropoff'));
        const expiryLabel = document.createElement('span'); expiryLabel.className = 'inbox-expiry-label';
        expiryLabel.textContent = actionable ? 'Time left' : game.save.story.completed.includes(id) ? 'Delivered' : selected && game.job.stage === 'dropoff' ? 'On board' : now >= timing.expiresMinute ? 'Expired' : 'Closed';
        countdown.append(expiryLabel);
        const discs = document.createElement('span'); discs.className = 'inbox-expiry-discs'; discs.setAttribute('aria-hidden', 'true');
        for (const _ of textExpiryDiscs(timing.receivedMinute, timing.expiresMinute, now)) { const disc = document.createElement('span'); disc.className = 'inbox-expiry-disc'; discs.append(disc); }
        countdown.append(discs);
        if (!actionable) {
          route.textContent = game.save.story.completed.includes(id) ? 'Delivered' : selected && game.job.stage === 'dropoff' ? 'Passenger on board' : now >= timing.expiresMinute ? 'Expired · pickup deadline passed' : game.save.story.failed.includes(id) ? 'Missed · contact lost' : 'Opportunity closed';
        } else route.textContent = game.job.stage === 'dropoff' ? 'Finish your current ride first' : selected ? 'Pickup routed · choice still open' : 'Route to pickup';
        route.disabled = !actionable || game.job.stage === 'dropoff' || game.onFoot;
        route.addEventListener('click', () => { if (currentGame().routeMissionOffer(id)) { routed(); close(); } });
        article.append(sender, title, text, stop, countdown, route); messages.append(article);
      }
      panel.scrollTop = scroll;
      countdownMinute = -1;
    }
    // Keep discs moving without rebuilding the list, losing focus or moving scroll.
    const minute = Math.floor(now * 10) / 10;
    if (!panel.hidden && countdownMinute !== minute) {
      countdownMinute = minute;
      for (const countdown of Array.from(messages.querySelectorAll<HTMLElement>('.inbox-expiry'))) {
        const received = Number(countdown.dataset.received), expires = Number(countdown.dataset.expires), active = countdown.dataset.active === 'true';
        const fills = textExpiryDiscs(received, expires, active ? now : expires);
        countdown.classList.toggle('urgent', active && expires - now <= 1440);
        countdown.classList.toggle('inactive', !active);
        countdown.title = active ? `Pickup expires ${calendarLabel(expires)} · one circle per day` : countdown.querySelector('.inbox-expiry-label')!.textContent!;
        countdown.setAttribute('aria-label', active ? `${Math.ceil(expires - now)} game minutes left to pick up. Expires ${calendarLabel(expires)}. Each circle represents one day.` : countdown.title);
        countdown.querySelectorAll<HTMLElement>('.inbox-expiry-disc').forEach((disc, i) => disc.style.setProperty('--remaining', `${fills[i] * 360}deg`));
      }
    }
    // Opening the inbox does not mark off-screen messages read. Record only
    // complete message bodies actually shown in the scroll viewport.
    if (!panel.hidden && recordVisible()) {
      const bounds = panel.getBoundingClientRect();
      const shown = Array.from(messages.querySelectorAll<HTMLElement>('article')).filter(article => {
        const body = article.querySelector('p')!.getBoundingClientRect();
        return body.top >= bounds.top && body.bottom <= bounds.bottom;
      }).map(article => article.dataset.messageId!);
      game.readTextMessages(shown);
    }
  }
  panel.addEventListener('scroll', refresh);
  return { refresh, open };
}
