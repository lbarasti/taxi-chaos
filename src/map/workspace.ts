import type { Game } from '../game';
import { vec, type Vec } from '../physics';
import { World } from '../world';
import { compileMap } from './compile';
import { MapHistory, type MapBatch } from './operations';
import type { MapDocument } from './schema';
import { validateMap, type Validation } from './validation';

/**
 * Programmatic map authoring session used by `window.__taxi.map`.
 *
 * The validated map engine and transactional operations are shared with the map
 * CLI and authoring previews. There is deliberately no DOM editor: `open()`
 * freezes a drafting session, `preview()` swaps in an isolated game, and
 * `edit()`/`close()` restore the game the player was in.
 */
export type MapAPI = MapWorkspace['api'];
export type WorkspaceRenderer = { camera: Vec; zoom: number; canvas: { focus(): void } };
export type PreviewFactory = (document: MapDocument, spawnId: string) => Game;
type WorkspaceHooks = {
  clock(): boolean;
  freeze(value: boolean): void;
  clearInput(): void;
  activate(game: Game): void;
  silence(): void;
  /** Lock real user controls. Drafting locks the game UI and the LAB panel; a
   *  preview keeps physical gameplay usable but still locks the LAB panel so it
   *  cannot mutate the original game. */
  lock(panel: boolean, game: boolean): void;
};

export class MapWorkspace {
  readonly history = new MapHistory();
  private validation: Validation;
  private opened = false; private previewGame: Game | undefined;
  private priorClock = false; private priorCamera = vec(); private priorZoom = 1;
  get editing() { return this.opened && !this.previewGame; }
  get active() { return this.opened; }
  get previewing() { return this.previewGame !== undefined; }
  constructor(
    private readonly original: Game,
    private readonly renderer: WorkspaceRenderer,
    private readonly hooks: WorkspaceHooks,
    private readonly createPreview: PreviewFactory,
  ) { this.validation = this.validate(); }
  private validate() { const compiled = compileMap(this.history.snapshot().document); return validateMap(compiled.document, compiled, new World(compiled)); }
  private rebuild() { this.validation = this.validate(); }
  /** Restore the original game, camera and zoom. The clock is explicit because
   *  `edit()` freezes a draft while `close()` returns to the prior live/frozen state. */
  private restoreOriginal(clock: boolean) {
    this.hooks.silence(); this.hooks.clearInput(); this.hooks.activate(this.original); this.previewGame = undefined;
    this.renderer.camera = { ...this.priorCamera }; this.renderer.zoom = this.priorZoom; this.hooks.freeze(clock);
  }
  readonly api = {
    open: () => {
      if (this.previewGame) this.api.edit();
      if (!this.opened) {
        this.priorClock = this.hooks.clock(); this.priorCamera = { ...this.renderer.camera }; this.priorZoom = this.renderer.zoom;
        this.hooks.clearInput(); this.hooks.silence(); this.hooks.freeze(true); this.hooks.lock(true, true); this.opened = true;
      }
      return this.history.snapshot();
    },
    close: () => {
      if (!this.opened) return;
      this.restoreOriginal(this.priorClock); this.opened = false;
      this.hooks.lock(false, false); this.renderer.canvas.focus();
    },
    snapshot: () => this.history.snapshot(),
    describe: (id: string) => this.history.describe(id),
    /** Kept for automation parity with the former studio: validates and describes an ID. */
    select: (id: string) => this.history.describe(id),
    apply: (batch: MapBatch) => {
      if (this.previewGame) throw new Error('Return to editing before applying operations');
      const result = this.history.apply(batch); this.rebuild();
      return { ...result, findings: structuredClone(this.validation.findings) };
    },
    validate: () => structuredClone(this.validation),
    undo: () => { if (this.previewGame) throw new Error('Return to editing first'); const snapshot = this.history.undo(); this.rebuild(); return snapshot; },
    redo: () => { if (this.previewGame) throw new Error('Return to editing first'); const snapshot = this.history.redo(); this.rebuild(); return snapshot; },
    export: () => this.history.export(),
    import: (json: string) => { if (this.previewGame) throw new Error('Return to editing first'); const snapshot = this.history.import(json); this.rebuild(); return snapshot; },
    preview: ({ spawnId = 'fairway-club' }: { spawnId?: string } = {}) => {
      const preview = this.createPreview(this.history.snapshot().document, spawnId);
      if (!this.opened) this.api.open();
      this.hooks.silence(); this.hooks.clearInput(); this.previewGame = preview; this.hooks.activate(preview); this.hooks.freeze(false); this.hooks.lock(true, false);
      this.renderer.camera = { ...preview.actor.position }; this.renderer.canvas.focus(); return preview.snapshot();
    },
    previewState: () => this.previewGame?.snapshot() ?? null,
    step: (seconds: number, keys: string[] = []) => {
      if (!this.previewGame) throw new Error('Start a gameplay preview first');
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60 || !Array.isArray(keys) || keys.some(k => typeof k !== 'string')) throw new Error('Expected 0–60 seconds and string keys');
      this.hooks.freeze(true); this.previewGame.keys = new Set(keys); for (let i = 0; i < Math.round(seconds * 120); i++) this.previewGame.update(1 / 120); this.previewGame.keys.clear(); return this.previewGame.snapshot();
    },
    live: () => { if (!this.previewGame) throw new Error('No gameplay preview'); this.hooks.freeze(false); },
    edit: () => {
      if (!this.previewGame) return this.api.open();
      this.restoreOriginal(true); this.hooks.lock(true, true); return this.history.snapshot();
    },
  };
}
