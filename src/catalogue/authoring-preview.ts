import './authoring-preview.css';
import { Body, bodyParts, contact, dist, segmentIntersectsBody, vec, type Vec } from '../physics/physics';
import { Game } from '../game/game';
import type { Renderer } from '../rendering/renderer';
import { World } from '../world/world';
import { compileMap } from '../map/compile';
import { assertMap, type MapDocument } from '../map/schema';
import { validateMap } from '../map/validation';
import { objectDefinitions } from '../artwork/catalogue';
import { objectKindRegistry, type ObjectCatalogue } from './schema';
import { inspectAuthoring, type AuthoringReport } from './authoring';

export type AuthoringDriveConfig = Readonly<{ start: Vec; angle?: number; seconds?: number; keys?: readonly string[] }>;
export type AuthoringPreviewInput = Readonly<{ document: MapDocument; entity: string; drive?: AuthoringDriveConfig; catalogue?: ObjectCatalogue }>;

/** Live main-game reading, so a handoff is proven with real physics and time rather than
 * a restored flag or a screenshot that ambient motion could also change. */
export type AuthoringProbe = Readonly<{ mode: string; time: number; position: Vec }>;

export type AuthoringDriveProof = Readonly<{
  passed: boolean;
  contacted: boolean;
  start: Vec;
  impact: Vec;
  end: Vec;
  distance: number;
  seconds: number;
  maxStep: number;
  speedBefore: number;
  /** Player health lost during the run, whichever prop caused it. Informational only:
   * the proof never accepts generic damage as evidence of contact. */
  damage: number;
  /** Health lost by the selected entity's own, initially alive bodies. */
  entityDamage: number;
  destroyed: boolean;
  overlapDepth: number;
  /** The taxi's swept path crossed the selected body during a step. */
  swept: boolean;
  upgrades: Readonly<Record<string, number>>;
  samples: readonly Vec[];
  checks: Readonly<{ droveForward: boolean; noMidDriveTeleport: boolean; physicalContact: boolean; stockVehicle: boolean }>;
}>;

export type AuthoringLayout = Readonly<{
  viewport: Readonly<{ width: number; height: number }>;
  scroll: Readonly<{ width: number; height: number }>;
  hud: Readonly<{ x: number; y: number; width: number; height: number }> | null;
  /** The HUD's own scroll box. Content taller than the panel is reported here, never
   * hidden: the panel scrolls and the inspection tool can reach every line. */
  hudScroll: Readonly<{ top: number; height: number; scrollHeight: number }> | null;
  overflowsViewport: boolean;
  hudOverflowsViewport: boolean;
  hudClipsContent: boolean;
  /** The panel covers a visible on-screen driving control. */
  hudOverlapsControls: boolean;
}>;

export type AuthoringHudReveal = Readonly<{ clipped: boolean; revealed: boolean; scrolled: number; maxScroll: number }>;

export type AuthoringPreviewAPI = Readonly<{
  open(input: AuthoringPreviewInput): { report: AuthoringReport; preview: AuthoringReport['preview']; state: unknown };
  drive(config?: Partial<AuthoringDriveConfig>): AuthoringDriveProof;
  focus(target: 'entity' | 'actor' | 'impact'): void;
  report(): AuthoringReport;
  state(): unknown;
  layout(): AuthoringLayout;
  revealHud(): AuthoringHudReveal;
  handoff(): Readonly<{ restored: boolean; hudHidden: boolean }>;
  probe(): AuthoringProbe;
  realtime(): void;
}>;

export type AuthoringPreviewHooks = Readonly<{
  renderer: Renderer;
  activate(game: Game): void;
  restore(): void;
  freeze(frozen: boolean): void;
  draw(): void;
  refreshChrome(): void;
  silence(): void;
  realtime(): void;
  focus(): void;
  probe(): AuthoringProbe;
}>;

