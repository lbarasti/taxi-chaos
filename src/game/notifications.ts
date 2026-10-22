export type NotificationCategory = 'newsroom' | 'movement' | 'services' | 'danger' | 'dispatch';
export type NotificationKind = '' | 'danger' | 'success';
export type NotificationOptions = { category?: NotificationCategory; duration?: number | null };
export type Notification = {
  id: number; message: string; kind: NotificationKind; category: NotificationCategory;
  duration: number | null; remaining: number | null;
};

/** Newest first. Only the exposed card spends its own display time. */
export class NotificationStack {
  private serial = 0;
  private cards: Notification[] = [];
  get items(): readonly Notification[] { return this.cards; }
  get current(): Notification | undefined { return this.cards[0]; }

  push(message: string, kind: NotificationKind = '', options: NotificationOptions = {}) {
    const duration = options.duration === null ? null : Math.max(0.1, options.duration ?? 4);
    const category = options.category ?? (kind === 'danger' ? 'danger' : 'dispatch');
    // Holding an unavailable action must not bury the same instruction repeatedly.
    const duplicate = this.cards.findIndex(card => card.message === message && card.category === category && card.kind === kind);
    if (duplicate >= 0) this.cards.splice(duplicate, 1);
    this.cards.unshift({ id: ++this.serial, message, kind, category, duration, remaining: duration });
  }

  dismiss(id = this.current?.id) {
    const index = this.cards.findIndex(card => card.id === id);
    if (index >= 0) this.cards.splice(index, 1);
  }

  tick(seconds: number, visible = true) {
    const card = this.current;
    if (!visible || !card || card.remaining === null || !Number.isFinite(seconds) || seconds <= 0) return;
    card.remaining = Math.max(0, card.remaining - seconds);
    // Spare time never spills onto a card that was covered during this tick.
    if (card.remaining <= 1e-9) this.dismiss(card.id);
  }

  clear() { this.cards = []; }
}
