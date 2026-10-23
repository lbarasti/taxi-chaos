import type { Game } from '../game/game';
import type { NotificationCategory, TripReceipt } from '../game/notifications';
import { bindFareMeters, fareMetersMarkup, money, signedMoney } from './fare-meters';

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
        <strong class="receipt-total" data-receipt="payout"></strong>
        <div class="receipt-breakdown"><span class="receipt-base"></span><span>Adjustment <span data-receipt="adjustment"></span></span></div>
        <small class="receipt-floor" hidden>Minimum payout $0</small>
      </div>
      <div class="receipt-scores">${fareMetersMarkup()}</div>
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
  const refreshMeters = bindFareMeters(receiptView);
  let displayedId: number | undefined;
  let displayedCategory: NotificationCategory | undefined;
  let displayedReceipt: TripReceipt | undefined;
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
    card.className = `notification-card visible ${current.kind}${current.receipt ? ' receipt-card' : ''}`;
    card.dataset.category = current.category;
    const heading = stack.querySelector('.notification-category')!;
    heading.textContent = current.receipt ? current.receipt.type === 'parcel' ? 'Delivery complete' : 'Fare complete' : labels[current.category];
    heading.classList.toggle('receipt-title', !!current.receipt);
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
        receiptView.querySelector('.receipt-base')!.textContent = `Base ${money(receipt.baseFare)}`;
        receiptView.querySelector('[data-receipt="payout"]')!.textContent = money(receipt.payout);
        receiptView.querySelector('[data-receipt="adjustment"]')!.textContent = signedMoney(receipt.adjustment);
        receiptView.querySelector<HTMLElement>('.receipt-floor')!.hidden = receipt.baseFare + receipt.adjustment >= 0;
        refreshMeters(receipt);
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