const escapeHTML = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const fmt = (value: number, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '—';

type Mounted = { hud: HTMLElement; legend: HTMLElement };

function mountHud(): Mounted {
  const hud = document.createElement('aside');
  hud.id = 'authoring-hud';
  hud.className = 'authoring-hud';
  hud.setAttribute('aria-label', 'Asset authoring preview');
  hud.dataset.authoring = 'hud';
  const legend = document.createElement('div');
  legend.id = 'authoring-legend';
  legend.className = 'authoring-legend';
  legend.dataset.authoring = 'legend';
  legend.innerHTML = '<span><i class="art"></i>art bounds</span><span><i class="collision"></i>collision</span><span><i class="shadow"></i>shadow</span><span><i class="light"></i>light blocker</span><span><i class="route"></i>route</span>';
  document.body.append(hud, legend);
  document.body.classList.add('authoring-preview');
  return { hud, legend };
}

function renderHud(mounted: Mounted, report: AuthoringReport): void {
  const art = report.artwork;
  const blockers = report.blockers.slice(0, 3);
  const routes = report.nearbyRoutes.slice(0, 2);
  const findings = [...report.routeConflicts, ...report.findings].slice(0, 5);
  const routeText = routes.length
    ? routes.map(route => `${escapeHTML(route.id)} · ${fmt(route.distance)} m${route.conflicts.length ? ` · ${escapeHTML(route.conflicts.join(', '))}` : ''}`).join('<br>')
    : 'none within 26 m';
  const blockerText = blockers.length
    ? blockers.map(blocker => `${escapeHTML(blocker.entityId)} · ${escapeHTML(blocker.kind)}${blocker.penetration > 0 ? ` · ${fmt(blocker.penetration, 2)} m overlap` : ''}`).join('<br>')
    : 'none';
  const findingText = findings.length
    ? findings.map(finding => `<div class="authoring-finding ${finding.severity}"><b>${escapeHTML(finding.code)}</b> ${escapeHTML(finding.entityIds.join(', '))}</div>`).join('')
    : '<div class="authoring-ok">No map findings name this entity.</div>';
  const status = report.preview.allowed ? 'ALLOWED' : 'BLOCKED';
  mounted.hud.dataset.preview = status.toLowerCase();
  mounted.hud.innerHTML = `
    <header><span>ASSET AUTHORING</span><strong>${escapeHTML(report.entity.id)}</strong><em class="authoring-status ${report.preview.allowed ? 'ok' : 'bad'}">${status}</em></header>
    <div class="authoring-grid">
      <div><span>TYPE</span><strong>${escapeHTML(report.entity.type ?? 'dimensions only')} · ${escapeHTML(report.entity.kind)}</strong></div>
      <div><span>COLLISION</span><strong>${report.entity.bodies.map(body => `${fmt(body.width, 2)}×${fmt(body.height, 2)} m`).join(' + ')}</strong></div>
      <div><span>ARTWORK</span><strong>${art ? `${fmt(art.bounds.width, 2)}×${fmt(art.bounds.height, 2)} m` : 'procedural fallback'}</strong></div>
      <div><span>CULL RADIUS</span><strong>${fmt(report.cullingRadius, 2)} m</strong></div>
      <div><span>SHADOW</span><strong>${report.shadow?.casts ? 'casts · ' + report.shadow.silhouette.length + ' pts' : 'none'}</strong></div>
      <div><span>LIGHT</span><strong>${report.lightBlockers.length ? report.lightBlockers.length + ' blocker(s)' : 'no blocker'}</strong></div>
    </div>
    <section class="authoring-routes"><h2>NEARBY ROUTES <small>conflict?</small></h2><p>${routeText}</p></section>
    <section class="authoring-extra"><h2>BLOCKERS</h2><p>${blockerText}</p><h2>FINDINGS</h2>${findingText}</section>
    <footer>${report.map.counts.objectPlacements} props · ${report.map.counts.roads} roads · ${report.map.withinBudgets ? 'within budgets' : 'OVER BUDGET'} · v${report.map.schemaVersion}</footer>`;
  mounted.legend.hidden = false;
}

function resetHud(mounted: Mounted): void {
  mounted.hud.hidden = true;
  mounted.hud.innerHTML = '';
  mounted.legend.hidden = true;
  document.body.classList.remove('authoring-preview');
}

function bounding(report: AuthoringReport): { min: Vec; max: Vec } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const body of report.entity.bodies) {
    const extent = Math.max(body.width, body.artwork?.bounds.width ?? 0, body.cullingRadius * 2);
    minX = Math.min(minX, body.position.x - extent / 2);
    maxX = Math.max(maxX, body.position.x + extent / 2);
    minY = Math.min(minY, body.position.y - extent / 2);
    maxY = Math.max(maxY, body.position.y + extent / 2);
  }
  return { min: vec(minX, minY), max: vec(maxX, maxY) };
}

