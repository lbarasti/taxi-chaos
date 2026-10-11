import './editor.css';
import { Game } from '../game';
import type { Renderer } from '../renderer';
import { add, dist, scale, sub, vec, type Vec } from '../physics';
import { World } from '../world';
import { compileMap } from './compile';
import { MapHistory, entities, type MapBatch, type MapOperation } from './operations';
import { EditorRenderer, type Layers } from './editor-renderer';
import { validateMap, type Validation } from './validation';
import { createPreview } from './preview';

export type MapAPI = MapEditor['api'];
type EditorHooks = { clock(): boolean; freeze(value: boolean): void; clearInput(): void; activate(game: Game): void; silence(): void };
const escapeHTML = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export class MapEditor {
  readonly history = new MapHistory();
  readonly element: HTMLElement;
  readonly view: EditorRenderer;
  private compiled = compileMap(this.history.snapshot().document);
  private world = new World(this.compiled);
  private validation = validateMap(this.compiled.document, this.compiled, this.world);
  private selection = 'southern-estates';
  private opened = false; private previewGame: Game | undefined;
  private priorClock = false; private priorCamera = vec(); private priorZoom = 1;
  private measure: [Vec, Vec] | undefined; private measuring = false;
  private gesture: { id: number; start: Vec; screen: Vec; camera: Vec; pan: boolean; target?: string; delta: Vec; base: string } | undefined;
  private resizeObserver: ResizeObserver;
  get editing() { return this.opened && !this.previewGame; }
  get active() { return this.opened; }
  constructor(private readonly original: Game, private readonly renderer: Renderer, private readonly hooks: EditorHooks) {
    this.element = document.createElement('section'); this.element.id = 'map-editor'; this.element.hidden = true; this.element.setAttribute('aria-label', 'Map editor');
    this.element.innerHTML = `
      <header class="editor-header"><div><span class="editor-eyebrow">TAXI CHAOS / WORLD AUTHORING</span><h1>Map studio<span class="editor-draft">DRAFT</span></h1></div><div class="editor-toolbar"><button data-map="undo">Undo</button><button data-map="redo">Redo</button><button data-map="import">Import</button><button data-map="export">Export JSON</button><button data-map="close">Close editor</button></div></header>
      <div class="editor-main"><div class="editor-stage"><div class="editor-camera"><button data-map="fit">Fit map</button><button data-map="fit-selection">Fit selection</button><button data-map="zoom-in" aria-label="Zoom in">+</button><button data-map="zoom-out" aria-label="Zoom out">−</button><button data-map="measure" aria-pressed="false">Measure</button><label>Snap <select data-map="snap" aria-label="Grid snapping"><option value="0">Off</option><option value="1" selected>1 m</option><option value="5">5 m</option><option value="10">10 m</option></select></label></div><canvas data-map="canvas" tabindex="0" aria-label="Map overview. Drag selected geometry to move; Shift-drag or middle-drag to pan; wheel to zoom."></canvas><div class="editor-stage-note">Select → drag or enter metres. Shift-drag pans · wheel zooms · Ctrl/⌘ Z undoes</div></div>
      <aside class="editor-inspector"><section><div class="editor-section-title">INSPECT / EDIT <span data-map="revision"></span></div><label>Selection<select data-map="selection" aria-label="Map selection"></select></label><div data-map="description" class="editor-description"></div><div data-map="placement"><div class="editor-fields"><label>X (m)<input data-map="x" type="number" step="0.1"></label><label>Y (m)<input data-map="y" type="number" step="0.1"></label></div><button data-map="move">Set position</button></div><div data-map="dimensions"><div class="editor-fields"><label>Width (m)<input data-map="width" type="number" step="0.1" min="1"></label><label>Height (m)<input data-map="height" type="number" step="0.1" min="1"></label></div><button data-map="resize">Set dimensions</button></div><div class="editor-fields"><label>Δ X (m)<input data-map="dx" type="number" step="1" value="0"></label><label>Δ Y (m)<input data-map="dy" type="number" step="1" value="20"></label></div><button data-map="translate" class="editor-primary">Translate selection</button></section>
      <section><div class="editor-section-title">LAYERS</div><div class="editor-layers">${Object.entries(this.viewLayers()).map(([key, value]) => `<label><input type="checkbox" data-layer="${key}" ${value ? 'checked' : ''}>${key === 'points' ? 'Points / anchors' : key}</label>`).join('')}</div></section>
      <section><div class="editor-section-title">MAP ENVELOPE / METRES</div><div class="editor-fields">${['min-x', 'min-y', 'max-x', 'max-y'].map(key => `<label>${key.replace('-', ' ')}<input type="number" data-map="${key}" step="1"></label>`).join('')}</div><button data-map="envelope">Set envelope</button></section>
      <section><div class="editor-section-title">VALIDATION <span data-map="summary"></span></div><strong data-map="gap" class="editor-gap"></strong><small data-map="resolution"></small><div data-map="findings" class="editor-findings"></div></section>
      <section><div class="editor-section-title">PLAYTEST DRAFT</div><label>Start near<select data-map="spawn" aria-label="Preview spawn"></select></label><button data-map="preview" class="editor-primary">Preview gameplay →</button><small>Fresh physics, fares, colliders and AI. Preview earnings stay in this session.</small></section></aside></div>
      <footer class="editor-footer"><span data-map="status" role="status">Draft ready. Southern Estates selected.</span><span data-map="coordinates"></span></footer><input data-map="file" type="file" accept=".json,application/json" hidden>`;
    document.body.append(this.element);
    this.view = new EditorRenderer(this.q<HTMLCanvasElement>('canvas'));
    this.resizeObserver = new ResizeObserver(() => { if (this.editing) { this.view.resize(); this.draw(); } }); this.resizeObserver.observe(this.q('canvas'));
    this.bind(); this.refresh();
  }
  private viewLayers(): Layers { return { land: true, roads: true, objects: true, scenery: true, colliders: false, navigation: false, findings: true, points: false }; }
  private q<T extends HTMLElement = HTMLElement>(key: string) { return this.element.querySelector<T>(`[data-map="${key}"]`)!; }
  private number(key: string) { const input = this.q<HTMLInputElement>(key); if (!input.value.trim() || !Number.isFinite(input.valueAsNumber)) throw new Error(`Enter a finite number for ${key}`); return input.valueAsNumber; }
  private status(text: string, error = false) { this.q('status').textContent = text; this.q('status').classList.toggle('editor-error', error); }
  private attempt(action: () => unknown) { try { action(); } catch (error) { this.status((error as Error).message, true); } }
  private rebuild() { this.compiled = compileMap(this.history.snapshot().document); this.world = new World(this.compiled); this.validation = validateMap(this.compiled.document, this.compiled, this.world); this.refresh(); this.draw(); }
  private draw() { if (this.editing) this.view.draw(this.compiled, this.world, this.validation, this.selection, this.measure, this.gesture?.pan ? undefined : this.gesture?.delta); }
  private apply(operations: MapOperation[]) { return this.api.apply({ baseRevision: this.history.snapshot().revision, operations }); }
  private refresh() {
    const snapshot = this.history.snapshot(), d = snapshot.document;
    if (![...d.districts, ...entities(d), ...d.roads].some(e => e.id === this.selection)) this.selection = 'southern-estates';
    const description = this.history.describe(this.selection);
    const select = this.q<HTMLSelectElement>('selection');
    select.innerHTML = [...d.districts.map(e => ({ id: e.id, label: e.name })), ...entities(d).map(e => ({ id: e.id, label: e.id })), ...d.roads.map(e => ({ id: e.id, label: `${e.name} · anchors` }))].map(e => `<option value="${escapeHTML(e.id)}">${escapeHTML(e.label)}</option>`).join(''); select.value = this.selection;
    this.q('revision').textContent = snapshot.revision;
    const p = description.position, descriptor = description.descriptor;
    this.q('description').textContent = `${description.id} · ${description.kind}${description.editable ? '' : ' · READ ONLY'}\n${description.policy}\n${description.members.length} members · ${description.connections.length} road connections${description.seams.length ? '\nSeams: ' + description.seams.filter(s => s.weight !== 1).map(s => `${s.id} ×${s.weight}`).join(', ') : ''}`;
    if (description.bounds) { const { min, max } = description.bounds; this.q('description').append(document.createTextNode(`\nBounds: (${min.x.toFixed(1)}, ${min.y.toFixed(1)}) → (${max.x.toFixed(1)}, ${max.y.toFixed(1)}) m`)); }
    const footprints = this.world.props.filter(p => p.sourceId === this.selection).map(p => `${p.kind}: ${p.body.w} × ${p.body.h} m`);
    if (footprints.length) this.q('description').append(document.createTextNode('\n' + footprints.join(' · ')));
    const details = document.createElement('details'), summary = document.createElement('summary'), members = document.createElement('pre');
    summary.textContent = 'Contents & connections'; members.textContent = [...description.members, ...description.connections].join('\n'); details.append(summary, members); this.q('description').append(details);
    this.q('placement').hidden = !p;
    if (p) { this.q<HTMLInputElement>('x').value = String(p.x); this.q<HTMLInputElement>('y').value = String(p.y); }
    let dimensions: { width: number; height: number } | undefined;
    if (descriptor && 'width' in descriptor) dimensions = descriptor;
    else if (descriptor && 'left' in descriptor) dimensions = { width: descriptor.right - descriptor.left, height: descriptor.bottom - descriptor.top };
    this.q('dimensions').hidden = !dimensions;
    if (dimensions) { this.q<HTMLInputElement>('width').value = String(dimensions.width); this.q<HTMLInputElement>('height').value = String(dimensions.height); }
    for (const key of ['move', 'resize', 'translate']) this.q<HTMLButtonElement>(key).disabled = !description.editable;
    this.q<HTMLButtonElement>('undo').disabled = !snapshot.canUndo; this.q<HTMLButtonElement>('redo').disabled = !snapshot.canRedo;
    for (const edge of ['min', 'max'] as const) for (const axis of ['x', 'y'] as const) this.q<HTMLInputElement>(`${edge}-${axis}`).value = String(d.envelope[edge][axis]);
    this.q('summary').textContent = `${this.validation.errors} errors · ${this.validation.warnings} warnings`;
    this.q('resolution').textContent = `Water gap: facing shores, ${this.validation.resolution.waterGap} m × 0.5 m samples. Roads: car & truck footprints, ≤1 m steps; edge samples 0.5 m; penetration tolerance 0.04 m.`;
    this.q('gap').textContent = `${this.validation.waterGap?.toFixed(1) ?? '∞'} m open water`;
    this.q('gap').classList.toggle('editor-error', this.validation.findings.some(f => f.code === 'beach-water-gap' && f.severity === 'error'));
    this.q('findings').replaceChildren(...this.validation.findings.map(f => {
      const button = document.createElement('button'); button.className = `editor-finding ${f.severity}`; button.textContent = `${f.severity.toUpperCase()} · ${f.message}`;
      button.addEventListener('click', () => { const id = f.entityIds.find(id => entities(d).some(e => e.id === id) || d.districts.some(e => e.id === id) || d.roads.some(e => e.id === id)); if (id) this.api.select(id); if (f.position) { this.view.camera = { ...f.position }; this.view.zoom = Math.max(this.view.zoom, 3); this.draw(); } this.status(`${f.code} · ${f.entityIds.join(', ')}${f.measured ? ' · ' + JSON.stringify(f.measured) : ''}`); }); return button;
    }));
    const spawn = this.q<HTMLSelectElement>('spawn'), old = spawn.value || 'fairway-club';
    spawn.innerHTML = d.stops.map(s => `<option value="${escapeHTML(s.id)}">${escapeHTML(s.name)}</option>`).join(''); spawn.value = d.stops.some(s => s.id === old) ? old : d.stops[0].id;
    this.q<HTMLButtonElement>('preview').disabled = this.validation.errors > 0;
  }
  private bind() {
    const on = (key: string, action: () => unknown) => this.q(key).addEventListener('click', () => this.attempt(action));
    on('close', () => this.api.close()); on('fit', () => { this.view.fit(this.compiled.document.envelope); this.draw(); });
    on('fit-selection', () => { const b = this.history.describe(this.selection).bounds; if (b) { this.view.fit(b); this.draw(); } });
    on('zoom-in', () => this.zoom(1.4)); on('zoom-out', () => this.zoom(1 / 1.4));
    on('undo', () => this.api.undo()); on('redo', () => this.api.redo());
    on('move', () => this.apply([{ type: 'move', targetId: this.selection, position: vec(this.number('x'), this.number('y')) }]));
    on('resize', () => this.apply([{ type: 'resize', targetId: this.selection, width: this.number('width'), height: this.number('height') }]));
    on('translate', () => this.apply([{ type: 'translate', targetId: this.selection, delta: vec(this.number('dx'), this.number('dy')) }]));
    on('envelope', () => this.apply([{ type: 'envelope', min: vec(this.number('min-x'), this.number('min-y')), max: vec(this.number('max-x'), this.number('max-y')) }]));
    on('measure', () => { this.measuring = !this.measuring; this.measure = undefined; this.q('measure').setAttribute('aria-pressed', String(this.measuring)); this.status(this.measuring ? 'Click two map positions to measure distance.' : 'Selection tool active.'); this.draw(); });
    on('import', () => this.q<HTMLInputElement>('file').click());
    this.q<HTMLInputElement>('file').addEventListener('change', async e => { const input = e.target as HTMLInputElement, file = input.files?.[0]; if (file) { if (file.size > 2_000_000) this.status('Map file exceeds 2 MB', true); else this.attempt(() => { void file.text().then(json => this.attempt(() => this.api.import(json))); }); } input.value = ''; });
    on('export', () => { const url = URL.createObjectURL(new Blob([this.api.export()], { type: 'application/json' })), link = document.createElement('a'); link.href = url; link.download = `taxi-map-${this.compiled.revision}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); this.status('Canonical JSON downloaded.'); });
    on('preview', () => this.api.preview({ spawnId: this.q<HTMLSelectElement>('spawn').value }));
    this.q<HTMLSelectElement>('selection').addEventListener('change', e => this.attempt(() => this.api.select((e.target as HTMLSelectElement).value)));
    this.element.querySelectorAll<HTMLInputElement>('[data-layer]').forEach(input => input.addEventListener('change', () => { this.view.layers[input.dataset.layer as keyof Layers] = input.checked; this.draw(); }));
    const canvas = this.view.canvas, local = (e: PointerEvent | WheelEvent) => { const r = canvas.getBoundingClientRect(); return vec(e.clientX - r.left, e.clientY - r.top); };
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.zoom(Math.exp(-e.deltaY * 0.0015), local(e)); }, { passive: false });
    canvas.addEventListener('pointerdown', e => {
      if (this.gesture) return;
      const screen = local(e), point = this.view.world(screen); canvas.focus();
      if (this.measuring) { this.measure = this.measure && dist(...this.measure) === 0 ? [this.measure[0], point] : [point, point]; this.status(this.measure && dist(...this.measure) > 0 ? `${dist(...this.measure).toFixed(2)} m measured. Click to start again.` : 'Choose the second measurement point.'); this.draw(); return; }
      const pan = e.shiftKey || e.button === 1 || e.button === 2;
      let target: string | undefined;
      if (!pan) { target = this.view.hit(this.compiled, point, this.selection, this.world); if (target) this.api.select(target); }
      this.gesture = { id: e.pointerId, start: point, screen, camera: { ...this.view.camera }, pan: pan || !target, target, delta: vec(), base: this.history.snapshot().revision }; canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      const screen = local(e), point = this.view.world(screen); this.q('coordinates').textContent = `X ${point.x.toFixed(1)} · Y ${point.y.toFixed(1)} m`;
      const g = this.gesture; if (!g || g.id !== e.pointerId) return;
      if (g.pan) this.view.camera = sub(g.camera, scale(sub(screen, g.screen), 1 / this.view.zoom));
      else { const delta = sub(point, g.start), snap = Number(this.q<HTMLSelectElement>('snap').value); g.delta = snap ? vec(Math.round(delta.x / snap) * snap, Math.round(delta.y / snap) * snap) : delta; }
      this.draw();
    });
    canvas.addEventListener('pointerup', e => {
      const g = this.gesture; if (!g || g.id !== e.pointerId) return; this.gesture = undefined;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (!g.pan && g.target && dist(vec(), g.delta) > 0.01) this.attempt(() => this.api.apply({ baseRevision: g.base, operations: [{ type: 'translate', targetId: g.target!, delta: g.delta }] }));
      this.draw();
    });
    const cancel = () => { this.gesture = undefined; this.draw(); }; canvas.addEventListener('pointercancel', cancel); canvas.addEventListener('lostpointercapture', cancel);
  }
  private zoom(factor: number, screen = vec(this.view.width / 2, this.view.height / 2)) { const before = this.view.world(screen); this.view.zoom = Math.max(0.15, Math.min(25, this.view.zoom * factor)); this.view.camera = add(this.view.camera, sub(before, this.view.world(screen))); this.draw(); }
  handleKey(event: KeyboardEvent): boolean {
    if (!this.active) return false;
    if (this.previewGame) { if (event.code === 'Escape' || event.code === 'F2') { event.preventDefault(); this.api.edit(); return true; } return false; }
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (event.code === 'Escape' || event.code === 'F2') { event.preventDefault(); this.api.close(); }
    else if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ' && !target?.closest('input,textarea')) { event.preventDefault(); this.attempt(() => event.shiftKey ? this.api.redo() : this.api.undo()); }
    else if ((event.ctrlKey || event.metaKey) && event.code === 'KeyY' && !target?.closest('input,textarea')) { event.preventDefault(); this.attempt(() => this.api.redo()); }
    else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code) && !target?.closest('input,select,button')) event.preventDefault();
    return true;
  }
  readonly api = {
    open: () => {
      if (this.previewGame) this.api.edit();
      if (!this.opened) { this.priorClock = this.hooks.clock(); this.priorCamera = { ...this.renderer.camera }; this.priorZoom = this.renderer.zoom; this.hooks.clearInput(); this.hooks.silence(); this.hooks.freeze(true); this.opened = true; }
      document.body.classList.add('map-editing'); this.element.hidden = false; this.view.resize(); this.view.fit(this.compiled.document.envelope); this.draw(); this.q<HTMLCanvasElement>('canvas').focus();
      return this.history.snapshot();
    },
    close: () => {
      if (!this.opened) return;
      this.hooks.silence(); this.hooks.clearInput(); this.hooks.activate(this.original); this.previewGame = undefined; this.opened = false; this.gesture = undefined;
      this.element.hidden = true; document.getElementById('map-preview-bar')?.remove(); document.body.classList.remove('map-editing', 'map-previewing'); this.renderer.camera = { ...this.priorCamera }; this.renderer.zoom = this.priorZoom; this.hooks.freeze(this.priorClock); this.renderer.canvas.focus();
    },
    snapshot: () => this.history.snapshot(),
    describe: (id: string) => this.history.describe(id),
    select: (id: string) => { const descriptor = this.history.describe(id); this.selection = id; if (descriptor.kind === 'road' || descriptor.kind === 'point') { this.view.layers.points = true; this.element.querySelector<HTMLInputElement>('[data-layer="points"]')!.checked = true; } this.refresh(); this.draw(); return descriptor; },
    apply: (batch: MapBatch) => {
      if (this.previewGame) throw new Error('Return to editing before applying operations');
      const result = this.history.apply(batch); this.rebuild(); this.status(`${result.changedIds.length} entities updated · ${result.affectedConnections.length} connections rebuilt · ${this.validation.errors} errors`);
      return { ...result, findings: structuredClone(this.validation.findings) };
    },
    validate: () => structuredClone(this.validation),
    undo: () => { if (this.previewGame) throw new Error('Return to editing first'); const snapshot = this.history.undo(); this.rebuild(); this.status('Undo restored the previous document.'); return snapshot; },
    redo: () => { if (this.previewGame) throw new Error('Return to editing first'); const snapshot = this.history.redo(); this.rebuild(); this.status('Redo restored the next document.'); return snapshot; },
    export: () => this.history.export(),
    import: (json: string) => { if (this.previewGame) throw new Error('Return to editing first'); const snapshot = this.history.import(json); this.rebuild(); this.status('Imported map validated. Undo returns to your previous draft.'); return snapshot; },
    preview: ({ spawnId = 'fairway-club' }: { spawnId?: string } = {}) => {
      const preview = createPreview(this.history.snapshot().document, spawnId);
      if (!this.opened) this.api.open();
      this.hooks.silence(); this.hooks.clearInput(); this.previewGame = preview; this.hooks.activate(preview); this.hooks.freeze(false); this.renderer.camera = { ...preview.actor.position };
      this.element.hidden = true; document.body.classList.remove('map-editing'); document.body.classList.add('map-previewing');
      document.getElementById('map-preview-bar')?.remove(); const bar = document.createElement('div'); bar.id = 'map-preview-bar';
      const label = document.createElement('span'); label.textContent = `DRAFT PREVIEW · ${this.compiled.revision} · session-only progress`;
      const button = document.createElement('button'); button.textContent = '← Return to editor · Esc'; button.addEventListener('click', () => this.api.edit()); bar.append(label, button); document.body.append(bar); this.renderer.canvas.focus(); return preview.snapshot();
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
      this.hooks.silence(); this.hooks.clearInput(); this.hooks.activate(this.original); this.previewGame = undefined; this.hooks.freeze(true); this.element.hidden = false; document.getElementById('map-preview-bar')?.remove(); document.body.classList.remove('map-previewing'); document.body.classList.add('map-editing'); this.view.resize(); this.draw(); this.status('Back to your draft. Preview state discarded.'); return this.history.snapshot();
    },
  };
}
