import type { Game } from '../game/game';
import type { AudioFX } from '../audio/audio';
import { createSettings, type SettingsControls } from './settings';
import { bindSettingControls } from './setting-controls';
import type { Allegation } from '../campaign/model';
import { isNewsroomSection, type NewsroomSection } from '../campaign/newsroom-view';
import { DrawerMenu } from './drawer-menu';
import { drawerMarkup, drawerParent, isDrawerPage } from './drawer-view';
import { splashPrompts, type InputDevice } from './splash';
import type { DrawerPage } from './drawer-markup';

// The title, pause and HUD newsroom entry share one mobile-friendly drawer.
export class GameDrawer {
  private settings: SettingsControls;
  private refreshSettings = () => {};
  private page: DrawerPage = 'home';
  private editionDay?: number;
  private articleId?: string;
  private publicationBack: 'newsroom' | 'finale' = 'newsroom';
  private entry: 'home' | 'newsroom' = 'home';
  private newsroomSection: NewsroomSection | null = null;
  private transition?: Animation;
  private selections = new Map<DrawerPage, string>();
  private menu: DrawerMenu;
  private device: InputDevice = 'keyboard';
  constructor(private root: HTMLElement, private options: { game: () => Game; audio: AudioFX; saved: boolean; play: () => void }) {
    this.settings = createSettings(options.game, options.audio);
    this.menu = new DrawerMenu(root, () => this.active && !this.transition && !root.closest('[inert]'));
    root.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
      if (!this.active || this.transition || !button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
      const game = options.game(), page = button.dataset.page;
      if (page === 'publications') { this.openPublications(this.page === 'finale'); return; }
      if (page && isDrawerPage(page)) { void this.open(page); return; }
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
        const detail = this.root.querySelector<HTMLElement>('#newsroom-detail');
        if (detail) {
          this.menu.focusScope(detail);
          detail.scrollTop = 0;
          if (!matchMedia('(min-width:1000px)').matches) detail.scrollIntoView({ block: 'start' });
        }
        return;
      }
      switch (button.id) {
        case 'publication-front': this.frontPage(); break;
        case 'arcade-continue': if (game.continueArcade()) options.play(); break;
        case 'start': options.play(); break;
        case 'sleep': if (game.sleep()) options.play(); break;
        case 'sleep-route': options.play(); game.garage(); break;
        case 'ordinary-fare': game.newJob(false, 'replaced', true); options.play(); break;
        case 'abandon-ride': game.newJob(false, 'shift'); this.refresh(); break;
        case 'notebook-route': options.play(); game.navigateNewsroom(); break;
        case 'newsroom-menu': this.focusNewsroomMenu(); break;
      }
      if (button.dataset.submit && game.submitMaterial(button.dataset.submit)) this.refresh();
      if (button.dataset.publish && game.requestPublication(button.dataset.publish as Allegation)) this.refresh();
    });
    root.addEventListener('input', event => {
      if ((event.target as HTMLElement).id === 'notebook-search') this.filterNotebook();
    });
  }
  get active() { const { mode } = this.options.game(); return mode === 'intro' || mode === 'paused'; }
  openShift() {
    const game = this.options.game();
    if (game.mode !== 'playing') return;
    this.page = 'shift'; this.entry = 'home';
    game.setMode('paused');
  }
  get showingShift() { return this.active && this.page === 'shift'; }
  openNewsroom() {
    const game = this.options.game();
    if (game.mode !== 'playing' || !game.campaignEnabled) return;
    this.entry = this.page = 'newsroom';
    this.newsroomSection = null;
    game.setMode('paused');
  }
  get showingFinale() { return this.active && this.page === 'finale'; }
  openFinale() {
    const game = this.options.game();
    if (!game.campaignEnabled || !game.save.campaign.finished || (game.mode !== 'playing' && game.mode !== 'paused')) return;
    this.page = 'finale'; this.entry = 'home';
    if (game.mode === 'playing') game.setMode('paused');
    else this.refresh();
  }
  openPublications(fromFinale = false) {
    const game = this.options.game();
    if (!game.campaignEnabled || (game.mode !== 'playing' && game.mode !== 'paused')) return;
    this.publicationBack = fromFinale ? 'finale' : 'newsroom';
    const editions = game.save.campaign.editions;
    this.selectEdition((fromFinale ? editions.at(-1) : [...editions].reverse().find(edition => !edition.read) ?? editions.at(-1))?.day);
    if (game.mode === 'playing') { this.entry = 'newsroom'; this.page = 'publications'; game.setMode('paused'); }
    else { void this.open('publications'); }
  }
  private selectEdition(day?: number) {
    this.editionDay = day;
    this.articleId = undefined;
    if (day !== undefined) this.options.game().readEdition(day);
  }
  reset() {
    this.transition?.cancel(); this.transition = undefined;
    this.page = this.entry = 'home'; this.selections.clear(); delete this.root.dataset.page;
    this.newsroomSection = null; this.editionDay = undefined; this.articleId = undefined; this.publicationBack = 'newsroom';
  }
  refresh() {
    this.transition?.cancel(); this.transition = undefined;
    this.root.classList.add('splash-modal');
    if (this.page === 'settings' && this.root.dataset.page === 'settings') this.refreshSettings();
    else this.paint();
  }
  async open(page: DrawerPage, { animate = true } = {}) {
    // Capture previews can choose a page before entering paused mode.
    if (!this.active) { this.page = page; return; }
    if (this.transition || page === this.page) return;
    const selection = this.menu.selectionId;
    if (selection) this.selections.set(this.page, selection);
    const backwards = drawerParent(this.page, this.entry) === page;
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
    if (this.page === 'shift') { this.options.play(); return true; }
    if (this.page === 'finale') { if (this.options.game().save.campaign.endingSeen) void this.open('home'); return true; }
    if (this.page === 'publications') { if (this.articleId) this.frontPage(); else void this.open(this.publicationBack); return true; }
    if (this.page === 'newsroom') {
      if (this.root.querySelector('#newsroom-detail')?.contains(document.activeElement)) this.focusNewsroomMenu();
      else this.options.play();
      return true;
    }
    const parent = drawerParent(this.page, this.entry);
    if (!parent) return false;
    void this.open(parent); return true;
  }
  move(delta: number) { if (this.active && !this.transition) this.menu.move(delta); }
  adjust(delta: number) { if (this.active && !this.transition) this.menu.adjust(delta); }
  activate() { if (this.active && !this.transition) this.menu.activate(); }
  handleKey(event: KeyboardEvent) {
    if (!this.active) return false;
    if (this.transition) { event.preventDefault(); return true; }
    if (event.code === 'Escape' && (this.page === 'newsroom' || this.page === 'finale' || drawerParent(this.page, this.entry))) {
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
  private frontPage() {
    const selected = this.articleId;
    this.articleId = undefined;
    this.refresh(); this.root.scrollTop = 0; this.menu.reset(selected ? `read-article-${selected}` : 'publication-back');
    this.root.querySelector('[data-selected]')?.scrollIntoView({ block: 'nearest' });
  }
  private paint(direction = 0) {
    const samePage = this.root.dataset.page === this.page;
    const selected = samePage ? this.menu.selectionId : this.selections.get(this.page);
    const scroll = samePage ? this.root.scrollTop : 0;
    const detail = this.root.querySelector<HTMLElement>('#newsroom-detail');
    const detailFocused = samePage && detail?.contains(document.activeElement);
    const detailScroll = samePage ? detail?.scrollTop ?? 0 : 0;
    const menuScroll = samePage ? this.root.querySelector('.newsroom-menu-panel')?.scrollTop ?? 0 : 0;
    const search = samePage ? this.root.querySelector<HTMLInputElement>('#notebook-search')?.value : '';
    this.root.dataset.page = this.page;
    this.root.classList.add('splash-modal');
    this.root.classList.toggle('notebook-modal', this.page === 'notebook');
    this.root.innerHTML = `<div class="drawer-page${direction ? ' drawer-entering' : ''}" style="--drawer-direction:${direction}">${drawerMarkup(this.page, { game: this.options.game(), settings: this.settings, saved: this.options.saved, entry: this.entry, newsroomSection: this.newsroomSection, editionDay: this.editionDay, publicationBack: this.publicationBack, articleId: this.articleId })}</div>`;
    if (search) { this.root.querySelector<HTMLInputElement>('#notebook-search')!.value = search; this.filterNotebook(); }
    this.refreshSettings = bindSettingControls(this.root, Object.values(this.settings));
    this.setInputDevice(this.device);
    this.menu.reset(selected);
    const nextDetail = this.root.querySelector<HTMLElement>('#newsroom-detail');
    if (detailFocused && nextDetail && !nextDetail.contains(document.activeElement)) this.menu.focusScope(nextDetail);
    if (nextDetail) nextDetail.scrollTop = detailScroll;
    const menuPanel = this.root.querySelector('.newsroom-menu-panel');
    if (menuPanel) menuPanel.scrollTop = menuScroll;
    this.root.scrollTop = scroll;
    if (!samePage) this.root.querySelector<HTMLElement>('[data-selected]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    else if (detailFocused) nextDetail?.querySelector<HTMLElement>('[data-selected]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  private focusNewsroomMenu() {
    this.root.querySelector<HTMLElement>(`#newsroom-open-${this.newsroomSection}`)?.focus({ preventScroll: true });
    if (!matchMedia('(min-width:1000px)').matches) this.root.scrollTop = 0;
    this.root.querySelector<HTMLElement>(`#newsroom-open-${this.newsroomSection}`)?.scrollIntoView({ block: 'nearest' });
  }
  private filterNotebook() {
    const query = this.root.querySelector<HTMLInputElement>('#notebook-search')!.value.toLocaleLowerCase();
    this.root.querySelectorAll<HTMLElement>('[data-record]').forEach(article => { article.hidden = !article.textContent?.toLocaleLowerCase().includes(query); });
  }
}
