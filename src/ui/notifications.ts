import type { Game } from '../game/game';
import type { NotificationCategory, TripReceipt } from '../game/notifications';

const labels: Record<NotificationCategory, string> = {
  newsroom: 'Newsroom', movement: 'On the street', services: 'Roadside & services', danger: 'Warning', dispatch: 'Dispatch',
};
const symbols: Record<NotificationCategory, string> = {
  newsroom: 'M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h8 M8 18h5',
  movement: 'M5 18 19 4 M8 4h11v11',
  services: 'm12 3 9 9-9 9-9-9Z M8 12h8 M12 8v8',
  danger: 'm12 3 10 18H2Z M12 9v5 M12 17v1',
  dispatch: 'M3 7h17l-4-4 M21 17H4l4 4',
};
export const notificationsMarkup = `<section id="notifications" class="notification-stack" aria-label="Notifications" hidden>
  <article id="toast" class="notification-card">
    <header><span class="notification-symbol" aria-hidden="true"></span><span class="notification-category"></span><button class="notification-dismiss" aria-label="Dismiss notification" hidden>×</button></header>
    <p class="notification-message" role="status" aria-live="polite" aria-atomic="true"></p>
    <div class="notification-receipt" aria-label="Trip receipt" tabindex="0" hidden>
      <div class="receipt-money">
        <div class="receipt-total"><span class="receipt-title"></span><strong data-receipt="payout"></strong><small class="receipt-base"></small></div>
        <div class="receipt-tips"><span>Tips included</span><strong data-receipt="tips"></strong><small>In your total</small></div>
      </div>
      <div class="receipt-scores">
        <div class="receipt-score receipt-speed" title="Score based on time remaining against the fare target."><span>Speed</span><strong><b data-receipt="speedScore"></b><small>/100</small></strong><div class="receipt-meter" role="meter" aria-label="Speed score" aria-valuemin="0" aria-valuemax="100"><i></i></div><small class="receipt-bonus" data-receipt="speedBonus"></small></div>
        <div class="receipt-score receipt-comfort" title="Comfort retained through the ride."><span>Comfort</span><strong><b data-receipt="comfortScore"></b><small>/100</small></strong><div class="receipt-meter" role="meter" aria-label="Comfort score" aria-valuemin="0" aria-valuemax="100"><i></i></div><small class="receipt-bonus" data-receipt="comfortBonus"></small></div>
      </div>
    </div>
    <footer><span class="notification-count"></span><span class="notification-lifetime"></span></footer>
    <div class="notification-timer" aria-hidden="true"><i></i></div>
  </article>
</section>`;

export function bindNotifications(root: HTMLElement, currentGame: () => Game, focus: () => void) {
  const stack = root.querySelector<HTMLElement>('#notifications')!;
  const card = stack.querySelector<HTMLElement>('.notification-card')!;
  const dismiss = stack.querySelector<HTMLButtonElement>('button')!;
  const message = stack.querySelector<HTMLElement>('p')!;
  const receiptView = stack.querySelector<HTMLElement>('.notification-receipt')!;
  const footer = stack.querySelector<HTMLElement>('footer')!;
  let displayedId: number | undefined;
  let displayedCategory: NotificationCategory | undefined;
  let displayedReceipt: TripReceipt | undefined;
  const money = (amount: number) => `$${amount.toLocaleString('en-US')}`;
  receiptView.addEventListener('keydown', event => {
    if (['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Space'].includes(event.code)) event.stopPropagation();
  });
  dismiss.addEventListener('click', () => {
    const game = currentGame();
    if (game.mode !== 'playing') return;
    game.notifications.dismiss(displayedId); refresh(); focus();
  });
  function visible() {
    return !document.hidden && !stack.hidden && displayedId === currentGame().notifications.current?.id && getComputedStyle(stack).visibility !== 'hidden';
  }
  function refresh() {
    const game = currentGame(), current = game.notifications.current;
    stack.hidden = game.mode !== 'playing' || !current;
    if (!current) { displayedId = undefined; game.notificationsVisible = false; return; }
    displayedId = current.id;
    stack.dataset.depth = String(Math.min(3, game.notifications.items.length));
    card.className = `notification-card visible ${current.kind}`;
    card.dataset.category = current.category;
    stack.querySelector('.notification-category')!.textContent = labels[current.category];
    if (displayedCategory !== current.category) {
      stack.querySelector('.notification-symbol')!.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${symbols[current.category]}"/></svg>`;
      displayedCategory = current.category;
    }
    // Avoid re-announcing unchanged content on every HUD refresh.
    if (message.textContent !== current.message) { message.textContent = current.message; message.scrollTop = 0; }
    receiptView.hidden = !current.receipt;
    message.classList.toggle('receipt-summary', !!current.receipt);
    if (current.receipt !== displayedReceipt) {
      displayedReceipt = current.receipt;
      receiptView.scrollTop = 0;
      if (displayedReceipt) {
        const receipt = displayedReceipt;
        receiptView.querySelector('.receipt-title')!.textContent = receipt.type === 'parcel' ? 'Delivery complete' : 'Fare complete';
        receiptView.querySelector('.receipt-base')!.textContent = `Base ${money(receipt.baseFare)}`;
        for (const key of ['payout', 'tips', 'speedScore', 'comfortScore', 'speedBonus', 'comfortBonus'] as const) {
          receiptView.querySelector(`[data-receipt="${key}"]`)!.textContent = key.endsWith('Score') ? String(receipt[key]) : key.endsWith('Bonus') ? `+${money(receipt[key])} bonus` : money(receipt[key]);
        }
        for (const [selector, score] of [['.receipt-speed', receipt.speedScore], ['.receipt-comfort', receipt.comfortScore]] as const) {
          const meter = receiptView.querySelector<HTMLElement>(`${selector} .receipt-meter`)!;
          meter.setAttribute('aria-valuenow', String(score));
          meter.style.setProperty('--score', String(score / 100));
        }
      }
    }
    dismiss.hidden = current.remaining !== null;
    const waiting = game.notifications.items.length - 1;
    stack.querySelector('.notification-count')!.textContent = waiting ? `${waiting} waiting` : '';
    stack.querySelector('.notification-lifetime')!.textContent = current.remaining === null ? '' : 'Auto dismiss';
    footer.hidden = current.remaining === null && waiting === 0;
    const timer = stack.querySelector<HTMLElement>('.notification-timer')!;
    timer.hidden = current.remaining === null;
    timer.style.setProperty('--remaining', String(current.remaining === null ? 1 : current.remaining / current.duration!));
    game.notificationsVisible = visible();
  }
  return { refresh, visible };
}
