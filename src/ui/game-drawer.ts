import type { Game } from '../game/game';
import type { AudioFX } from '../audio/audio';
import { createSettings, type SettingsControls } from './settings';
import { bindSettingControls } from './setting-controls';
import { isNewsroomSection, type NewsroomSection } from '../campaign/newsroom-view';
import { DrawerMenu } from './drawer-menu';
import { drawerMarkup, drawerParent, isDrawerPage } from './drawer-view';
import { splashPrompts } from './splash';
import { menuHintText, type InputDevice } from './menu-hint';
import type { DrawerPage } from './drawer-markup';

// Shift and the newsroom sit on one horizontal wheel; each shows the other as its neighbour.
const panelWheel = ['shift', 'newsroom'] as const satisfies readonly DrawerPage[];
type WheelEffect = { outgoing: HTMLElement; rect: DOMRect; step: number };

// The title, pause and HUD newsroom entry share one mobile-friendly drawer.
export class GameDrawer {
  private settings: SettingsControls;
  private refreshSettings = () => {};
  private page: DrawerPage = 'home';
  private loadFailed = false;
  private editionDay?: number;
  private articleId?: string;
  private publicationBack: 'newsroom' | 'finale' = 'newsroom';
  private notebookSelected = false;
  private newsroomSection: NewsroomSection | null = null;
  private transition?: Animation;
  private selections = new Map<DrawerPage, string>();
  private menu: DrawerMenu;
  private device: InputDevice = 'keyboard';
  constructor(private root: HTMLElement, private options: { game: () => Game; audio: AudioFX; saved: () => boolean; play: () => void; returnToTitle: () => void; newGame: () => void; loadGame: (day: number) => boolean }) {
    this.settings = createSettings(options.game, options.audio);
    this.menu = new DrawerMenu(root, () => this.active && !this.transition && !root.closest('[inert]'));
    root.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
      if (!this.active || this.transition || !button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
      const game = options.game(), page = button.dataset.page;
      if (this.page === 'load-game' && game.mode === 'intro' && /^load-day-\d+$/.test(button.id)) {
        if (!options.loadGame(Number(button.id.slice('load-day-'.length)))) { this.loadFailed = true; this.refresh(); }
        return;
      }
      if (page === 'publications') { this.openPublications(this.page === 'finale'); return; }
      if (page && isDrawerPage(page)) { void this.open(page, button.hasAttribute('data-wheel') ? { direction: 1 } : {}); return; }
      if (button.dataset.edition) {
        this.selectEdition(Number(button.dataset.edition)); this.refresh();
        this.root.scrollTop = 0; this.menu.reset('publication-back');
        return;
      }
      if (this.page === 'publications' && button.dataset.readArticle && game.save.campaign.editions.find(edition => edition.day === this.editionDay)?.articles.includes(button.dataset.readArticle)) {
        this.articleId = button.dataset.readArticle;
        this.refresh(); this.root.scrollTop = 0; this.menu.reset('publication-front');
        return;
      }
      if (this.page === 'newsroom' && button.dataset.newsroomSection && isNewsroomSection(button.dataset.newsroomSection)) {
        this.newsroomSection = button.dataset.newsroomSection;
        this.refresh();
        const detail = this.root.querySelector<HTMLElement>('.drawer-detail');
        if (detail) {
          this.menu.focusScope(detail);
          detail.scrollTop = 0;
          if (!matchMedia('(min-width:1000px)').matches) detail.scrollIntoView({ block: 'start' });
        }
        return;
      }
      if (this.page === 'shift' && button.id === 'open-notebook' && game.campaignEnabled) {
        this.selectNotebook(); return;
      }
      switch (button.id) {
        case 'publication-front': this.frontPage(); break;
        case 'arcade-continue': if (game.continueArcade()) options.play(); break;
        case 'start': options.play(); break;
        case 'return-to-title': options.returnToTitle(); break;
        case 'new-game':
          if (game.mode !== 'intro') break;
          if (options.saved()) { this.selections.delete('new-game'); void this.open('new-game'); }
          else options.newGame();
          break;
        case 'confirm-new-game': if (this.page === 'new-game' && game.mode === 'intro') options.newGame(); break;
        case 'sleep':
          if (!game.garageNear) {
            options.play();
            if (!game.navToGarage) game.garage();
          } else if (game.sleep()) options.play();
          break;
        case 'ordinary-fare': game.newJob(false, 'replaced', true); options.play(); game.answerDispatch(); break;
        case 'abandon-ride': game.newJob(false, 'shift'); this.refresh(); break;
        case 'notebook-route': options.play(); game.navigateNewsroom(); break;
        case 'newsroom-menu': this.focusNewsroomMenu(); break;
        case 'shift-menu': this.focusShiftMenu(); break;
      }
      if (button.dataset.submit && game.submitMaterial(button.dataset.submit)) this.refresh();
    });
  }
  get active() { const { mode } = this.options.game(); return mode === 'intro' || mode === 'paused'; }
  openShift() {
    const game = this.options.game();
    if (game.mode !== 'playing') return;
    this.page = 'shift'; this.notebookSelected = false;
    game.setMode('paused');
  }
  get showingShift() { return this.active && this.page === 'shift'; }
  openNewsroom() {
    const game = this.options.game();
    if (game.mode !== 'playing' || !game.campaignEnabled) return;
    this.page = 'newsroom';
    this.newsroomSection = null;
    game.setMode('paused');
  }
  get showingFinale() { return this.active && this.page === 'finale'; }
  openFinale() {
    const game = this.options.game();
    if (!game.campaignEnabled || !game.save.campaign.finished || (game.mode !== 'playing' && game.mode !== 'paused')) return;
    this.page = 'finale';
    if (game.mode === 'playing') game.setMode('paused');
    else this.refresh();
  }
  openPublications(fromFinale = false) {
    const game = this.options.game();
    if (!game.campaignEnabled || (game.mode !== 'playing' && game.mode !== 'paused')) return;
    this.publicationBack = fromFinale ? 'finale' : 'newsroom';
    const editions = game.save.campaign.editions;
    this.selectEdition((fromFinale ? editions.at(-1) : [...editions].reverse().find(edition => !edition.read) ?? editions.at(-1))?.day);
    if (game.mode === 'playing') { this.page = 'publications'; game.setMode('paused'); }
    else { void this.open('publications'); }
  }
  private selectEdition(day?: number) {
    this.editionDay = day;
    this.articleId = undefined;
    if (day !== undefined) this.options.game().readEdition(day);
  }
  reset() {
    this.transition?.cancel(); this.transition = undefined;
    this.loadFailed = false;
    this.page = 'home'; this.notebookSelected = false; this.selections.clear(); delete this.root.dataset.page;
    this.newsroomSection = null; this.editionDay = undefined; this.articleId = undefined; this.publicationBack = 'newsroom';
  }
  refresh() {
    this.transition?.cancel(); this.transition = undefined;
    this.root.classList.add('splash-modal');
    if (this.page === 'settings' && this.root.dataset.page === 'settings') this.refreshSettings();
    else this.paint();
  }
  async open(page: DrawerPage, { animate = true, direction }: { animate?: boolean; direction?: number } = {}) {
    // Capture previews can choose a page before entering paused mode.
    if (!this.active) { this.page = page; return; }
    if (this.transition || page === this.page) return;
    const selection = this.menu.selectionId;
    if (selection) this.selections.set(this.page, selection);
    const backwards = direction !== undefined ? direction < 0 : drawerParent(this.page) === page;
    const content = this.root.querySelector<HTMLElement>('.drawer-page');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Wheel steps are a carousel: both pages travel together, so the old title
    // slides out while the new one rolls in from the other side.
    if (animate && direction !== undefined && content && !reducedMotion) {
      this.page = page;
      if (page === 'shift') this.notebookSelected = false;
      if (page === 'newsroom') this.newsroomSection = null;
      this.paint(backwards ? -1 : 1, this.wheelEffect(content));
      return;
    }
    if (animate && content && !reducedMotion) {
      const current = getComputedStyle(content);
      const animation = content.animate([{ opacity: current.opacity, transform: current.transform }, { opacity: 0, transform: `translateX(${backwards ? 14 : -14}px)` }], { duration: 120, easing: 'ease-in', fill: 'forwards' });
      this.transition = animation;
      try { await animation.finished; } catch { return; }
      if (this.transition !== animation) return;
      this.transition = undefined;
    }
    if (!this.active) return;
    this.page = page;
    if (page === 'shift') this.notebookSelected = false;
    if (page === 'newsroom') this.newsroomSection = null;
    this.paint(animate ? backwards ? -1 : 1 : 0);
  }
  back() {
    if (this.transition) return true;
    if (this.page === 'shift') {
      if (this.notebookSelected) this.focusShiftMenu();
      else this.options.play();
      return true;
    }
    if (this.page === 'finale') { if (this.options.game().save.campaign.endingSeen) void this.open('home'); return true; }
    if (this.page === 'publications') { if (this.articleId) this.frontPage(); else void this.open(this.publicationBack); return true; }
    if (this.page === 'newsroom') {
      if (this.newsroomSection) this.focusNewsroomMenu();
      else this.options.play();
      return true;
    }
    const parent = drawerParent(this.page);
    if (!parent) return false;
    void this.open(parent); return true;
  }
  move(delta: number) { if (this.active && !this.transition) this.menu.move(delta); }
  /** The two campaign panels form a closed horizontal wheel. */
  private get wheelPage() { return this.page === 'shift' || this.page === 'newsroom'; }
  private get wheelVisible() { return this.active && this.options.game().campaignEnabled && this.wheelPage && !(this.page === 'shift' ? this.notebookSelected : this.newsroomSection); }
  panel(delta: number) {
    if (!this.wheelVisible || this.transition) return;
    const index = this.page === 'shift' ? 0 : 1, direction = delta < 0 ? -1 : 1;
    const next = (index + direction + panelWheel.length) % panelWheel.length;
    if (next === index) return;
    void this.open(panelWheel[next]!, { direction });
  }
  adjust(delta: number) {
    if (!this.active || this.transition) return;
    // Ranges keep their native value editing; everywhere else left/right turns the wheel.
    if (this.wheelVisible && !(document.activeElement instanceof HTMLInputElement) && !(document.activeElement instanceof HTMLSelectElement)) { this.panel(delta); return; }
    this.menu.adjust(delta);
  }
  activate() { if (this.active && !this.transition) this.menu.activate(); }
  handleKey(event: KeyboardEvent) {
    if (!this.active) return false;
    if (this.transition) { event.preventDefault(); return true; }
    if ((event.code === 'ArrowLeft' || event.code === 'ArrowRight') && this.wheelVisible) {
      event.preventDefault(); if (!event.repeat) this.panel(event.code === 'ArrowRight' ? 1 : -1); return true;
    }
    if (event.code === 'Escape' && (this.page === 'newsroom' || this.page === 'finale' || drawerParent(this.page))) {
      event.preventDefault(); if (!event.repeat) this.back(); return true;
    }
    return this.menu.handleKey(event);
  }
  setInputDevice(device: InputDevice) {
    this.device = device;
    const prompts = this.root.querySelector('#splash-prompts');
    if (prompts) prompts.innerHTML = splashPrompts(device);
    this.paintHint();
  }
  private paintHint() {
    const hint = this.root.querySelector('#menu-hint');
    if (hint) hint.textContent = menuHintText(this.device, this.wheelVisible);
  }
  private frontPage() {
    const selected = this.articleId;
    this.articleId = undefined;
    this.refresh(); this.root.scrollTop = 0; this.menu.reset(selected ? `read-article-${selected}` : 'publication-back');
    this.root.querySelector('[data-selected]')?.scrollIntoView({ block: 'nearest' });
  }
  private paint(direction = 0, wheel?: WheelEffect) {
    const samePage = this.root.dataset.page === this.page;
    const selected = samePage ? this.menu.selectionId : this.selections.get(this.page);
    const scroll = samePage ? this.root.scrollTop : 0;
    const detail = this.root.querySelector<HTMLElement>('.drawer-detail');
    const detailFocused = samePage && detail?.contains(document.activeElement);
    const detailScroll = samePage ? detail?.scrollTop ?? 0 : 0;
    const menuScroll = samePage ? this.root.querySelector('.drawer-menu-panel')?.scrollTop ?? 0 : 0;
    this.root.dataset.page = this.page;
    this.root.classList.add('splash-modal');
    this.root.innerHTML = `<div class="drawer-page${direction && !wheel ? ' drawer-entering' : ''}" style="--drawer-direction:${direction}">${drawerMarkup(this.page, { game: this.options.game(), settings: this.settings, saved: this.options.saved(), newsroomSection: this.newsroomSection, notebookSelected: this.notebookSelected, editionDay: this.editionDay, publicationBack: this.publicationBack, articleId: this.articleId, loadFailed: this.loadFailed })}</div>`;
    this.refreshSettings = bindSettingControls(this.root, Object.values(this.settings));
    this.setInputDevice(this.device);
    this.menu.reset(selected);
    const nextDetail = this.root.querySelector<HTMLElement>('.drawer-detail');
    if (nextDetail && (!samePage || !detail)) nextDetail.classList.add('drawer-detail-entering');
    if (detailFocused && nextDetail && !nextDetail.contains(document.activeElement)) this.menu.focusScope(nextDetail);
    if (nextDetail) nextDetail.scrollTop = detailScroll;
    const menuPanel = this.root.querySelector('.drawer-menu-panel');
    if (menuPanel) menuPanel.scrollTop = menuScroll;
    this.root.scrollTop = scroll;
    if (!samePage) this.root.querySelector<HTMLElement>('[data-selected]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    else if (detailFocused) nextDetail?.querySelector<HTMLElement>('[data-selected]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (wheel) this.carousel(wheel, direction < 0 ? -1 : 1);
  }
  /** Capture what the wheel needs to roll the old page into the new one. */
  private wheelEffect(content: HTMLElement): WheelEffect {
    const head = content.querySelector<HTMLElement>('.drawer-head');
    const title = head?.querySelector<HTMLElement>('#modal-title');
    const peek = head?.querySelector<HTMLElement>('.drawer-wheel-next');
    const step = title && peek ? peek.getBoundingClientRect().left - title.getBoundingClientRect().left : 0;
    return { outgoing: content.cloneNode(true) as HTMLElement, rect: content.getBoundingClientRect(), step };
  }
  /**
   * The visible neighbour title is the page you are about to see, so it must
   * land under the cursor: both header strips travel exactly one title apart,
   * while the bodies hand over beneath them.
   */
  private carousel({ outgoing, rect, step }: WheelEffect, direction: -1 | 1) {
    const incoming = this.root.querySelector<HTMLElement>('.drawer-page');
    if (!incoming || !rect.width) return;
    const modal = this.root.getBoundingClientRect(), page = incoming.getBoundingClientRect();
    const stage = document.createElement('div');
    stage.className = 'drawer-carousel';
    stage.style.cssText = `position:fixed;left:${modal.left}px;top:${modal.top}px;width:${modal.width}px;height:${modal.height}px;overflow:hidden;pointer-events:none;z-index:2`;
    const layer = (node: HTMLElement, box: DOMRect) => {
      node.classList.remove('drawer-entering');
      const head = node.querySelector<HTMLElement>('.drawer-head');
      if (head) head.style.visibility = 'hidden';
      node.style.cssText = `position:absolute;margin:0;top:${box.top - modal.top}px;left:${box.left - modal.left}px;width:${box.width}px;height:${box.height}px;will-change:transform,opacity`;
      stage.appendChild(node);
      return node;
    };
    const leaving = layer(outgoing, rect), arriving = layer(incoming.cloneNode(true) as HTMLElement, page);
    incoming.style.visibility = 'hidden';
    this.root.appendChild(stage);
    const timing = { duration: 420, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' } as const;
    const quiet = { duration: 420, easing: 'linear', fill: 'forwards' } as const;
    const frames: Animation[] = [
      // One body at a time: the old one is gone before the new one appears.
      arriving.animate([{ opacity: 0, transform: `translateX(${32 * direction}px)` }, { opacity: 0, transform: `translateX(${32 * direction}px)`, offset: .55 }, { opacity: 1, transform: 'translateX(0)' }], quiet),
      leaving.animate([{ opacity: 1 }, { opacity: 0 }], { ...quiet, duration: 260 }),
    ];
    const source = incoming.querySelector<HTMLElement>('.drawer-head');
    if (step > 0 && source) {
      const head = source.getBoundingClientRect();
      const strip = (from: HTMLElement) => {
        const clone = from.querySelector('.drawer-head')!.cloneNode(true) as HTMLElement;
        clone.style.cssText = `position:absolute;margin:0;top:${head.top - modal.top}px;left:${page.left - modal.left}px;width:${page.width}px;height:${head.height}px;will-change:transform,opacity`;
        stage.appendChild(clone);
        return clone;
      };
      const next = strip(incoming), previous = strip(outgoing);
      const travel = step * direction;
      frames.push(
        next.animate([{ transform: `translateX(${travel}px)` }, { transform: 'translateX(0)' }], timing),
        previous.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-travel}px)` }], timing),
        // Hold the leaving strip solid until its dim neighbour has landed, then fade.
        previous.animate([{ opacity: 1 }, { opacity: 1, offset: .72 }, { opacity: 0 }], timing),
      );
    }
    this.transition = frames[0];
    let settled = false;
    const settle = () => {
      if (settled) return; settled = true;
      stage.remove();
      frames.forEach(frame => frame.cancel());
      incoming.style.visibility = '';
      if (this.transition === frames[0]) this.transition = undefined;
    };
    frames[0].onfinish = settle; frames[0].oncancel = settle;
  }
  selectNotebook() {
    if (this.page !== 'shift' || !this.options.game().campaignEnabled) return;
    this.notebookSelected = true;
    this.refresh();
    const detail = this.root.querySelector<HTMLElement>('#shift-detail');
    if (detail) {
      this.menu.focusScope(detail); detail.scrollTop = 0;
      if (!matchMedia('(min-width:1000px)').matches) detail.scrollIntoView({ block: 'start' });
    }
  }
  private focusShiftMenu() {
    void this.closeDetail('open-notebook');
  }
  private focusNewsroomMenu() {
    void this.closeDetail(`newsroom-open-${this.newsroomSection}`);
  }
  private async closeDetail(menuId: string) {
    if (this.transition) return;
    const menuItem = this.root.querySelector<HTMLElement>(`#${menuId}`);
    menuItem?.focus({ preventScroll: true });
    const detail = this.root.querySelector<HTMLElement>('.drawer-detail');
    if (detail && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      detail.inert = true;
      const animation = detail.animate([{ opacity: getComputedStyle(detail).opacity }, { opacity: 0 }], { duration: 160, easing: 'ease-out', fill: 'forwards' });
      this.transition = animation;
      try { await animation.finished; } catch { return; }
      if (this.transition !== animation) return;
      this.transition = undefined;
    }
    this.notebookSelected = false; this.newsroomSection = null;
    // Keep the menu mounted: repainting it restarts its highlight transitions.
    detail?.remove();
    menuItem?.setAttribute('aria-pressed', 'false');
    menuItem?.focus({ preventScroll: true });
    this.paintHint();
    if (!matchMedia('(min-width:1000px)').matches) this.root.scrollTop = 0;
    menuItem?.scrollIntoView({ block: 'nearest' });
  }
}
