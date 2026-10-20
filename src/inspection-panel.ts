import './inspection.css';
import type { Renderer } from './renderer';
import { inspectPoint, overlayLayers, visualLayers, type InspectionPatch, type InspectionPreset, type OverlayLayer, type VisualLayer } from './inspection';
import { inspectionColours } from './inspection-renderer';
import { clamp, type Vec } from './physics';

type InspectionHooks = { available(): boolean; clearInput(): void; redraw(): void; clockFrozen(): boolean };
export type InspectionAPI = ReturnType<typeof createInspectionPanel>['api'];

export function createInspectionPanel(r: Renderer, hooks: InspectionHooks) {
  const state = r.inspection;
  const panel = document.createElement('aside');
  panel.id = 'layers-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'Map layers inspector');
  const badge = document.createElement('button');
  badge.id = 'layers-badge'; badge.hidden = true;
  document.body.append(panel, badge);
  panel.innerHTML = `<header><div><small>MAP INSPECTION</small><h2>Layers</h2></div><button data-action="collapse" aria-label="Collapse layers inspector">−</button><button data-action="close" aria-label="Close layers inspector">×</button></header>
    <div class="layers-body">
      <label>View <select data-control="preset" aria-label="Layer preset"><option value="normal">Normal</option><option value="land">Land / water</option><option value="terrain">Terrain</option><option value="collision">Collision / artwork</option><option value="lighting">Lighting</option><option value="custom" disabled>Custom</option></select></label>
      <div class="layers-tools"><button data-action="reset">Reset view</button><button data-action="pause">Pause simulation</button><button data-action="camera">Free camera</button></div>
      <p class="layers-hint">Click / tap the world to inspect. Free camera: drag to pan, wheel or +/− to zoom. WASD / arrows pan without driving.</p>
      <div class="layers-tools"><button data-action="out" aria-label="Zoom out">−</button><button data-action="in" aria-label="Zoom in">+</button><button data-action="actor">Find taxi / actor</button></div>
      <h3>Visible scene</h3>
      ${Object.entries(visualLayers).map(([key, label]) => `<div class="layers-row"><label><input type="checkbox" data-visible="${key}">${label}</label><button data-solo="${key}" aria-label="Solo ${label}">Solo</button></div>`).join('')}
      <label>Prop opacity <input type="range" min="0" max="1" step="0.05" data-control="propOpacity" aria-label="Building and prop opacity"></label>
      <h3>Geometry overlays</h3>
      ${Object.entries(overlayLayers).map(([key, label]) => `<div class="layers-row"><label><input type="checkbox" data-overlay="${key}"><i style="background:${inspectionColours[key as OverlayLayer]}"></i>${label}</label><button data-solo="${key}" aria-label="Solo ${label}">Solo</button></div>`).join('')}
      <label>Overlay opacity <input type="range" min="0" max="1" step="0.05" data-control="overlayOpacity" aria-label="Geometry overlay opacity"></label>
      <p class="layers-hint">Land: solid coastline, dashed source rings. Terrain: blue road, gold sand, purple paving, green grass; material never grants access. Shadows: map props only; baked-in sprite shading stays in artwork. Hidden bodies still collide and block light.</p>
      <section class="layers-selection" aria-label="Selected map entity"><h3>At inspected point</h3><p data-report>Click the world to inspect geometry.</p><label>Overlapping entities <select data-control="selection" aria-label="Overlapping entities"></select></label><p data-detail></p><button data-action="copy">Copy entity ID</button><span data-copy role="status"></span></section>
    </div>`;
  const q = <T extends HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  let savedCamera: { camera: Vec; zoom: number } | null = null;
  let preset: InspectionPreset | 'custom' = 'normal';
  let reportSignature = '';
  let drag: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
  const assertAvailable = () => { if (!hooks.available()) throw new Error('Layers are available in the lab or a valid gameplay preview'); };
  const screenPoint = (x: number, y: number): Vec => {
    const rect = r.canvas.getBoundingClientRect();
    return { x: ((x - rect.left) * r.width / rect.width - r.width * 0.53) / r.zoom + r.camera.x, y: ((y - rect.top) * r.height / rect.height - r.height * 0.54) / r.zoom + r.camera.y };
  };
  const snapshot = () => ({ active: state.active, ...structuredClone(state.options), camera: { ...r.camera }, zoom: r.zoom, selected: state.selected,
    report: state.point ? inspectPoint(r.game, state.point) : null });
  function refresh() {
    const available = hooks.available();
    badge.hidden = !available;
    if (!state.active) { badge.textContent = 'LAYERS · Inspect map'; return; }
    panel.inert = !available; badge.disabled = !available;
    document.body.classList.toggle('layers-free-camera', state.freeCamera && available);
    badge.textContent = `LAYERS · ${state.paused ? 'PAUSED' : hooks.clockFrozen() ? 'FIXED' : 'LIVE'} · ${state.freeCamera ? 'FREE CAMERA' : 'FOLLOW'} · Open`;
    q<HTMLButtonElement>('[data-action="pause"]').textContent = state.paused ? 'Resume simulation' : 'Pause simulation';
    q<HTMLButtonElement>('[data-action="pause"]').setAttribute('aria-pressed', String(state.paused));
    q<HTMLButtonElement>('[data-action="camera"]').textContent = state.freeCamera ? 'Follow actor' : 'Free camera';
    q<HTMLButtonElement>('[data-action="camera"]').setAttribute('aria-pressed', String(state.freeCamera));
    q<HTMLSelectElement>('[data-control="preset"]').value = preset;
    for (const input of Array.from(panel.querySelectorAll<HTMLInputElement>('[data-visible]'))) input.checked = state.options.visible[input.dataset.visible as VisualLayer];
    for (const input of Array.from(panel.querySelectorAll<HTMLInputElement>('[data-overlay]'))) input.checked = state.options.overlays[input.dataset.overlay as OverlayLayer];
    for (const key of ['propOpacity', 'overlayOpacity'] as const) q<HTMLInputElement>(`[data-control="${key}"]`).value = String(state.options[key]);
    const report = state.point ? inspectPoint(r.game, state.point) : null;
    const signature = JSON.stringify(report);
    const select = q<HTMLSelectElement>('[data-control="selection"]');
    if (signature !== reportSignature) {
      reportSignature = signature;
      select.replaceChildren(...(report?.hits ?? []).map(hit => { const option = document.createElement('option'); option.value = hit.key; option.textContent = `${hit.kind} · ${hit.id}`; return option; }));
    }
    if (report && !report.hits.some(hit => hit.key === state.selected)) state.selected = report.hits[0]?.key ?? null;
    select.value = state.selected ?? ''; select.disabled = !report?.hits.length;
    q('[data-report]').textContent = report ? `${report.point.x.toFixed(2)}, ${report.point.y.toFixed(2)} m · ${report.pool ? 'POOL' : report.dryLand ? 'dry land' : 'OCEAN'} · tyre sample: ${report.surface} (${report.terrainSource ?? 'default road; no region'})` : 'Click the world to inspect geometry.';
    const hit = report?.hits.find(hit => hit.key === state.selected);
    q('[data-detail]').textContent = hit ? `${hit.id}\nOwner: ${hit.owner}\n${hit.detail}` : 'No entity at this point.';
    q<HTMLButtonElement>('[data-action="copy"]').disabled = !hit;
  }
  const present = () => { refresh(); hooks.redraw(); };
  const api = {
    open() { assertAvailable(); if (!state.active) { savedCamera = { camera: { ...r.camera }, zoom: r.zoom }; state.active = true; } panel.hidden = false; badge.hidden = false; present(); return snapshot(); },
    close() {
      if (state.active && savedCamera && state.freeCamera) { r.camera = { ...savedCamera.camera }; r.zoom = savedCamera.zoom; }
      state.reset(); state.active = false; savedCamera = null; drag = null; preset = 'normal';
      panel.hidden = true; badge.hidden = !hooks.available(); document.body.classList.remove('layers-free-camera');
      hooks.clearInput(); hooks.redraw(); return snapshot();
    },
    state: snapshot,
    configure(patch: InspectionPatch) { assertAvailable(); state.configure(patch); if (!state.active) api.open(); preset = 'custom'; hooks.clearInput(); present(); return snapshot(); },
    preset(name: InspectionPreset) { assertAvailable(); state.preset(name); if (!state.active) api.open(); preset = name; present(); return snapshot(); },
    solo(layer: VisualLayer | OverlayLayer) { assertAvailable(); state.solo(layer); if (!state.active) api.open(); preset = 'custom'; present(); return snapshot(); },
    inspect(point: Vec) { assertAvailable(); const report = inspectPoint(r.game, point); if (!state.active) api.open(); state.point = { ...point }; state.selected = report.hits[0]?.key ?? null; present(); return report; },
    select(key: string) { assertAvailable(); if (!state.point || !inspectPoint(r.game, state.point).hits.some(hit => hit.key === key)) throw new Error('Select an entity at the inspected point'); state.selected = key; present(); return snapshot(); },
    camera(point: Vec, zoom = r.zoom) {
      assertAvailable(); if (![point.x, point.y, zoom].every(Number.isFinite) || zoom < 0.5 || zoom > 40) throw new Error('Expected finite camera coordinates and zoom 0.5–40');
      if (!state.active) api.open(); state.configure({ freeCamera: true }); hooks.clearInput(); r.camera = { ...point }; r.zoom = zoom; present(); return snapshot();
    },
    reset() { assertAvailable(); state.reset(); preset = 'normal'; hooks.clearInput(); r.camera = { ...r.game.actor.position }; present(); return snapshot(); },
  };
  badge.addEventListener('click', () => { api.open(); q<HTMLButtonElement>('[data-action="collapse"]').focus(); });
  panel.addEventListener('click', async event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button'); if (!button || !hooks.available()) return;
    if (button.dataset.solo) { api.solo(button.dataset.solo as VisualLayer | OverlayLayer); return; }
    const action = button.dataset.action;
    if (action === 'close') { api.close(); r.canvas.focus(); }
    if (action === 'collapse') { panel.hidden = true; badge.focus(); }
    if (action === 'reset') api.reset();
    if (action === 'pause') api.configure({ paused: !state.paused });
    if (action === 'camera') api.configure({ freeCamera: !state.freeCamera });
    if (action === 'actor') api.camera(r.game.actor.position);
    if (action === 'in' || action === 'out') api.camera(r.camera, clamp(r.zoom * (action === 'in' ? 1.25 : 0.8), 0.5, 40));
    if (action === 'copy') {
      const hit = snapshot().report?.hits.find(hit => hit.key === state.selected);
      if (hit) try { await navigator.clipboard.writeText(hit.id); q('[data-copy]').textContent = 'Copied'; } catch { q('[data-copy]').textContent = 'Select the ID above to copy.'; }
    }
  });
  panel.addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.visible) api.configure({ visible: { [input.dataset.visible]: input.checked } });
    if (input.dataset.overlay) api.configure({ overlays: { [input.dataset.overlay]: input.checked } });
    if (input.dataset.control === 'preset') api.preset(input.value as InspectionPreset);
    if (input.dataset.control === 'selection') api.select(input.value);
  });
  panel.addEventListener('input', event => {
    const input = event.target as HTMLInputElement, key = input.dataset.control;
    if (key === 'propOpacity' || key === 'overlayOpacity') api.configure({ [key]: Number(input.value) });
  });
  r.canvas.addEventListener('pointerdown', event => {
    if (!state.active || !hooks.available() || event.button !== 0 || drag) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    r.canvas.setPointerCapture(event.pointerId); r.canvas.focus();
  });
  r.canvas.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) drag.moved = true;
    if (state.freeCamera) {
      const a = screenPoint(drag.x, drag.y), b = screenPoint(event.clientX, event.clientY);
      r.camera.x += a.x - b.x; r.camera.y += a.y - b.y;
      hooks.redraw();
    }
    drag.x = event.clientX; drag.y = event.clientY;
  });
  r.canvas.addEventListener('pointerup', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const click = !drag.moved; drag = null;
    r.canvas.releasePointerCapture(event.pointerId);
    if (click) api.inspect(screenPoint(event.clientX, event.clientY));
  });
  r.canvas.addEventListener('pointercancel', () => { drag = null; });
  r.canvas.addEventListener('lostpointercapture', () => { drag = null; });
  r.canvas.addEventListener('wheel', event => {
    if (!state.freeCamera || !hooks.available()) return;
    event.preventDefault(); const before = screenPoint(event.clientX, event.clientY);
    r.zoom = clamp(r.zoom * Math.exp(-event.deltaY * 0.0015), 0.5, 40);
    const after = screenPoint(event.clientX, event.clientY); r.camera.x += before.x - after.x; r.camera.y += before.y - after.y; hooks.redraw();
  }, { passive: false });
  function keydown(event: KeyboardEvent): boolean {
    if (!state.active || !hooks.available()) return false;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('#layers-panel, #layers-badge')) {
      if (event.code === 'Escape') { event.preventDefault(); panel.hidden = true; r.canvas.focus(); }
      return true;
    }
    if (!state.freeCamera || target?.closest('input, select, textarea, button')) return false;
    const direction: Record<string, Vec> = { KeyW: { x: 0, y: -1 }, ArrowUp: { x: 0, y: -1 }, KeyS: { x: 0, y: 1 }, ArrowDown: { x: 0, y: 1 }, KeyA: { x: -1, y: 0 }, ArrowLeft: { x: -1, y: 0 }, KeyD: { x: 1, y: 0 }, ArrowRight: { x: 1, y: 0 } };
    const delta = direction[event.code];
    if (delta) { event.preventDefault(); r.camera.x += delta.x * 32 / r.zoom; r.camera.y += delta.y * 32 / r.zoom; hooks.redraw(); return true; }
    return false;
  }
  return { api, refresh, keydown };
}