function cameraFor(hooks: AuthoringPreviewHooks, report: AuthoringReport, target: 'entity' | 'actor' | 'impact', game?: Game): void {
  const renderer = hooks.renderer;
  let bounds = bounding(report);
  if (target !== 'entity' && game) {
    const p = game.actor.position;
    bounds = {
      min: vec(Math.min(bounds.min.x, p.x), Math.min(bounds.min.y, p.y)),
      max: vec(Math.max(bounds.max.x, p.x), Math.max(bounds.max.y, p.y)),
    };
  }
  renderer.camera = vec((bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2);
  const width = Math.max(4, bounds.max.x - bounds.min.x), height = Math.max(4, bounds.max.y - bounds.min.y);
  renderer.zoom = Math.max(1.8, Math.min(20, Math.min(renderer.width * 0.52 / width, renderer.height * 0.52 / height)));
}

function trace(c: CanvasRenderingContext2D, points: readonly Vec[], closed = false): void {
  if (!points.length) return;
  c.beginPath(); c.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) c.lineTo(point.x, point.y);
  if (closed) c.closePath();
}

function label(c: CanvasRenderingContext2D, text: string, position: Vec, size: number, color: string, baseline: CanvasTextBaseline = 'middle'): void {
  c.save(); c.scale(0.05, 0.05);
  c.font = `700 ${size * 20}px "Space Grotesk", sans-serif`; c.textAlign = 'center'; c.textBaseline = baseline;
  c.fillStyle = '#08161d'; c.lineWidth = 4; c.strokeStyle = '#08161d'; c.strokeText(text, position.x * 20, position.y * 20);
  c.fillStyle = color; c.fillText(text, position.x * 20, position.y * 20);
  c.restore();
}

