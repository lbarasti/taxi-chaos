import type { Game } from './game';
import type { AudioFX } from './audio';
import type { Difficulty } from './rules';
import type { Allegation } from './campaign/model';
import { bindAudioControls } from './audio-controls';
import { DrawerMenu } from './drawer-menu';
import { drawerMarkup, drawerParent, isDrawerPage } from './drawer-view';
import { splashPrompts, type InputDevice } from './splash';
import type { DrawerPage } from './drawer-markup';

// Owns only the title/pause drawer. Gameplay, garage and recovery stay in main.
export class GameDrawer {
  private page: DrawerPage = 'home';
  private transition?: Animation;
  private selections = new Map<DrawerPage, string>();
  private menu: DrawerMenu;
  private device: InputDevice = 'keyboard';
  constructor(private root: HTMLElement, private options: { game: () => Game; audio: AudioFX; saved: boolean; play: () => void }) {
    this.menu = new DrawerMenu(root, () => this.active && !this.transition && !root.closest('[inert]'));
    root.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
      if (!this.active || this.transition || !button || button.disabled) return;
      const game = options.game(), page = button.dataset.page;
      if (page && isDrawerPage(page)) { void this.open(page); return; }
      switch (button.id) {
        case 'start': options.play(); break;
        case 'sleep': if (game.sleep()) options.play(); break;
        case 'sleep-route': options.play(); game.garage(); break;
        case 'ordinary-fare': game.newJob(false, 'replaced', true); options.play(); break;
        case 'abandon-ride': game.newJob(false, 'shift'); this.refresh(); break;
        case 'notebook-route': options.play(); game.navigateNewsroom(); break;
      }
      if (button.dataset.submit && game.submitMaterial(button.dataset.submit)) this.refresh();
      if (button.dataset.publish && game.requestPublication(button.dataset.publish as Allegation)) this.refresh();
    });
    root.addEventListener('change', event => {
      const input = event.target as HTMLInputElement | HTMLSelectElement;
      if (input.id === 'gore-option') options.game().configure({ gore: (input as HTMLInputElement).checked });
      if (input.id === 'difficulty-option') options.game().configure({ difficulty: input.value as Difficulty });
    });
    root.addEventListener('input', event => {
      if ((event.target as HTMLElement).id === 'notebook-search') this.filterNotebook();
    });
  }
  get active() { const { mode } = this.options.game(); return mode === 'intro' || mode === 'paused'; }
  reset() {
    this.transition?.cancel(); this.transition = undefined;
    this.page = 'home'; this.selections.clear(); delete this.root.dataset.page;
  }
  refresh() {
    this.transition?.cancel(); this.transition = undefined;
    // Keep native controls mounted: changing a setting needs no DOM/focus rebuild.
    if (this.page === 'settings' && this.root.dataset.page === 'settings') {
      this.root.classList.add('splash-modal');
      const { settings } = this.options.game();
      this.root.querySelector<HTMLInputElement>('#gore-option')!.checked = settings.gore;
      this.root.querySelector<HTMLSelectElement>('#difficulty-option')!.value = settings.difficulty;
    } else this.paint();
  }
  async open(page: DrawerPage, { animate = true } = {}) {
    // Capture previews can choose a page before entering paused mode.
    if (!this.active) { this.page = page; return; }
    if (this.transition || page === this.page) return;
    const selection = this.menu.selectionId;
    if (selection) this.selections.set(this.page, selection);
    const backwards = drawerParent(this.page) === page;
    const content = this.root.querySelector('.drawer-page');
    if (animate && content && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const current = getComputedStyle(content);
      const animation = content.animate([{ opacity: current.opacity, transform: current.transform }, { opacity: 0, transform: `translateX(${backwards ? 14 : -14}px)` }], { duration: 120, easing: 'ease-in', fill: 'forwards' });
      this.transition = animation;
      try { await animation.finished; } catch { return; }
      if (this.transition !== animation) return;
      this.transition = undefined;
    }
    if (!this.active) return;
    this.page = page;
    this.paint(animate ? backwards ? -1 : 1 : 0);
  }
  back() {
    const parent = drawerParent(this.page);
    if (!parent) return false;
    void this.open(parent); return true;
  }
  move(delta: number) { if (this.active && !this.transition) this.menu.move(delta); }
  activate() { if (this.active && !this.transition) this.menu.activate(); }
  handleKey(event: KeyboardEvent) {
    if (!this.active) return false;
    if (this.transition) { event.preventDefault(); return true; }
    if (event.code === 'Escape' && drawerParent(this.page)) {
      event.preventDefault(); if (!event.repeat) this.back(); return true;
    }
    return this.menu.handleKey(event);
  }
  setInputDevice(device: InputDevice) {
    this.device = device;
    const prompts = this.root.querySelector('#splash-prompts'), hint = this.root.querySelector('#menu-hint');
    if (prompts) prompts.innerHTML = splashPrompts(device);
    if (hint) hint.textContent = device === 'touch' ? 'Tap to select · Tap again to confirm' : device === 'xbox' || device === 'playstation' ? `D-pad Select · ${device === 'playstation' ? '×' : 'A'} Confirm` : '↑ ↓ Select · Enter Confirm';
  }
  private paint(direction = 0) {
    const samePage = this.root.dataset.page === this.page;
    const selected = samePage ? this.menu.selectionId : this.selections.get(this.page);
    const scroll = samePage ? this.root.scrollTop : 0;
    const search = samePage ? this.root.querySelector<HTMLInputElement>('#notebook-search')?.value : '';
    this.root.dataset.page = this.page;
    this.root.classList.add('splash-modal');
    this.root.classList.toggle('notebook-modal', this.page === 'notebook');
    this.root.innerHTML = `<div class="drawer-page${direction ? ' drawer-entering' : ''}" style="--drawer-direction:${direction}">${drawerMarkup(this.page, { game: this.options.game(), audio: this.options.audio, saved: this.options.saved })}</div>`;
    if (search) { this.root.querySelector<HTMLInputElement>('#notebook-search')!.value = search; this.filterNotebook(); }
    bindAudioControls(this.root, this.options.audio);
    this.setInputDevice(this.device);
    this.menu.reset(selected);
    this.root.scrollTop = scroll;
    if (!samePage) this.root.querySelector<HTMLElement>('[data-selected]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  private filterNotebook() {
    const query = this.root.querySelector<HTMLInputElement>('#notebook-search')!.value.toLocaleLowerCase();
    this.root.querySelectorAll<HTMLElement>('[data-record]').forEach(article => { article.hidden = !article.textContent?.toLocaleLowerCase().includes(query); });
  }
}
