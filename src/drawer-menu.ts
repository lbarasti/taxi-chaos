// One selection model for the title screen and every page of the pause drawer.
// Touch confirmation is armed by a tap, never by autofocus or synthetic hover.
export class DrawerMenu {
  private selected: HTMLElement | null = null;
  private touchArmed: HTMLElement | null = null;
  private pointerType = '';
  constructor(private root: HTMLElement, private enabled: () => boolean) {
    root.addEventListener('pointerdown', event => {
      if (!this.enabled()) return;
      this.pointerType = event.pointerType;
      const item = this.item(event.target);
      if (event.pointerType === 'touch' && item?.matches('button, a')) {
        // Keep the browser's compatibility mouse focus from scrolling the drawer
        // between touchend and click. Panning still uses native touch-action.
        event.preventDefault(); this.select(item);
      }
    }, true);
    root.addEventListener('pointermove', event => {
      if (!this.enabled()) return;
      if (event.pointerType !== 'mouse') return;
      const item = this.item(event.target);
      if (item && item !== this.selected) this.select(item);
    });
    root.addEventListener('focusin', event => {
      if (!this.enabled()) return;
      const item = this.item(event.target);
      if (item) this.select(item);
    });
    root.addEventListener('click', event => {
      if (!this.enabled()) return;
      const item = this.item(event.target);
      if (!item) return;
      const touch = event.detail > 0 && (('pointerType' in event && event.pointerType === 'touch') || this.pointerType === 'touch');
      this.pointerType = '';
      // Inputs stay native: tapping a checkbox or dragging a slider is an edit.
      if (touch && item.matches('button, a') && this.touchArmed !== item) {
        event.preventDefault(); event.stopImmediatePropagation();
        this.select(item); this.touchArmed = item;
      } else { this.select(item); this.touchArmed = null; }
    }, true);
  }
  private items() {
    return Array.from(this.root.querySelectorAll<HTMLElement>('[data-setting], button:not(:disabled):not([data-step]), input:not(:disabled), select:not(:disabled), a[href]'))
      .filter(item => (!item.closest('[data-setting]') || item.matches('[data-setting]')) && !item.hidden && item.getClientRects().length > 0);
  }
  private item(target: EventTarget | null) {
    const item = target instanceof Element ? (target.closest<HTMLElement>('[data-setting]') ?? target.closest<HTMLElement>('button, input, select, a[href]')) : null;
    return item && this.root.contains(item) && !item.matches(':disabled') && item.getClientRects().length ? item : null;
  }
  private select(item: HTMLElement) {
    if (item !== this.selected) this.touchArmed = null;
    this.root.querySelectorAll('[data-selected]').forEach(element => { element.removeAttribute('data-selected'); element.removeAttribute('aria-current'); });
    this.selected = item;
    item.setAttribute('data-selected', 'true');
    if (item.matches('button, a')) item.setAttribute('aria-current', 'true');
    item.focus({ preventScroll: true });
  }
  get selectionId() { return this.selected?.id; }
  reset(id?: string) {
    this.touchArmed = null; this.pointerType = '';
    const items = this.items();
    const item = items.find(item => item.id === id) ?? items[0];
    this.selected = null;
    if (item) this.select(item);
  }
  move(delta: number) {
    const items = this.items();
    if (!items.length) return;
    this.touchArmed = null;
    const current = items.indexOf(this.selected!);
    this.select(items[(Math.max(0, current) + delta + items.length) % items.length]);
    this.selected?.scrollIntoView({ block: 'nearest' });
  }
  adjust(delta: number) {
    this.selected?.querySelector<HTMLButtonElement>(`[data-step="${delta}"]`)?.click();
  }
  activate() { if (this.selected?.matches('[data-setting]')) this.adjust(1); else this.selected?.click(); }
  handleKey(event: KeyboardEvent) {
    if (this.selected?.matches('[data-setting]') && ['ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault(); this.adjust(event.code === 'ArrowLeft' ? -1 : 1); return true;
    }
    const native = event.target instanceof Element ? event.target.closest('input, select') : null;
    // Native value editing uses left/right on ranges and all arrows on selects.
    if (native?.matches('select') && event.code !== 'Tab') return false;
    if (native?.matches('input') && !['checkbox', 'range'].includes((native as HTMLInputElement).type) && event.code !== 'Tab') return false;
    if (event.code === 'Tab' || event.code === 'ArrowUp' || event.code === 'ArrowDown' || (!native && ['ArrowLeft', 'ArrowRight'].includes(event.code))) {
      event.preventDefault();
      this.move(event.code === 'ArrowUp' || event.code === 'ArrowLeft' || event.code === 'Tab' && event.shiftKey ? -1 : 1);
      return true;
    }
    if (event.code === 'Enter' || event.code === 'Space' && !native) {
      event.preventDefault(); if (!event.repeat) this.activate(); return true;
    }
    return false;
  }
}