function drawOverlay(renderer: Renderer, report: AuthoringReport): void {
  const c = renderer.ctx;
  c.save();
  c.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
  c.translate(renderer.width * 0.53, renderer.height * 0.54); c.scale(renderer.zoom, renderer.zoom); c.translate(-renderer.camera.x, -renderer.camera.y);
  c.lineJoin = 'round';
  const line = Math.max(0.04, 1.6 / renderer.zoom);
  // Nearby routes first: a real road line under the entity callouts.
  for (const route of report.nearbyRoutes) {
    c.save(); c.globalAlpha = route.conflicts.length ? 0.95 : 0.55;
    trace(c, route.points); c.strokeStyle = route.conflicts.length ? '#ff8d7e' : '#8edbe8'; c.lineWidth = line * 1.8; c.stroke();
    const midpoint = route.points[Math.floor(route.points.length / 2)];
    label(c, `${route.id} ${fmt(route.distance)} m`, vec(midpoint.x, midpoint.y - 1.2), 0.7, route.conflicts.length ? '#ffb1a6' : '#bceff4');
    c.restore();
  }
  // Nearby blockers and route findings are drawn before the entity so its own geometry stays legible.
  for (const blocker of report.blockers.slice(0, 8)) {
    c.save();
    c.strokeStyle = blocker.penetration > 0 ? '#ff8d7e' : '#e9a86f'; c.lineWidth = line; c.setLineDash([0.35, 0.3]);
    for (const outline of blocker.outlines) { trace(c, outline, true); c.stroke(); }
    c.setLineDash([]); c.restore();
  }
  const findingPositions = [...report.routeConflicts, ...report.findings].filter(finding => finding.position);
  for (const finding of findingPositions) {
    const p = finding.position!;
    c.save(); c.strokeStyle = finding.severity === 'error' ? '#ff8d7e' : '#f7ce55'; c.lineWidth = line * 1.4;
    c.beginPath(); c.arc(p.x, p.y, 0.8, 0, Math.PI * 2); c.stroke(); c.restore();
    label(c, finding.code, vec(p.x, p.y + 2.1), 0.62, finding.severity === 'error' ? '#ffb1a6' : '#f7e2a3');
  }
  c.strokeStyle = '#c4a2ee'; c.lineWidth = line * 1.2; c.setLineDash([0.5, 0.32]);
  for (const blocker of report.lightBlockers) { trace(c, blocker.silhouette, true); c.stroke(); }
  c.setLineDash([]);
  for (const body of report.entity.bodies) {
    const art = body.artwork;
    c.save(); c.translate(body.position.x, body.position.y); c.rotate(body.angle);
    if (art) {
      // Shadow silhouette: same compiled outline shifted away from the light.
      c.save(); c.translate(1.1, 1.5);
      trace(c, art.silhouette, true); c.fillStyle = art.castsShadow ? '#0c1d2445' : '#ffffff10'; c.fill();
      c.setLineDash([0.28, 0.24]); c.strokeStyle = '#e9d789'; c.lineWidth = line; c.stroke(); c.setLineDash([]); c.restore();
      // Art bounds are the drawing rectangle, not the collider.
      c.strokeStyle = '#f7ce55'; c.lineWidth = line * 1.2;
      c.strokeRect(art.bounds.x, art.bounds.y, art.bounds.width, art.bounds.height);
      // Art silhouette.
      trace(c, art.silhouette, true); c.strokeStyle = '#f7ce55'; c.lineWidth = line; c.stroke();
    }
    // Physical collision footprint: always the resolved body, never the drawing.
    c.strokeStyle = '#ff8d7e'; c.lineWidth = line * 1.7;
    const physical = new Body(0, 0, Infinity, body.width, body.height);
    physical.collisionRects = body.collisionRects; physical.collisionPolygon = body.collisionPolygon;
    for (const part of bodyParts(physical)) { trace(c, part.corners(), true); c.stroke(); }
    c.restore();
    // Culling radius uses the same compiled artwork the renderer culls with.
    c.save(); c.strokeStyle = '#8edbe8'; c.globalAlpha = 0.7; c.lineWidth = line; c.setLineDash([1.2, 0.9]);
    c.beginPath(); c.arc(body.position.x, body.position.y, body.cullingRadius, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.restore();
    for (const feature of body.features) {
      c.save(); c.fillStyle = feature.role === 'service' ? '#a3ddc2' : '#f7ce55'; c.beginPath(); c.arc(feature.position.x, feature.position.y, 0.42, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#08161d'; c.lineWidth = line; c.stroke(); c.restore();
      label(c, feature.id, vec(feature.position.x, feature.position.y - 1.25), 0.6, feature.role === 'service' ? '#a3ddc2' : '#f7e2a3');
    }
  }
  const primary = report.entity.bodies[0];
  label(c, `${report.entity.id} · ${report.entity.type ?? report.entity.kind}`, vec(primary.position.x, primary.position.y - Math.max(3, primary.height / 2 + 2.4)), 0.9, '#e9e9da');
  c.restore();
}

/** Browser-only authoring harness. It compiles the input exactly once, refuses an invalid
 * draft, and renders the actual game plus overlays generated from that same authority. */
export function createAuthoringPreview(hooks: AuthoringPreviewHooks): AuthoringPreviewAPI {
  const mounted = mountHud();
  let game: Game | undefined;
  let report: AuthoringReport | undefined;
  let driveConfig: Required<Pick<AuthoringDriveConfig, 'start'>> & { angle: number; seconds: number; keys: string[] } | undefined;
  let restored = false;

  const present = () => {
    if (!report || !game) return;
    renderHud(mounted, report);
    hooks.refreshChrome();
    hooks.draw();
    drawOverlay(hooks.renderer, report);
  };
  const snapshot = () => game ? {
    mode: game.mode, time: game.time, health: game.player.damage.health, speed: game.speed,
    position: { ...game.player.body.position }, velocity: { ...game.player.body.velocity },
    upgrades: { ...game.player.upgrades }, persistence: game.persistenceEnabled,
  } : null;

  return {
    open(input) {
      const catalogue = input.catalogue ?? objectDefinitions;
      assertMap(input.document, objectKindRegistry(catalogue));
      const map = compileMap(input.document, catalogue);
      const world = new World(map);
      const validation = validateMap(input.document, map, world);
      report = inspectAuthoring(input.document, input.entity, catalogue, { map, world, validation });
      mounted.hud.hidden = false;
      mounted.legend.hidden = false;
      document.body.classList.add('authoring-preview');
      renderHud(mounted, report);
      if (!report.preview.allowed) {
        // No Game is constructed for an invalid draft. The report and HUD remain
        // inspectable, but the command refuses to present a playable preview.
        hooks.freeze(true);
        return { report, preview: report.preview, state: null };
      }
      const next = new Game(map, false, false);
      next.settings.noPolice = true;
      if (input.drive) {
        next.player.body.position = { ...input.drive.start };
        next.player.body.velocity = vec(0, 0);
        next.player.body.angularVelocity = 0;
        const angle = input.drive.angle ?? Math.atan2(report.entity.position.y - input.drive.start.y, report.entity.position.x - input.drive.start.x);
        next.player.body.angle = angle;
        driveConfig = {
          start: { ...input.drive.start }, angle,
          seconds: input.drive.seconds ?? 3,
          keys: [...(input.drive.keys ?? ['KeyW'])],
        };
      } else driveConfig = undefined;
      next.start();
      // The first-fare notice belongs to normal play, not to an asset review frame.
      next.toast = ''; next.toastTime = 0; next.eventLog = []; next.feedback = [];
      game = next;
      hooks.activate(next); hooks.freeze(true); hooks.silence();
      cameraFor(hooks, report, 'entity', next);
      present();
      return { report, preview: report.preview, state: snapshot() };
    },
    drive(config = {}) {
      if (!game || !report) throw new Error('Open an allowed authoring preview before driving');
      if (!driveConfig) throw new Error('Open with --drive-from to run a physical collision proof');
      const seconds = config.seconds ?? driveConfig.seconds;
      const keys = config.keys ? [...config.keys] : driveConfig.keys;
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 30) throw new Error('Drive duration must be finite and in (0, 30] seconds');
      if (!keys.length || keys.some(key => typeof key !== 'string')) throw new Error('Drive keys must be a non-empty string array');
      hooks.freeze(true);
      const start = { ...game.player.body.position };
      const health = game.player.damage.health;
      // Contact evidence is scoped to the selected entity's own bodies, and only to those
      // that were alive before the first step: an unrelated crate can damage the taxi, and
      // a placement that was already a wreck cannot be credited as this run's collision.
      const tracked = game.world.props.filter(prop => prop.sourceId === report!.entity.id && prop.alive)
        .map(prop => ({ prop, hp: prop.hp }));
      let prev = { ...start }, maxStep = 0, contactAt: { time: number; position: Vec; speed: number; damage: number; entityDamage: number; destroyed: boolean; overlapDepth: number; swept: boolean } | undefined;
      let contactStep = -1;
      const samples: Vec[] = [{ ...start }];
      game.keys = new Set(keys);
      const steps = Math.round(seconds * 120);
      for (let step = 0; step < steps; step++) {
        const before = { ...prev };
        game.update(1 / 120);
        const p = game.player.body.position;
        maxStep = Math.max(maxStep, dist(p, prev)); prev = { ...p };
        if (step % 30 === 0) samples.push({ ...p });
        // Three views of one physical event, all scoped to the selected body: the
        // post-solve overlap (the solver leaves a small residual while the taxi presses
        // into a wall), the swept segment for a step that passes through, and the body's
        // own hp loss or destruction.
        const overlapDepth = tracked.reduce((depth, entry) => Math.max(depth, contact(game!.player.body, entry.prop.body)?.depth ?? 0), 0);
        const swept = tracked.some(entry => segmentIntersectsBody(before, p, entry.prop.body));
        // Structural bodies carry an infinite hp, so only finite pairs contribute damage.
        const entityDamage = tracked.reduce((sum, entry) => sum + (Number.isFinite(entry.hp) && Number.isFinite(entry.prop.hp) ? Math.max(0, entry.hp - entry.prop.hp) : 0), 0);
        const destroyed = tracked.some(entry => !entry.prop.alive);
        if (!contactAt && (overlapDepth > 0 || swept || entityDamage > 0 || destroyed)) {
          contactAt = { time: (step + 1) / 120, position: { ...p }, speed: game.speed, damage: health - game.player.damage.health, entityDamage, destroyed, overlapDepth, swept };
          contactStep = step;
        }
        if (contactAt && step - contactStep >= 18) break;
      }
      game.keys.clear();
      const impact = contactAt?.position ?? { ...game.player.body.position };
      const end = { ...game.player.body.position };
      const distance = dist(start, end);
      const upgradeTotal = Object.values(game.player.upgrades).reduce((sum, level) => sum + level, 0);
      const proof: Omit<AuthoringDriveProof, 'passed'> = {
        contacted: !!contactAt,
        start, impact, end, distance,
        seconds: contactAt?.time ?? seconds,
        maxStep,
        speedBefore: contactAt?.speed ?? game.speed,
        damage: contactAt?.damage ?? health - game.player.damage.health,
        entityDamage: contactAt?.entityDamage ?? 0,
        destroyed: contactAt?.destroyed ?? false,
        overlapDepth: contactAt?.overlapDepth ?? 0,
        swept: contactAt?.swept ?? false,
        upgrades: { ...game.player.upgrades },
        samples,
        checks: {
          droveForward: dist(start, impact) > 1 && (contactAt?.speed ?? game.speed) > 0,
          noMidDriveTeleport: maxStep <= 0.5,
          // Only the selected entity's own response proves the intended collision.
          physicalContact: !!contactAt && (contactAt.overlapDepth > 0 || contactAt.swept || contactAt.entityDamage > 0 || contactAt.destroyed),
          stockVehicle: upgradeTotal === 0,
        },
      };
      const finalProof: AuthoringDriveProof = { ...proof, passed: Object.values(proof.checks).every(Boolean) };
      cameraFor(hooks, report, 'impact', game);
      present();
      return finalProof;
    },
    focus(target) {
      if (!report) throw new Error('Open an authoring preview first');
      cameraFor(hooks, report, target, game);
      present();
    },
    report() {
      if (!report) throw new Error('Open an authoring preview first');
      return report;
    },
    state: snapshot,
    layout() {
      const scroll = { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight };
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const rect = mounted.hud.hidden ? null : mounted.hud.getBoundingClientRect();
      const hud = rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
      const hudScroll = rect ? { top: mounted.hud.scrollTop, height: mounted.hud.clientHeight, scrollHeight: mounted.hud.scrollHeight } : null;
      // Playable controls are the visible on-screen driving controls: the compact HUD
      // (panel and legend) must clear them in landscape, and it never takes their pointer
      // events.
      const controls = Array.from(document.querySelectorAll<HTMLElement>('.touch-controls button, .touch-controls .joystick'))
        .filter(element => element.getClientRects().length > 0)
        .map(element => element.getBoundingClientRect());
      const chrome = [mounted.hud, mounted.legend]
        .filter(element => !element.hidden && element.getClientRects().length > 0)
        .map(element => element.getBoundingClientRect());
      const overlaps = (a: DOMRect, b: DOMRect) => a.x < b.right && a.x + a.width > b.left && a.y < b.bottom && a.y + a.height > b.top;
      return {
        viewport, scroll, hud, hudScroll,
        overflowsViewport: scroll.width > viewport.width + 1 || scroll.height > viewport.height + 1,
        hudOverflowsViewport: !!hud && (hud.x < -0.5 || hud.y < -0.5 || hud.x + hud.width > viewport.width + 0.5 || hud.y + hud.height > viewport.height + 0.5),
        hudClipsContent: !!hudScroll && hudScroll.scrollHeight > hudScroll.height + 1,
        hudOverlapsControls: chrome.some(rect => controls.some(control => overlaps(rect, control))),
      };
    },
    revealHud() {
      const hud = mounted.hud;
      const clipped = hud.scrollHeight > hud.clientHeight + 1;
      const maxScroll = hud.scrollHeight - hud.clientHeight;
      // The panel keeps `pointer-events: none`, so it never blocks the game: inspection
      // tooling scrolls it here and proves the last line is reachable rather than clipped.
      hud.scrollTop = maxScroll;
      const panel = hud.getBoundingClientRect(), last = hud.lastElementChild?.getBoundingClientRect();
      const revealed = !clipped || (!!last && last.bottom <= panel.bottom + 1);
      const scrolled = hud.scrollTop;
      hud.scrollTop = 0;
      return { clipped, revealed, scrolled, maxScroll };
    },
    handoff() {
      return { restored, hudHidden: mounted.hud.hidden };
    },
    probe() {
      return hooks.probe();
    },
    realtime() {
      hooks.freeze(false);
      resetHud(mounted);
      hooks.restore();
      hooks.realtime();
      restored = true;
    },
  };
}
