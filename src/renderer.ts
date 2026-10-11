import { Game, type Vehicle } from './game';
import { add, clamp, dist, length, rotate, scale, sub, vec, type Vec } from './physics';
import { GARAGE, district, type Prop } from './world';
import { drawCorpse, drawFire, drawSmoke } from './effects';
import { LightingLayer, collectLights, cullLights, type LightScene, type LightingRenderOptions, type Viewport } from './lighting';
import { collectOccluders, type Occluder } from './lighting-occlusion';
import type { LightingState } from './day-night';
import { MotorcycleDynamics, leanProjection, motorcycleEngineWorks } from './motorcycle';
import { doorOpenness, LANDING_TIME } from './vehicle-exit';
import { isCountry } from './countryside';
import { radarMarker, radarView } from './radar';
import { CITY_SHORE } from './coast';

import { HARBOUR, PORT_CONTAINERS, PORT_ENTRY, SWAP_CONTAINER } from './harbour';
import { drawBeachGround, drawBeachProp } from './beach-renderer';
import { drawHarbourGround, drawHarbourActivity, drawPortProp } from './harbour-renderer';

const GOLD = '#f7ce55', MINT = '#a3ddc2';

function trace(c: CanvasRenderingContext2D, points: Vec[], closed = false) {
  c.beginPath(); c.moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) c.lineTo(p.x, p.y);
  if (closed) c.closePath();
}

function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as [number, number, number]; };
  const A = parse(a), B = parse(b), k = clamp(t, 0, 1);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`;
}

export class Renderer {
  ctx: CanvasRenderingContext2D; mapCtx: CanvasRenderingContext2D; width = 0; height = 0; dpr = 1; camera = vec(4, 25); zoom = 9; frames = 0; fps = 60; debugColliders = false; debugAI = false;
  lightLayer = new LightingLayer(0.5);
  private sun: Vec = vec(0, 0.5);
  private shadowT = 0;
  private shadowAlpha = 0.4;
  private daylight = 0;
  constructor(public canvas: HTMLCanvasElement, public map: HTMLCanvasElement, public game: Game) {
    this.ctx = canvas.getContext('2d')!; this.mapCtx = map.getContext('2d')!; this.resize(); window.addEventListener('resize', () => this.resize());
  }
  resize() { this.width = window.innerWidth; this.height = window.innerHeight; this.dpr = Math.min(window.devicePixelRatio || 1, 2); this.canvas.width = this.width * this.dpr; this.canvas.height = this.height * this.dpr; this.map.width = 220 * this.dpr; this.map.height = 190 * this.dpr; }
  screen(p: Vec) { return vec((p.x - this.camera.x) * this.zoom + this.width * 0.53, (p.y - this.camera.y) * this.zoom + this.height * 0.54); }
  visible(p: Vec, r = 10) { const s = this.screen(p); return s.x > -r * this.zoom && s.x < this.width + r * this.zoom && s.y > -r * this.zoom && s.y < this.height + r * this.zoom; }
  rect(x: number, y: number, w: number, h: number, color: string, stroke?: string) { const c = this.ctx; c.fillStyle = color; c.fillRect(x, y, w, h); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 0.1; c.strokeRect(x, y, w, h); } }
  circle(p: Vec, r: number, color: string) { const c = this.ctx; c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.fillStyle = color; c.fill(); }
  label(text: string, x: number, y: number, size: number, color: string, weight = '500') { const c = this.ctx; c.font = `${weight} ${size}px "Space Grotesk", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(text, x, y); }
  draw(dt: number) {
    this.frames++; const g = this.game, c = this.ctx, p = g.actor;
    const targetZoom = clamp(Math.min(this.width / 125, this.height / 86), 5, 10.5) * (1 - clamp(g.speed / 160, 0, 0.2));
    this.zoom += (targetZoom - this.zoom) * Math.min(1, dt * 3);
    const wanted = add(p.position, scale(p.velocity, 0.65));
    this.camera = add(this.camera, scale(sub(wanted, this.camera), Math.min(1, dt * 5)));
    const lighting = g.dayNight.lighting;
    this.sun = scale(lighting.sunDirection, Math.max(0, lighting.shadowLength));
    this.shadowT = clamp(lighting.shadowOpacity * 1.4, 0, 1);
    this.shadowAlpha = clamp(0.25 + 0.75 * lighting.shadowOpacity, 0, 1);
    this.daylight = clamp(1 - lighting.darkness, 0, 1);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.fillStyle = mixHex('#183139', '#86a4ad', this.daylight * 0.5); c.fillRect(0, 0, this.width, this.height);
    c.save(); c.translate(this.width * 0.53, this.height * 0.54); c.scale(this.zoom, this.zoom); c.translate(-this.camera.x, -this.camera.y);
    this.ground();
    g.fx.drawGround(c, g.settings.gore);
    const marks = new Map<string, typeof g.skids>();
    for (const s of g.skids) {
      if (s.blood && !g.settings.gore || !this.visible(scale(add(s.a, s.b), 0.5), dist(s.a, s.b) / 2 + 1)) continue;
      const key = `${s.blood ? 'blood' : s.sand ? 'sand' : 'road'}:${Math.min(4, Math.ceil(s.life / 18 / 0.15))}`;
      const batch = marks.get(key) ?? []; batch.push(s); marks.set(key, batch);
    }
    // At most 12 visible paths, rather than one canvas stroke per physics mark.
    for (const [key, batch] of marks) {
      const [type, alpha] = key.split(':'); c.globalAlpha = Number(alpha) * 0.15;
      c.strokeStyle = type === 'blood' ? '#7c1726' : type === 'sand' ? '#a88d5f' : '#11191b';
      c.lineWidth = type === 'sand' ? 0.3 : type === 'blood' ? 0.32 : 0.23;
      c.beginPath(); for (const s of batch) { c.moveTo(s.a.x, s.a.y); c.lineTo(s.b.x, s.b.y); } c.stroke();
    }
    c.globalAlpha = 1;
    for (const prop of g.world.props) if (this.visible(prop.body.position, Math.max(prop.body.w, prop.body.h))) this.prop(prop);
    this.campaignFrontages();
    for (const person of g.world.people) if (this.visible(person.position, 2)) {
      if (person.aboard) continue;
      if (!person.alive) { if (g.settings.gore && person.deathTime >= 0) drawCorpse(c, person); continue; }
      const pp = person.position, so = this.shadowOffset();
      if (person.fall) {
        const airborne = person.fall.elapsed < LANDING_TIME;
        const hop = airborne ? 0.3 * Math.sin(person.fall.elapsed / LANDING_TIME * Math.PI) : 0;
        this.circle(add(pp, vec(0.18, 0.26)), 0.46, '#13242a77');
        c.save(); c.translate(pp.x, pp.y - hop); c.rotate(person.angle + Math.PI / 2);
        this.rect(-0.27, -0.46, 0.54, 0.92, person.color, '#9e7847');
        this.circle(vec(0, -0.6), 0.28, '#e0c6a2');
        for (const side of [-1, 1]) {
          this.rect(side * 0.29 - 0.22, -0.18, 0.2, 0.65, '#263942');
          this.rect(side * 0.19 - 0.1, 0.4, 0.2, 0.48, '#243740');
        }
        c.restore();
        continue;
      }
      c.globalAlpha = this.shadowAlpha; this.circle(add(pp, add(vec(0.18, 0.22), so)), 0.4, '#0d1a2280'); c.globalAlpha = 1;
      c.save(); c.translate(pp.x, pp.y); c.rotate(Math.sin(g.time * 3 + person.phase) * 0.2);
      this.rect(-0.22, -0.1, 0.44, 0.6, person.color); this.circle(vec(0, -0.22), 0.23, '#dfc4ab');
      this.rect(-0.33, 0.05, 0.14, 0.36, person.color); this.rect(0.2, person.panic > 0 ? -0.35 : 0.05, 0.14, 0.36, person.color);
      c.restore();
    }
    for (const v of g.vehicles) if (v.alive && this.visible(v.body.position)) this.car(v);
    if (g.onFoot && !(g.mode === 'wasted' && g.wastedReason === 'drowning')) {
      const p = g.driver.position, tumble = g.tumble;
      this.circle(p, 1.05, '#f7ce5525'); c.strokeStyle = GOLD; c.lineWidth = 0.12; c.beginPath(); c.arc(p.x, p.y, 1.05, 0, Math.PI * 2); c.stroke();
      c.save(); c.translate(p.x, p.y);
      if (tumble) {
        // An elongated, spinning prone body rather than the upright walking sprite.
        // Ground shadow and scuff streaks keep the roll readable at normal game zoom.
        const airborne = tumble.elapsed < LANDING_TIME;
        const wriggle = Math.sin(tumble.elapsed * (tumble.bike ? 27 : 20)) * 0.23;
        this.circle(vec(0.18, 0.27), 0.48, '#12212866');
        c.translate(0, airborne ? -0.32 * Math.sin(tumble.elapsed / LANDING_TIME * Math.PI) : 0);
        c.rotate(g.driver.angle + Math.PI / 2);
        this.rect(-0.28, -0.48, 0.56, 1.04, GOLD, '#deaa46');
        this.circle(vec(0, -0.62), 0.3, '#dfc4ab');
        for (const side of [-1, 1]) {
          c.save(); c.translate(side * 0.29, -0.25); c.rotate(side * (0.25 + wriggle));
          this.rect(side > 0 ? 0 : -0.48, -0.13, 0.48, 0.19, '#e5bc8c'); c.restore();
          c.save(); c.translate(side * 0.16, 0.48); c.rotate(side * (0.25 - wriggle));
          this.rect(-0.11, 0, 0.22, 0.55, '#273c44'); c.restore();
        }
      } else {
        c.rotate(g.driver.angle + Math.PI / 2 + (g.driverHealth <= 0 ? 1.3 : 0));
        const stride = Math.sin(g.time * 17) * Math.min(g.speed / 5.5, 1) * 0.15;
        this.rect(-0.24, -0.05, 0.48, 0.6, GOLD); this.circle(vec(0, -0.23), 0.24, '#dfc4ab');
        this.rect(-0.26, 0.42 + stride, 0.18, 0.32, '#273c44'); this.rect(0.08, 0.42 - stride, 0.18, 0.32, '#273c44');
      }
      c.restore();
    }
    drawHarbourActivity(this);
    g.fx.drawAir(c, g.time, g.settings.gore);
    c.restore();
    this.lightingPass(lighting);
    // Navigation, labels and debug feedback are redrawn above the lighting pass so night never
    // hides the destination markers or the player's read-outs.
    c.save(); c.translate(this.width * 0.53, this.height * 0.54); c.scale(this.zoom, this.zoom); c.translate(-this.camera.x, -this.camera.y);
    if (this.visible(PORT_ENTRY, 10)) this.label('HARBOUR / $75', PORT_ENTRY.x, PORT_ENTRY.y + 3, 0.9, '#a3ddc2', '700');
    this.marker(GARAGE, '#a7bcca', 'PIT STOP', true);
    if (g.campaignEnabled) this.marker(g.newsroom, '#d5b6e4', 'NEWSROOM', true);
    const target = g.job.stage === 'pickup' ? g.job.pickup : g.job.dropoff; this.marker(target, g.job.stage === 'pickup' ? GOLD : MINT, g.job.stage === 'pickup' ? 'PICK UP' : 'DROP OFF');
    if (g.job.stage === 'pickup') for (const offer of g.missionOffers.values()) if (offer !== g.job) {
      this.marker(offer.pickup, '#8edbe8', `TEXT / ${offer.name.toUpperCase()}`, true);
    }
    for (const person of g.world.people) if (person.alive && !person.aboard && person.panic > 0 && this.visible(person.position, 2)) this.label('!', person.position.x, person.position.y - 1, 1.1, GOLD, '700');
    if (g.job.stage === 'pickup') {
      const person = g.world.people.find(p => p.id === g.job.customerId), waiting = person?.position ?? add(g.job.pickup, vec(3.4, 0));
      if (g.job.type === 'parcel') {
        this.rect(waiting.x - 0.45, waiting.y - 0.35, 0.9, 0.7, '#dca668', '#fff0ba');
        this.rect(waiting.x - 0.08, waiting.y - 0.35, 0.16, 0.7, '#ffe6af');
      } else { const waving = add(waiting, vec(0.6, -0.3 - Math.sin(g.time * 6) * 0.2)); this.circle(waving, 0.18, GOLD); }
      this.label(g.job.type === 'parcel' ? 'PARCEL PICKUP' : g.job.name.toUpperCase(), waiting.x, waiting.y - 1.8, 0.8, GOLD, '700');
    }
    for (const v of g.vehicles) if (v.model === 'motorcycle' && v.parked && dist(v.body.position, g.actor.position) < 18)
      this.label(!motorcycleEngineWorks(v.damage) ? 'BIKE DISABLED' : (v.dynamics as MotorcycleDynamics).fallen ? 'FALLEN BIKE · E TO LIFT' : 'MOTORBIKE',
        v.body.position.x, v.body.position.y - 2, 0.65, motorcycleEngineWorks(v.damage) ? '#8edbe8' : '#ee8675', '700');
    for (const v of g.vehicles) if (v.model === 'pickup' && v.parked && !v.sinking && v.damage.status !== 'wreck' && v.damage.status !== 'burning' && dist(v.body.position, g.actor.position) < 18) this.label('PICKUP / OFF-ROAD', v.body.position.x, v.body.position.y - 2, 0.65, '#8edbe8', '700');
    if (g.onFoot) {
      const p = g.driver.position;
      this.label(g.tumble ? g.tumble.grounded ? 'ROLLING!' : 'JUMP!' : 'YOU', p.x, p.y - 1.8, 0.72, GOLD, '700');
      const car = g.nearestCar; if (car) this.marker(car.body.position, '#8edbe8', g.enterableCar ? car.definition.graphics.sprite === 'motorcycle' ? 'E · RIDE' : 'E · GET IN' : car.definition.graphics.sprite === 'motorcycle' ? 'COURIER BIKE' : 'REPLACEMENT CAR');
    }
    this.debug();
    for (const feedback of g.feedback) {
      if (!this.visible(feedback.position, 3)) continue;
      c.globalAlpha = Math.min(1, feedback.life / 0.7); this.label(feedback.text, feedback.position.x, feedback.position.y, 1.3, feedback.color, '700');
    }
    c.globalAlpha = 1; c.restore(); this.edgePointer(); this.minimap();
  }
  private shadowOffset(angle = 0): Vec {
    const contact = vec(0.16, 0.22);
    const world = add(scale(contact, 1 - this.shadowT), scale(this.sun, -this.shadowT));
    return angle ? rotate(world, -angle) : world;
  }
  /** Signs and boarded windows sit on existing map bodies; no decorative colliders. */
  private campaignFrontages() {
    const g = this.game;
    if (!g.campaignEnabled) return;
    const c = this.ctx, { cafe, newsroom, hotel } = g.campaignSites, shift = g.save.campaign.shift;
    if (cafe && this.visible(cafe.body.position, 12)) {
      const b = cafe.body; c.save(); c.translate(b.position.x, b.position.y); c.rotate(b.angle);
      this.rect(-4.1, 2.6, 8.2, 1.4, '#223b3c'); this.label('GARDEN CAFÉ', 0, 3.3, 0.7, '#f0dfb7', '700');
      if (shift >= 3) {
        for (const x of [-3.5, -1.2, 1.1, 3.4]) { this.rect(x - 0.8, -4.1, 1.6, 1.7, '#856f55'); this.rect(x - 0.8, -3.5, 1.6, 0.16, '#c3aa80'); }
        this.rect(-4, 4.4, 8, 0.9, '#76654c');
        this.label(g.save.story.flags.includes('tenant-interview-reached') ? 'TENANCY UNDER REVIEW' : 'MERIDIAN SITE SERVICES', 0, 5.8, 0.55, '#e9c788', '700');
      }
      if (g.save.story.flags.includes('vale-road-reported') && shift >= 2) { this.rect(-7, -4, 1.5, 7, '#566564'); this.label('REPAIRED', -6.3, 4.2, 0.45, '#b6c7b8'); }
      c.restore();
    }
    if (newsroom && this.visible(newsroom.body.position, 12)) {
      const p = newsroom.body.position; this.rect(p.x - 4, p.y + 2.5, 8, 1.5, '#47384f'); this.label('CITY DESK', p.x, p.y + 3.2, 0.7, '#e4d8ee', '700');
    }
    if (hotel && this.visible(hotel.body.position, 12)) {
      const p = hotel.body.position, exposed = g.save.campaign.publications.some(pub => pub.allegation === 'knowledge');
      this.rect(p.x - 4, p.y + 4.4, 8, 1.5, exposed ? '#665f59' : '#355d60');
      this.label(exposed ? 'APPEARANCE CANCELLED' : shift >= 9 ? 'OPEN SHORE / VALE' : 'CIVIC RENEWAL', p.x, p.y + 5.1, 0.52, '#eee6c8', '700');
    }
  }
  private shadowRect(x: number, y: number, w: number, h: number, color: string) { this.ctx.save(); this.ctx.globalAlpha *= this.shadowAlpha; this.rect(x, y, w, h, color); this.ctx.restore(); }
  private shadowCircle(p: Vec, r: number, color: string) { this.ctx.save(); this.ctx.globalAlpha *= this.shadowAlpha; this.circle(p, r, color); this.ctx.restore(); }
  private worldViewport(): Viewport {
    const left = this.camera.x + (0 - this.width * 0.53) / this.zoom, right = this.camera.x + (this.width - this.width * 0.53) / this.zoom;
    const top = this.camera.y + (0 - this.height * 0.54) / this.zoom, bottom = this.camera.y + (this.height - this.height * 0.54) / this.zoom;
    return { minX: left, minY: top, maxX: right, maxY: bottom };
  }
  /** Alive raised structures visible (plus a small margin) that mask/clip street-level beams. */
  private worldOccluders(): Occluder[] {
    return collectOccluders(this.game.world.props, this.worldViewport());
  }
  private lightingPass(lighting: LightingState) {
    const g = this.game;
    const scene: LightScene = {
      time: g.time, artificial: clamp(lighting.artificialLight, 0, 1), playerId: g.player.id, playerOnFoot: g.onFoot,
      playerBoosting: !g.onFoot && g.mode === 'playing' && g.controls.boost === true && g.boost > 1, arrest: g.arrest,
      vehicles: g.vehicles, props: g.world.props, blasts: g.fx.blasts,
    };
    const viewport = this.worldViewport();
    const lights = cullLights(collectLights(scene), viewport);
    const occluders = this.worldOccluders();
    const options: LightingRenderOptions = { width: this.width, height: this.height, dpr: this.dpr, state: lighting, lights, zoom: this.zoom, project: point => this.screen(point), occluders };
    this.lightLayer.render(this.ctx, options);
  }
  ground() {
    const c = this.ctx, g = this.game;
    // Water fills the view first; both land masses cover it with their actual shoreline.
    c.strokeStyle = mixHex('#31505a', '#9bc0c6', this.daylight * 0.5); c.lineWidth = 0.12;
    const minX = this.camera.x - this.width / this.zoom, maxX = this.camera.x + this.width / this.zoom;
    for (let y = Math.floor((this.camera.y - this.height / this.zoom) / 7) * 7; y < this.camera.y + this.height / this.zoom; y += 7) {
      c.beginPath(); for (let x = minX; x < maxX; x += 3) { const yy = y + Math.sin(x * 0.5 + g.time * 0.3) * 0.3; if (x === minX) c.moveTo(x, yy); else c.lineTo(x, yy); } c.stroke();
    }
    // The base palette was authored for a night city; lift it toward daylight so morning/afternoon
    // do not read as a darker night before the ambient lighting pass is applied.
    this.rect(CITY_SHORE.min, CITY_SHORE.min, CITY_SHORE.max - CITY_SHORE.min, CITY_SHORE.max - CITY_SHORE.min, mixHex('#29383e', '#84938a', this.daylight * 0.45), '#bac2a5');
    this.countrysideGround();
    drawHarbourGround(this);
    for (const b of g.world.blocks) {
      if (!this.visible(vec(b.x + 20, b.y + 20), 30)) continue;
      this.rect(b.x + 6, b.y + 6, 28, 28, '#596361'); this.rect(b.x + 6.5, b.y + 6.5, 27, 27, b.park ? '#345b4a' : '#444c4b');
      c.strokeStyle = '#68726b'; c.lineWidth = 0.08;
      for (let i = 7; i < 34; i += 2) { c.beginPath(); c.moveTo(b.x + 6, b.y + i); c.lineTo(b.x + 34, b.y + i); c.stroke(); c.beginPath(); c.moveTo(b.x + i, b.y + 6); c.lineTo(b.x + i, b.y + 34); c.stroke(); }
      if (b.park) {
        this.rect(b.x + 18.8, b.y + 6.5, 2.4, 27, '#a9aa82'); this.rect(b.x + 6.5, b.y + 18.8, 27, 2.4, '#a9aa82');
        this.circle(vec(b.x + 20, b.y + 20), 3.7, '#697e6c'); this.circle(vec(b.x + 20, b.y + 20), 2.7, '#6ea6b2'); this.circle(vec(b.x + 20, b.y + 20), 1.5, '#9ac9cd'); this.label('CITY GARDENS', b.x + 20, b.y + 30, 1, '#bdd7ac');
      } else if (b.special === 'fuel') {
        this.rect(b.x + 7, b.y + 7, 26, 26, '#485152');
        this.rect(b.x + 9, b.y + 9, 22, 8, '#b8965a18', '#b8965a55');
        this.label('LAST CHANCE', b.x + 20, b.y + 7.8, 1.1, '#e3c487', '700');
        for (let i = 0; i < 3; i++) { this.rect(b.x + 11 + i * 8, b.y + 10, 4, 0.12, '#d8c299'); this.rect(b.x + 11 + i * 8, b.y + 16, 4, 0.12, '#d8c299'); }
        this.label('FUEL / EXIT →', b.x + 26, b.y + 28, 0.65, '#b9c3b8');
      } else if (b.special === 'parking') {
        this.rect(b.x + 7, b.y + 7, 26, 26, '#303e43');
        this.rect(b.x + 6, b.y + 17, 28, 6, '#29383e');
        this.label('P / PUBLIC PARKING', b.x + 20, b.y + 20, 0.9, '#a8c6cd', '700');
      } else { this.rect(b.x + 19, b.y + 8, 3, 24, '#333d40'); this.rect(b.x + 8, b.y + 19, 24, 3, '#333d40'); }
      // Curb paint and small planted corners.
      this.rect(b.x + 6, b.y + 6, 4, 0.25, '#e3c36c'); this.rect(b.x + 30, b.y + 33.8, 4, 0.25, '#e3c36c');
    }
    for (const spot of g.world.parking) if (this.visible(spot.position, 5)) {
      c.save(); c.translate(spot.position.x, spot.position.y); c.rotate(spot.angle); c.strokeStyle = '#a9b9ae70'; c.lineWidth = 0.1;
      c.strokeRect(-2.7, -1.55, 5.4, 3.1); this.label('P', 0, 0, 0.65, '#9db4ba80'); c.restore();
    }
    c.strokeStyle = '#8c96866b'; c.lineWidth = 0.1; c.setLineDash([1.9, 2.9]);
    for (let s = 0; s <= 240; s += 40) { c.beginPath(); c.moveTo(s, -12); c.lineTo(s, 252); c.stroke(); c.beginPath(); c.moveTo(-12, s); c.lineTo(252, s); c.stroke(); } c.setLineDash([]);
    // Double center lines and crossings keep roads legible at high speed.
    for (let x = 0; x <= 240; x += 40) for (let y = 0; y <= 240; y += 40) {
      if (!this.visible(vec(x, y), 12)) continue;
      this.rect(x - 5.8, y - 5.8, 11.6, 11.6, '#29383e');
      for (let i = -4; i <= 4; i += 1.5) {
        this.rect(x + i, y - 7.7, 0.7, 2, '#9ba39b9a'); this.rect(x + i, y + 5.7, 0.7, 2, '#9ba39b9a');
        this.rect(x - 7.7, y + i, 2, 0.7, '#9ba39b9a'); this.rect(x + 5.7, y + i, 2, 0.7, '#9ba39b9a');
      }
      this.rect(x + 2.4, y + 8, 3, 0.2, '#bdc4b59a'); this.rect(x - 5.4, y - 8.2, 3, 0.2, '#bdc4b59a');
    }
    this.label('H A R B O U R   A V E', 64, -2.2, 1.1, '#81908f');
    c.save(); c.translate(-2.3, 72); c.rotate(-Math.PI / 2); this.label('W E S T   S T R E E T', 0, 0, 1.1, '#81908f'); c.restore();
    this.label('M A R K E T   S T R E E T', 62, 117.7, 1.1, '#81908f');
    drawBeachGround(this);
    // Workshop's apron, immediately beside the starting cab.
    this.rect(6.2, 24, 2.5, 8, '#a0b89d'); this.label('TAXI', 7.4, 28, 0.65, '#29483e', '700');
  }
  countrysideGround() {
    const { HIGHLAND_OUTLINE, RIDGES, HIGHLAND_STOPS, COUNTRY_ROADS, BRIDGE_Y, LABELS } = this.game.map.country;
    const c = this.ctx;
    trace(c, HIGHLAND_OUTLINE, true); c.fillStyle = mixHex('#29483a', '#6b835e', this.daylight * 0.35); c.fill();
    c.strokeStyle = '#9da17b'; c.lineWidth = 2; c.stroke();
    for (const [i, ridge] of RIDGES.entries()) {
      trace(c, ridge, true); c.fillStyle = mixHex('#47554a', '#949080', this.daylight * 0.5); c.fill();
      const center = ridge.reduce((a, p) => add(a, scale(p, 1 / ridge.length)), vec());
      for (const k of [0.85, 0.65, 0.45]) {
        const contour = ridge.map(p => add(center, scale(sub(p, center), k)));
        trace(c, contour, true); c.strokeStyle = '#bec0a337'; c.lineWidth = 0.45; c.stroke();
      }
      trace(c, [ridge[0], center, ridge[2], ridge[4]]); c.strokeStyle = '#263b3880'; c.lineWidth = 1.2; c.stroke();
      if (i === 0) { trace(c, [vec(426, 16), vec(444, 12), vec(455, 20), vec(441, 24), vec(436, 20)], true); c.fillStyle = '#c9cfbd'; c.fill(); }
    }
    for (const stop of HIGHLAND_STOPS) {
      c.beginPath(); c.ellipse(stop.position.x, stop.position.y, 14, 12, 0, 0, Math.PI * 2); c.fillStyle = '#7c816049'; c.fill();
    }
    this.countryEstates();
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const road of COUNTRY_ROADS) {
      trace(c, road.points); c.strokeStyle = road.bridge ? '#7d8985' : '#89917a'; c.lineWidth = road.bridge ? 15 : 15.5; c.stroke();
    }
    for (const road of COUNTRY_ROADS) {
      trace(c, road.points); c.strokeStyle = '#354747'; c.lineWidth = 12; c.stroke();
    }
    for (const road of COUNTRY_ROADS) {
      trace(c, road.points);
      c.strokeStyle = '#ddcb8880'; c.lineWidth = 0.16; c.setLineDash([2.4, 3]); c.stroke(); c.setLineDash([]);
    }
    for (const y of BRIDGE_Y) {
      for (let x = 256; x < 298; x += 4) {
        this.rect(x, y - 6, 0.13, 12, '#b6c1ac3b');
        this.rect(x, y - 8.1, 0.7, 1.1, '#c4c9b4'); this.rect(x, y + 7, 0.7, 1.1, '#c4c9b4');
      }
      this.label(y === 80 ? 'P I N E   B R I D G E' : 'F E R N   B R I D G E', 277, y - 11, 0.85, '#cfddcb', '600');
      this.label('WOODS / RIDGE →', 233, y - 10, 0.8, '#b9d5bc', '600');
    }
    for (const stop of HIGHLAND_STOPS) this.label(stop.name.toUpperCase(), stop.position.x, stop.position.y + 10, 0.9, '#c7d5ad', '700');
    for (const l of LABELS) this.label(l.text, l.position.x, l.position.y, l.size, l.color);
    c.lineJoin = 'miter'; c.lineCap = 'butt';
  }
  countryEstates() {
    const { VILLAS, VILLA_DRIVES, VILLA_POOLS, GOLF_COURSE, GOLF_HOLES, GOLF_PATH } = this.game.map.country;
    const c = this.ctx;
    for (const [i, villa] of VILLAS.entries()) {
      const p = villa.position;
      if (!this.visible(p, 40)) continue;
      this.rect(p.x - 21, p.y - 17, 42, 34, '#547452');
      this.rect(p.x - 19, p.y - 15, 38, 30, '#76926240', '#d9d1ad65');
      trace(c, VILLA_DRIVES[i]); c.strokeStyle = '#b3b098'; c.lineWidth = 5; c.stroke();
      this.rect(p.x - 9, p.y + 5, 18, 7, '#c7b697'); // stone terrace
      this.rect(p.x + 10, p.y - 4, 8.5, 14, '#d4cbb2');
      const pool = VILLA_POOLS[i];
      this.rect(pool.position.x - pool.width / 2, pool.position.y - pool.height / 2, pool.width, pool.height, '#57a9b4', '#e3e2c9');
      this.rect(p.x + 11.5, p.y - 2.5, 1, 11, '#b5e1de65');
      for (const y of [-8, -5]) { this.rect(p.x + 13, p.y + y, 3.4, 1.1, '#e9dcc0'); this.rect(p.x + 13.7, p.y + y, 0.4, 1.1, '#ab9274'); }
      this.circle(vec(p.x - 12, p.y + 8), 1.7, '#efe4c8');
      this.circle(vec(p.x - 12, p.y + 8), 0.2, '#9d7b59');
      for (const dx of [-17, 17]) for (const dy of [-12, 12]) {
        this.circle(vec(p.x + dx, p.y + dy), 1.5, '#38583e');
        this.circle(vec(p.x + dx - 0.25, p.y + dy - 0.25), 1.1, '#698554');
      }
      this.label(villa.name, p.x, p.y + 14, 0.72, '#f3e6c7', '600');
    }
    const club = GOLF_COURSE;
    this.rect(club.center.x - club.width / 2 - 7, club.center.y - club.height / 2 - 4, club.width + 14, club.height + 8, '#3b6346');
    trace(c, GOLF_PATH);
    c.strokeStyle = '#b8b395'; c.lineWidth = 2.4; c.stroke();
    this.rect(club.clubhouse.x - 10, club.clubhouse.y - 9, 20, 22, '#b8aa87');
    for (const [i, hole] of GOLF_HOLES.entries()) {
      const center = scale(add(hole.tee, hole.green), 0.5), angle = Math.atan2(hole.green.y - hole.tee.y, hole.green.x - hole.tee.x);
      c.save(); c.beginPath(); c.ellipse(center.x, center.y, dist(hole.tee, hole.green) / 2 + 6, 4.3, angle, 0, Math.PI * 2); c.clip();
      this.rect(center.x - 40, center.y - 10, 80, 20, '#7b9b59');
      for (let x = center.x - 40; x < center.x + 40; x += 5) this.rect(x, center.y - 10, 2.5, 20, '#acc77829');
      c.restore();
      c.beginPath(); c.ellipse(hole.bunker.x, hole.bunker.y, 5, 2.2, -0.35, 0, Math.PI * 2); c.fillStyle = '#d9c69a'; c.fill();
      c.beginPath(); c.ellipse(hole.green.x, hole.green.y, 5, 3.6, 0.2, 0, Math.PI * 2); c.fillStyle = '#a5bd72'; c.fill();
      this.circle(hole.green, 0.22, '#253d30');
      this.rect(hole.green.x, hole.green.y - 2.1, 0.1, 2.1, '#efe9d1');
      trace(c, [vec(hole.green.x, hole.green.y - 2.1), vec(hole.green.x + 1.3, hole.green.y - 1.7), vec(hole.green.x, hole.green.y - 1.3)], true); c.fillStyle = '#e87663'; c.fill();
      this.rect(hole.tee.x - 1.8, hole.tee.y - 0.8, 3.6, 1.6, '#425f42');
      this.label(String(i + 1), hole.tee.x - 3, hole.tee.y, 0.65, '#efe6bb', '700');
    }
    // Carts are rendered from physical vehicles, rather than painted decorations.
    c.beginPath(); c.ellipse(club.center.x + 41, club.center.y - 12, 6, 3.3, 0.4, 0, Math.PI * 2); c.fillStyle = '#569097'; c.fill(); c.strokeStyle = '#bec79a'; c.lineWidth = 0.5; c.stroke();
    this.label('FAIRWAY COUNTRY CLUB', club.center.x, club.center.y - 21, 0.95, '#e8dfb4', '700');
  }
  marker(p: Vec, color: string, label: string, garage = false) {
    if (!this.visible(p, 10)) return; const c = this.ctx, g = this.game;
    c.save(); c.translate(p.x, p.y); c.strokeStyle = color; c.fillStyle = color + '12'; c.lineWidth = 0.15;
    if (garage) { c.setLineDash([0.5, 0.4]); c.strokeRect(-3.8, -4.7, 7.6, 9.4); c.setLineDash([]); this.label('⚒', 0, 0, 2, color); }
    else { c.beginPath(); c.arc(0, 0, 5 + Math.sin(g.time * 3) * 0.2, 0, Math.PI * 2); c.fill(); c.stroke(); c.beginPath(); c.arc(0, 0, 4.6, -Math.PI / 2, -Math.PI / 2 + g.job.wait / 0.8 * Math.PI * 2); c.lineWidth = 0.45; c.stroke(); this.label(g.job.stage === 'pickup' ? '↓' : '✓', 0, 0, 2.4, color, '700'); }
    this.label(label, 0, garage ? 6 : -6.5, 0.9, color, '700'); c.restore();
  }
  prop(prop: Prop) {
    if (drawBeachProp(this, prop) || drawPortProp(this, prop)) return;
    const c = this.ctx, b = prop.body, so = this.shadowOffset(b.angle);
    c.save(); c.translate(b.position.x, b.position.y); c.rotate(b.angle);
    if (!prop.alive) {
      if (prop.kind === 'guardrail') {
        // Broken ends remain legible while the middle becomes a drivable gap.
        for (const side of [-1, 1]) {
          c.save(); c.translate(side * (b.w / 2 - 0.55), 0); c.rotate(side * 0.45);
          this.rect(-0.65, -0.12, 1.3, 0.24, '#a7b9b1'); this.rect(side * 0.3, -0.35, 0.25, 0.7, '#d3cf9c'); c.restore();
        }
      } else if (prop.kind === 'hydrant') { this.circle(vec(), 1.7, '#6ba2b63c'); this.circle(vec(), 0.3, '#343d41'); }
      else {
        const large = b.w > 5 || b.h > 5;
        this.rect(-b.w / 2, -b.h / 2, b.w, b.h, '#18232860');
        for (let i = 0; i < (large ? 32 : 4); i++) { const x = ((prop.id * 13 + i * 7) % 31 / 31 - 0.5) * b.w * 1.2, y = ((prop.id * 7 + i * 5) % 29 / 29 - 0.5) * b.h * 1.3; this.rect(x, y, large ? 0.5 + i % 3 * 0.4 : Math.min(0.5, b.w / 3), large ? 0.4 + i % 2 * 0.4 : Math.min(0.35, b.h / 3), i % 3 ? prop.color : '#858579'); }
        if (large) this.label('RUBBLE / CLEAR', 0, 0, 0.7, '#d4cbb0');
      }
      if (prop.fire > 0) drawFire(c, vec(), prop.kind === 'station' ? 3 : 1.4, this.game.time, prop.id);
      c.restore(); return;
    }
    if (prop.kind === 'guardrail') {
      this.rect(-b.w / 2, -b.h / 2, b.w, b.h, '#314847');
      this.rect(-b.w / 2, -b.h / 2 - 0.12, b.w, b.h * 0.55, prop.color);
      for (let x = -b.w / 2 + 1; x < b.w / 2; x += 4) this.rect(x, -b.h / 2, 0.4, b.h + 0.4, '#d3cf9c');
    } else if (prop.kind === 'rock') {
      const w = b.w / 2, h = b.h / 2;
      const shape = [vec(-w, -h * 0.55), vec(-w * 0.65, -h), vec(w * 0.45, -h), vec(w, -h * 0.2), vec(w * 0.8, h), vec(-w * 0.5, h), vec(-w, h * 0.4)];
      c.save(); c.translate(so.x + 0.5, so.y + 0.5); trace(c, shape, true); c.fillStyle = '#142b3280'; c.fill(); c.restore();
      trace(c, shape, true); c.fillStyle = prop.color; c.fill(); c.strokeStyle = '#b4b49a70'; c.lineWidth = 0.12; c.stroke();
      trace(c, [vec(-w * 0.65, -h), vec(-w * 0.2, 0), vec(w * 0.8, h)]); c.strokeStyle = '#33484070'; c.stroke();
    } else if (prop.kind === 'building' && (prop.label.startsWith('VILLA ') || prop.label === 'FAIRWAY CLUB')) {
      const w = b.w, h = b.h;
      this.shadowRect(-w / 2 + so.x + 0.8, -h / 2 + so.y + 1, w, h, '#14282080');
      this.rect(-w / 2, -h / 2, w, h, '#e3d6b8', '#f4e6c5');
      this.rect(-w / 2 - 0.3, -h / 2 - 0.6, w + 0.6, h, prop.color, '#e9cbaa');
      trace(c, [vec(-w / 2, -h / 2 - 0.6), vec(-w / 2 + 2, -0.6), vec(w / 2 - 2, -0.6), vec(w / 2, -h / 2 - 0.6)]);
      c.strokeStyle = '#ebc7a06b'; c.lineWidth = 0.18; c.stroke();
      for (let y = -h / 2 + 0.2; y < h / 2 - 0.6; y += 0.65) this.rect(-w / 2 + 0.5, y, w - 1, 0.08, '#513d3530');
      this.rect(-w / 2 + 2, -0.75, w - 4, 0.35, '#694b3b');
      this.rect(-2, -3.9, 3.5, 1.7, '#83b0b57d', '#ddd3b4');
      this.rect(w / 2 - 3.5, -h / 2 + 1, 1, 1.4, '#ddd3be');
      for (let x = -w / 2 + 1; x < w / 2 - 1; x += 2.6) this.rect(x, h / 2 - 0.9, 1.4, 0.75, '#ffe3a0');
      this.rect(-1.3, h / 2 - 0.5, 2.6, 0.8, '#675648');
    } else if (prop.kind === 'building') {
      this.shadowRect(-b.w / 2 + 0.8 + so.x, -b.h / 2 + 1.3 + so.y, b.w + 0.5, b.h + 0.5, '#13212870');
      this.rect(-b.w / 2, -b.h / 2, b.w, b.h, '#202f37');
      this.rect(-b.w / 2 - 0.25, -b.h / 2 - 0.6, b.w, b.h, prop.color, '#84938c50');
      if (b.w <= 12) {
        this.rect(-b.w / 2 + 0.3, -b.h / 2 - 0.1, b.w - 1, b.h - 1, '#162b3026', '#abb6a12a');
        // HVAC, pipes, roof skylight, fire-escape and lit storefront awning.
        this.rect(-2.6, -2.8, 1.8, 1.4, '#788786', '#a5b2a0'); this.circle(vec(-1.7, -2.1), 0.48, '#424f55');
        this.rect(1, -0.9, 2.4, 2.4, '#293c45', '#687c83'); this.rect(1.3, -0.6, 1.8, 1.8, '#678c9859');
        this.rect(-4, 4.4, 8, 0.9, prop.label === 'PIT STOP' ? '#a3ddc2' : prop.color === '#4d4b59' ? '#c097be' : '#d3b98b');
        for (let i = -3.6; i < 4; i += 1) this.rect(i, 4.4, 0.15, 0.9, '#182d3855');
        for (let i = -3; i < 4; i += 2) this.rect(i, -5.1, 0.9, 0.28, '#c4c69a90');
        this.label(prop.label, 0, 3.1, Math.min(0.82, 9 / (prop.label.length * 0.65)), prop.label === 'PIT STOP' ? MINT : '#d8ded1', '600');
        // Warm upper-floor windows and, for every third shopfront, a saturated neon sign strip.
        for (let wi = 0; wi < 4; wi++) {
          const wx = -3.7 + wi * 2.35;
          this.rect(wx, -3.9, 1.4, 1.5, '#ffd0894a'); this.rect(wx + 0.2, -3.7, 0.95, 0.95, '#fff0c86e');
        }
        if (prop.id % 3 === 0) {
          const neon = ['#ff5c96', '#60d2ff', '#ff7854', '#78ebaa', '#9696ff', '#ffb45c'][Math.floor(prop.id / 3) % 6];
          this.rect(-4, 4.15, 3.2, 0.55, neon + 'dd'); this.rect(-3.85, 4.28, 2.9, 0.18, '#ffffff8c');
        }
        this.rect(-5.3, 0, 0.5, 3, '#758488'); for (let y = 0; y < 3; y += 0.5) this.rect(-5.3, y, 0.5, 0.12, '#2c3b43');
      }
    } else if (['shed', 'barracks', 'station'].includes(prop.kind)) {
      this.shadowRect(-b.w / 2 + 0.8 + so.x, -b.h / 2 + 1 + so.y, b.w, b.h, '#13212870');
      this.rect(-b.w / 2, -b.h / 2, b.w, b.h, prop.color, '#a1a18a80');
      for (let x = -b.w / 2 + 0.5; x < b.w / 2; x += 1) this.rect(x, -b.h / 2, 0.1, b.h, '#222f3440');
      this.rect(-b.w / 2, -0.3, b.w, 0.6, '#8c95816a');
      this.label(prop.label, 0, 2, Math.min(1, b.w / (prop.label.length * 0.65)), '#e2ddbe', '700');
      // Lit fascia/canopy for the service yard, and warm windows on the large civic structures.
      if (prop.kind === 'station') {
        this.rect(-b.w / 2, -b.h / 2 + 1.15, b.w, 0.55, '#e0ad63');
        for (let lx = -3.5; lx <= 3.5; lx += 2.3) this.circle(vec(lx, -b.h / 2 + 1.6), 0.5, '#ffe4a8');
      } else {
        for (const lx of [-6, 6]) { this.rect(lx - 0.7, -4.7, 1.4, 0.9, '#ffd08945'); this.rect(lx - 0.55, -4.55, 1.1, 0.7, '#fff0c86b'); }
      }
      this.rect(-2, b.h / 2 - 0.5, 4, 0.6, '#25353b');
      const ratio = clamp(prop.hp / prop.maxHp, 0, 1);
      if (ratio < 0.98) {
        this.rect(-b.w / 2, -b.h / 2 - 1.3, b.w, 0.35, '#1c292e'); this.rect(-b.w / 2, -b.h / 2 - 1.3, b.w * ratio, 0.35, '#e99c76');
        c.strokeStyle = '#212f34'; c.lineWidth = 0.17;
        for (let i = 0; i < 5 * (1 - ratio); i++) { c.beginPath(); c.moveTo(-3 + i * 2, -3); c.lineTo(-1 + i, -1); c.lineTo(-2 + i, 0); c.lineTo(i, 3); c.stroke(); }
      }
      if (prop.fire > 0) { drawFire(c, vec(), 2.8, this.game.time, prop.id); drawSmoke(c, vec(0, -2), 3, this.game.time, prop.id); }
    } else if (prop.kind === 'pump') {
      this.shadowRect(-0.75 + so.x, -1.35 + so.y, 1.5, 2.7, '#1b2d3250'); this.rect(-0.6, -1.2, 1.2, 2.4, prop.color, '#e5c691');
      this.rect(-0.4, -0.8, 0.8, 0.65, '#233d44'); this.rect(-0.3, -0.7, 0.6, 0.3, '#a7ccb6');
      this.circle(vec(0, -1.35), 0.3, '#ffe4a8');
      c.strokeStyle = '#26383c'; c.lineWidth = 0.13; c.beginPath(); c.moveTo(0.6, 0); c.lineTo(1.2, 0); c.lineTo(1.2, 0.8); c.lineTo(0.6, 0.8); c.stroke();
      if (prop.fire > 0) drawFire(c, vec(), 1.4, this.game.time, prop.id);
    } else if (prop.kind === 'tree') {
      this.shadowCircle(vec(0.5 + so.x, 0.5 + so.y), 2.1, '#172c2d80');
      if (isCountry(b.position)) {
        for (const r of [2.4, 1.7, 1]) {
          const needles = Array.from({ length: 16 }, (_, i) => { const a = i * Math.PI / 8; return vec(Math.cos(a) * r * (i % 2 ? 0.6 : 1), Math.sin(a) * r * (i % 2 ? 0.6 : 1) - (2.4 - r) * 0.2); });
          trace(c, needles, true); c.fillStyle = r === 2.4 ? '#233f36' : r === 1.7 ? prop.color : '#63816a'; c.fill();
        }
      } else { this.circle(vec(), 1.9, '#294c43'); this.circle(vec(-0.25, -0.3), 1.6, prop.color); this.circle(vec(-0.6, -0.7), 0.8, '#6b92724a'); }
    } else if (prop.kind === 'hydrant') {
      this.shadowCircle(vec(0.15 + so.x, 0.2 + so.y), 0.5, '#15242b70'); this.rect(-0.45, -0.15, 0.9, 0.3, '#bd584e'); this.circle(vec(), 0.33, prop.color); this.circle(vec(-0.07, -0.07), 0.16, '#fca086');
    } else if (prop.kind === 'lamp') {
      // Warm lamp head with a soft halo; the lighting pass adds the pool on the ground.
      this.circle(vec(), 3.6, '#ffd9a00f'); this.circle(vec(), 1.15, '#ffdf9a14');
      this.circle(vec(), 0.42, '#59706d'); this.rect(-0.06, -0.7, 0.12, 0.9, '#8a9a96');
      this.rect(-0.34, -1.02, 0.68, 0.42, '#ffe9b0'); this.rect(-0.28, -0.62, 0.56, 0.1, '#fff6d8');
    } else if (prop.kind === 'kiosk') {
      this.shadowRect(-b.w / 2 + 0.3 + so.x, -b.h / 2 + 0.4 + so.y, b.w, b.h, '#17272e80'); this.rect(-b.w / 2, -b.h / 2, b.w, b.h, prop.color, '#d5bba0');
      this.rect(-b.w / 2, -b.h / 2, b.w, 0.4, '#ded4b5'); this.label(prop.label, 0, 0, 0.55, '#f1e3ca', '700');
    } else if (prop.kind === 'crate') {
      this.rect(-0.7, -0.7, 1.4, 1.4, prop.color, '#725744'); this.rect(-0.65, -0.12, 1.3, 0.24, '#796346'); c.strokeStyle = '#796346'; c.lineWidth = 0.13; c.beginPath(); c.moveTo(-0.5, -0.5); c.lineTo(0.5, 0.5); c.stroke();
    } else if (prop.kind === 'bench') {
      this.rect(-1.2, -0.4, 2.4, 0.8, '#23373b'); for (let y = -0.33; y < 0.4; y += 0.25) this.rect(-1.2, y, 2.4, 0.17, prop.color); this.rect(-0.9, -0.6, 0.2, 1.1, '#263a3d'); this.rect(0.7, -0.6, 0.2, 1.1, '#263a3d');
    } else if (prop.kind === 'barrier') {
      this.rect(-b.w / 2, -0.3, b.w, 0.6, prop.color); for (let i = -1.2; i < 1.4; i += 0.6) this.rect(i, -0.3, 0.22, 0.6, '#31424a');
    } else { this.rect(-0.4, -0.4, 0.8, 0.8, prop.color, '#28483e'); this.rect(-0.32, -0.32, 0.64, 0.22, '#335b52'); }
    c.restore();
  }
  car(v: Vehicle) {
    if (v.sinking) {
      const c = this.ctx, b = v.body, pool = v.sinking.pool, t = clamp(v.sinking.elapsed / 2.2, 0, 1);
      c.save();
      if (pool) { c.beginPath(); c.rect(pool.position.x - pool.w / 2, pool.position.y - pool.h / 2, pool.w, pool.h); c.clip(); }
      const flight = pool ? 0 : Math.sin(Math.min(1, v.sinking.elapsed / 0.6) * Math.PI) * Math.min(2.4, v.sinking.entrySpeed * 0.08);
      c.translate(b.position.x, b.position.y + t * 0.7 - flight); c.rotate(t * 0.15); c.scale(1 - t * 0.25, 1 - t * 0.25);
      c.translate(-b.position.x, -b.position.y); c.globalAlpha = 1 - t;
      this.vehicleSprite(v); c.restore(); return;
    }
    this.vehicleSprite(v);
  }
  private vehicleSprite(v: Vehicle) {
    if (v.cart) { this.golfCart(v); return; }
    const sprite = v.definition.graphics.sprite;
    if (sprite === 'motorcycle') { this.motorcycle(v); this.vehicleEffects(v); return; }
    if (sprite === 'van' || sprite === 'truck') { this.commercialVehicle(v); this.vehicleEffects(v); return; }
    const c = this.ctx, b = v.body, police = v.kind === 'police', taxi = v.kind === 'taxi', wreck = v.damage.status === 'wreck', so = this.shadowOffset(b.angle);
    c.save(); c.translate(b.position.x, b.position.y); c.rotate(b.angle);
    if (v === this.game.player && !v.sinking && !this.game.onFoot && this.game.mode === 'playing' && this.game.controls.boost) {
      const pulse = 0.5 + Math.sin(this.game.time * 43) * 0.12;
      for (const side of [-0.67, 0.67]) {
        c.fillStyle = '#57d6f1aa'; c.beginPath(); c.moveTo(-1.9, side - 0.3); c.lineTo(-4.6 - pulse, side); c.lineTo(-1.9, side + 0.3); c.fill();
        c.fillStyle = '#d9fbff'; c.beginPath(); c.moveTo(-2, side - 0.14); c.lineTo(-3.5 - pulse, side); c.lineTo(-2, side + 0.14); c.fill();
      }
      c.strokeStyle = '#8ee8f78a'; c.lineWidth = 0.1;
      for (const side of [-1.35, 1.35]) { c.beginPath(); c.moveTo(-1.8, side); c.lineTo(-5.5 - pulse * 2, side); c.stroke(); }
    }
    this.shadowRect(-b.w / 2 + 0.25 + so.x, -b.h / 2 + 0.35 + so.y, b.w, b.h, '#0e1a2270');
    for (const t of v.dynamics.tyres) { c.save(); c.translate(t.position.x, t.position.y * 1.44); c.rotate(t.angle); this.rect(-0.48, -0.16, 0.96, 0.32, '#101b20'); c.restore(); }
    // Existing car artwork stays proportional if its definition changes dimensions.
    c.save(); c.scale(b.w / 4.2, b.h / 2.1);
    c.fillStyle = wreck ? '#34393b' : v.color; c.beginPath(); c.roundRect(-2.1, -1.02, 4.2, 2.04, 0.35); c.fill();
    this.rect(-1.15, -0.89, 2.45, 1.78, wreck ? '#252c2f' : police ? '#273945' : taxi ? '#e4b747' : v.color);
    this.rect(0.5, -0.83, 0.65, 1.66, v.definition.graphics.glass); this.rect(-1.4, -0.8, 0.45, 1.6, v.definition.graphics.glass);
    this.rect(-0.9, -0.95, 1.3, 0.13, v.definition.graphics.trim); this.rect(-0.9, 0.82, 1.3, 0.13, v.definition.graphics.trim);
    this.rect(1.77, -0.84, 0.25, 0.38, '#fff3b2'); this.rect(1.77, 0.46, 0.25, 0.38, '#fff3b2');
    this.rect(-2, -0.8, 0.16, 0.37, taxi && this.game.controls.throttle < 0 ? '#ff675f' : '#ae625a'); this.rect(-2, 0.43, 0.16, 0.37, taxi && this.game.controls.throttle < 0 ? '#ff675f' : '#ae625a');
    this.rect(1.5, -1.13, 0.3, 0.2, v.color); this.rect(1.5, 0.93, 0.3, 0.2, v.color);
    if (taxi && !wreck) {
      this.rect(-0.4, -0.47, 0.8, 0.94, '#ffe8a3'); c.save(); c.rotate(Math.PI / 2); this.label('TAXI', 0, 0, 0.27, '#413927', '700'); c.restore();
      for (let x = -0.9; x < 0.5; x += 0.22) { this.rect(x, -0.9, 0.11, 0.14, '#2c3432'); this.rect(x + 0.11, 0.76, 0.11, 0.14, '#2c3432'); }
      if (!this.game.onFoot && this.game.job.stage === 'dropoff') this.circle(vec(-0.7, -0.4), 0.17, '#e5c19e');
    }
    if (police && !wreck) {
      this.rect(-0.35, -0.7, 0.55, 0.65, '#fc796f'); this.rect(-0.35, 0.05, 0.55, 0.65, '#78bcff');
      this.label('POLICE', -0.1, 0, 0.32, '#d8e6e5', '700');
    }
    if (v.damage.health < 75) { c.strokeStyle = '#283338'; c.lineWidth = 0.12; c.beginPath(); c.moveTo(1.7, -0.5); c.lineTo(0.9, 0.1); c.lineTo(1.8, 0.5); c.stroke(); }
    if (v.damage.bloodTime > 0 && this.game.settings.gore) this.rect(1.8, -0.9, 0.2, 1.8, '#8e2230');
    c.restore();
    this.vehicleDoor(v, 0.78 * b.w / 4.2, 1.02 * b.h / 2.1, 1.25 * b.w / 4.2);
    c.restore();
    this.vehicleEffects(v);
  }
  /** Draw in the current vehicle-local frame; pickup cabins share the exit animation. */
  private vehicleDoor(v: Vehicle, x: number, y: number, width: number) {
    if (!v.door) return;
    const open = doorOpenness(this.game.time - v.door.at); if (open <= 0) return;
    const c = this.ctx, side = v.door.side;
    c.save(); c.translate(x, side * y); c.rotate(-side * open * 1.36);
    this.rect(-width, -0.12, width, 0.24, v.damage.status === 'wreck' ? '#414a4d' : v.color, '#25363c');
    this.rect(-width * 0.94, -0.07, width * 0.6, 0.14, v.definition.graphics.glass);
    this.rect(-width * 0.76, side * 0.15, 0.24, 0.08, '#eee6cf'); c.restore();
  }
  private commercialVehicle(v: Vehicle) {
    const c = this.ctx, b = v.body, art = v.definition.graphics, cargo = v.definition.cargo;
    const wreck = v.damage.status === 'wreck', front = b.w / 2, rear = -front, half = b.h / 2;
    const cab = art.cabLength, bedFront = front - cab - 0.15, bedRear = rear + 0.25, bedLength = bedFront - bedRear;
    const so = this.shadowOffset(b.angle), paint = wreck ? '#353e41' : v.color, trim = wreck ? '#263033' : art.trim;
    c.save(); c.translate(b.position.x, b.position.y); c.rotate(b.angle);
    this.shadowRect(rear + 0.25 + so.x, -half + 0.3 + so.y, b.w, b.h, '#0e1a2270');
    for (const t of v.dynamics.tyres) {
      c.save(); c.translate(t.position.x, Math.sign(t.position.y) * (half + 0.06)); c.rotate(t.angle);
      this.rect(-0.52, -0.18, 1.04, 0.36, '#142026'); c.restore();
    }
    this.rect(rear, -half, b.w, b.h, trim, '#27353c');
    this.rect(front - cab, -half + 0.06, cab, b.h - 0.12, paint);
    this.rect(front - 0.94, -half + 0.17, 0.53, b.h - 0.34, wreck ? '#182c33' : art.glass);
    this.rect(front - cab + 0.15, -half + 0.14, Math.max(0.2, cab - 1.2), b.h - 0.28, paint);
    this.rect(front - 0.08, -half + 0.12, 0.12, 0.4, '#fff3b2'); this.rect(front - 0.08, half - 0.52, 0.12, 0.4, '#fff3b2');
    this.rect(front - 1.1, -half - 0.2, 0.35, 0.2, trim); this.rect(front - 1.1, half, 0.35, 0.2, trim);
    this.rect(rear, -half + 0.15, 0.15, 0.4, '#bd6657'); this.rect(rear, half - 0.55, 0.15, 0.4, '#bd6657');
    if (art.sprite === 'van') {
      this.rect(bedRear, -half + 0.06, bedLength, b.h - 0.12, paint);
      this.rect(bedRear + 0.18, -half + 0.22, bedLength - 0.35, b.h - 0.44, wreck ? '#303638' : art.roof);
      this.rect(rear + 0.05, -0.035, 0.3, 0.07, trim); // rear split doors
      this.rect(rear + 0.45, -half + 0.13, bedLength - 0.5, 0.07, trim);
      this.rect(rear + 0.45, half - 0.2, bedLength - 0.5, 0.07, trim);
      c.save(); c.translate((bedRear + bedFront) / 2, 0); c.rotate(Math.PI / 2); this.label('DELIVERY', 0, 0, 0.32, trim, '700'); c.restore();
    } else {
      this.rect(bedRear, -half + 0.08, bedLength, b.h - 0.16, wreck ? '#394143' : '#a6a39a');
      for (let x = bedRear + 0.2; x < bedFront; x += 0.42) this.rect(x, -half + 0.15, 0.035, b.h - 0.3, '#7e817b');
      for (const y of [-half + 0.05, half - 0.18]) this.rect(bedRear, y, bedLength, 0.13, trim);
      if (!wreck && cargo.kind === 'crates') {
        for (let x = bedRear + 0.3; x < bedFront - 0.7; x += 1.35) for (const y of [-0.95, 0.08]) {
          this.rect(x, y, 1.13, 0.84, art.cargoColor, '#735c3f'); this.rect(x + 0.48, y, 0.15, 0.84, '#e5c396');
        }
        for (const x of [bedRear + 1.2, bedFront - 1]) this.rect(x, -half + 0.12, 0.1, b.h - 0.24, '#394b53'); // tie-down straps
      }
      if (!wreck && cargo.kind === 'fuel') {
        for (let x = bedRear + 0.6; x < bedFront - 0.35; x += 1.05) for (const y of [-0.57, 0.57]) {
          this.circle(vec(x, y), 0.43, art.cargoColor); this.circle(vec(x, y), 0.31, '#d89261'); this.circle(vec(x + 0.13, y - 0.1), 0.065, '#463c38');
        }
        // Hazard diamond remains legible from above, without relying on body colour.
        c.save(); c.translate(bedFront - 0.5, 0); c.rotate(Math.PI / 4); this.rect(-0.27, -0.27, 0.54, 0.54, '#f4c953', '#4f3730'); c.restore();
        this.label('!', bedFront - 0.5, 0, 0.38, '#5a352b', '700');
      }
    }
    if (v.damage.health < 75) { c.strokeStyle = '#24353b'; c.lineWidth = 0.12; trace(c, [vec(front - 0.3, -0.7), vec(front - 1.3, 0.1), vec(front - 0.8, 0.6)]); c.stroke(); }
    if (v.damage.bloodTime > 0 && this.game.settings.gore) this.rect(front - 0.2, -half + 0.1, 0.2, b.h - 0.2, '#8e2230');
    this.vehicleDoor(v, front - 0.9, half, Math.min(1.5, cab - 0.5));
    c.restore();
  }
  private golfCart(v: Vehicle) {
    const c = this.ctx, b = v.body, cart = v.cart!, upsideDown = Math.abs(cart.roll) > Math.PI / 2;
    const width = Math.max(0.15, Math.abs(Math.cos(cart.roll))), roofOffset = Math.sin(cart.roll) * 1.1;
    c.save(); c.translate(b.position.x, b.position.y); c.rotate(b.angle);
    this.shadowRect(-b.w / 2 + 0.2, -b.h / 2 + 0.25, b.w, b.h, '#0e1a2270');
    c.save(); c.scale(1 - cart.crush * 0.25, width);
    for (const t of v.dynamics.tyres) { c.save(); c.translate(t.position.x, Math.sign(t.position.y) * (b.h / 2 + 0.02)); c.rotate(t.angle); this.rect(-0.3, -0.14, 0.6, 0.28, '#142129'); c.restore(); }
    c.save(); c.scale(b.w / 2.7, b.h / 1.6);
    this.rect(-1.25, -0.7, 2.5, 1.4, upsideDown ? '#263438' : v.definition.graphics.trim, '#bbc5ae');
    if (upsideDown) {
      for (const x of [-0.85, 0.85]) this.rect(x - 0.06, -0.8, 0.12, 1.6, '#919b91');
      this.rect(-0.5, -0.35, 0.9, 0.7, '#15252d');
    } else {
      this.rect(0.8, -0.65, 0.3, 1.3, v.definition.graphics.glass); this.rect(-0.65, -0.55, 0.45, 1.1, '#334e45');
      if (!v.driverExited) this.circle(vec(-0.05, -0.35), 0.22, '#e6c49b');
    }
    c.restore();
    c.restore();
    if (!upsideDown) {
      c.save(); c.translate(0, roofOffset); c.scale((1 - cart.crush * 0.35) * b.w / 2.7, width * b.h / 1.6);
      this.rect(-0.95, -0.72, 1.85, 1.44, v.color, '#9a9e8b');
      if (cart.crush > 0) { c.strokeStyle = '#59645b'; c.lineWidth = 0.1; trace(c, [vec(-0.7, -0.5), vec(0.1, 0.2), vec(0.5, -0.3)]); c.stroke(); }
      c.restore();
    }
    c.restore();
  }
  private motorcycle(v: Vehicle) {
    const c = this.ctx, b = v.body, g = this.game, wreck = v.damage.status === 'wreck';
    const dynamics = v.dynamics as MotorcycleDynamics, fallen = dynamics.fallen;
    const occupied = !v.driverExited && !wreck;
    const roll = fallen ? dynamics.lean : wreck ? 1.25 : v.parked && length(b.velocity) < 0.5 ? -0.18 : dynamics.lean;
    const projection = (height: number) => {
      const result = leanProjection(roll, height);
      // A fallen motorcycle is lying on its side, not disappearing into an
      // edge-on mathematical slice of the road. Keep the laid-down frame visible.
      return { ...result, width: fallen ? Math.max(0.53, result.width) : result.width };
    };
    const frame = projection(0.65), rider = projection(1.05), helmet = projection(1.4);
    const so = this.shadowOffset(b.angle);
    c.save(); c.translate(b.position.x, b.position.y); c.rotate(b.angle);
    // Contact patches stay at y=0. The cast shadow shortens as the bike's upper parts get lower.
    this.shadowRect(-1.25 + so.x * frame.height, -0.3 + frame.offset + so.y * frame.height, 2.5, 0.6, '#0e1a2290');
    if (occupied) this.shadowCircle(vec(0.18 + so.x * helmet.height, helmet.offset + so.y * helmet.height), 0.42, '#0e1a2270');
    if (v === g.player && !v.sinking && !g.onFoot && g.mode === 'playing' && g.controls.boost) {
      const pulse = 0.5 + Math.sin(g.time * 43) * 0.12;
      c.fillStyle = '#57d6f1bb'; c.beginPath(); c.moveTo(-1.1, frame.offset + 0.3); c.lineTo(-3.5 - pulse, frame.offset + 0.38); c.lineTo(-1.1, frame.offset + 0.55); c.fill();
      this.rect(-1.8, frame.offset + 0.33, 0.8, 0.1, '#d9fbff');
    }
    for (const t of v.dynamics.tyres) {
      this.circle(t.position, 0.16, '#0c161c'); // unmoving road contact, not a floating sprite
      c.save(); c.translate(t.position.x, Math.sin(roll) * 0.28); c.rotate(t.angle);
      this.rect(-0.4, -0.13 * frame.width, 0.8, 0.26 * frame.width, '#111c22');
      this.rect(-0.3, -0.045 * frame.width, 0.6, 0.09 * frame.width, '#72838a'); c.restore();
    }
    c.save(); c.scale(b.w / 2.6, b.h / 0.8);
    c.save(); c.translate(0, frame.offset); c.scale(1, frame.width);
    this.rect(-0.85, -0.13, 1.85, 0.26, '#adb7af'); // chassis/spine
    this.rect(-0.9, 0.32, 1.05, 0.14, '#aebbc0'); this.rect(-0.9, 0.32, 0.32, 0.14, '#34464e'); // exhaust
    c.fillStyle = wreck ? '#34393b' : v.color; c.beginPath(); c.roundRect(-0.65, -0.32, 1.55, 0.64, 0.24); c.fill();
    this.rect(-0.63, -0.23, 0.68, 0.46, v.definition.graphics.trim); // saddle
    this.rect(0.24, -0.23, 0.45, 0.46, wreck ? '#252c2f' : v.color);
    this.rect(0.31, -0.05, 0.2, 0.1, '#ffe3ac'); // tank highlight
    c.save(); c.translate(0.82, 0); c.rotate(v.dynamics.tyres[1].angle);
    this.rect(-0.06, -0.58, 0.12, 1.16, '#bcc7be');
    this.rect(-0.13, -0.65, 0.26, 0.2, '#24343b'); this.rect(-0.13, 0.45, 0.26, 0.2, '#24343b');
    this.rect(0.23, -0.2, 0.2, 0.4, wreck ? '#68716f' : '#fff0ba'); c.restore();
    this.rect(-1.03, -0.14, 0.12, 0.28, v === g.player && g.controls.throttle < 0 ? '#ff675f' : '#ba6b61');
    c.restore();
    // Courier rack/box rolls with the frame; the box only appears when carrying an actual parcel.
    c.save(); c.translate(-0.85, projection(0.8).offset); c.scale(1, frame.width);
    this.rect(-0.4, -0.37, 0.65, 0.74, '#46575c', '#a9b4ac');
    if (v === g.player && !g.onFoot && g.job.type === 'parcel' && g.job.stage === 'dropoff' && !wreck) {
      this.rect(-0.45, -0.4, 0.75, 0.8, '#dca668', '#ffe3af');
      this.rect(-0.16, -0.4, 0.14, 0.8, '#fff0c4');
    }
    c.restore();
    if (occupied) {
      c.save(); c.translate(0, rider.offset); c.scale(1, rider.width);
      this.rect(-0.32, -0.45, 0.7, 0.18, '#263942'); this.rect(-0.32, 0.27, 0.7, 0.18, '#263942'); // knees
      c.strokeStyle = '#e5bd8f'; c.lineWidth = 0.16; c.lineCap = 'round';
      for (const side of [-1, 1]) { c.beginPath(); c.moveTo(0.05, side * 0.3); c.lineTo(0.45, side * 0.4); c.lineTo(0.82, side * 0.52); c.stroke(); }
      c.fillStyle = GOLD; c.beginPath(); c.roundRect(-0.32, -0.32, 0.62, 0.64, 0.15); c.fill();
      this.rect(-0.26, -0.23, 0.12, 0.46, '#ffe8a3'); c.restore();
      // Helmet's larger lateral displacement is the strongest top-down depth cue.
      c.save(); c.translate(0.32, helmet.offset); c.scale(1, helmet.width);
      this.circle(vec(), 0.3, '#f0ede0'); this.rect(0.09, -0.23, 0.18, 0.46, '#28444d'); this.circle(vec(-0.09, -0.09), 0.09, '#ffffff'); c.restore();
      if (length(b.velocity) < 0.8) this.rect(-0.22, 0.55, 0.32, 0.18, '#253a43'); // foot down at stops
    }
    if (v.damage.health < 75) this.rect(0.3, frame.offset - 0.1, 0.4, 0.1, '#34393b');
    c.restore();
    c.restore();
  }
  private vehicleEffects(v: Vehicle) {
    if (v.sinking) return;
    const c = this.ctx, b = v.body, wreck = v.damage.status === 'wreck', taxi = v.kind === 'taxi';
    if (v.damage.status === 'burning') { const fuel = v.definition.cargo.flammable; drawFire(c, b.toWorld(vec(fuel ? -0.8 : b.w * 0.21, 0)), fuel ? 2.6 : 1.35, this.game.time, v.id); drawSmoke(c, b.position, fuel ? 2 : 1.4, this.game.time, v.id); this.label(`${v.damage.fuse.toFixed(1)}s`, b.position.x, b.position.y - 3.5, 0.85, '#f4c693', '700'); }
    else if (v.damage.status === 'smoking' || (wreck && this.game.time - v.wreckAt < 8)) drawSmoke(c, b.toWorld(vec(1.1, 0)), wreck ? 1.2 : 0.8, this.game.time, v.id);
    if (!wreck && v.ai.phase === 'waiting') this.label('AWAITING TOW', b.position.x, b.position.y - 3, 0.68, '#d7bb9c');
    if (taxi && this.game.arrest > 0) { c.strokeStyle = '#f18075'; c.lineWidth = 0.3; c.beginPath(); c.arc(b.position.x, b.position.y, 3.3, -Math.PI / 2, -Math.PI / 2 + this.game.arrest / this.game.rules.arrestTime * 2 * Math.PI); c.stroke(); }
  }
  debug() {
    const c = this.ctx, g = this.game;
    if (this.debugAI) for (const v of g.vehicles) if (v.alive && v.kind !== 'taxi' && this.visible(v.body.position, 25)) {
      c.save(); c.strokeStyle = v.ai.phase === 'reverse' ? '#ff9176' : v.kind === 'police' ? '#c4a2ee' : '#8cd3ce'; c.lineWidth = 0.13; c.setLineDash([0.4, 0.4]); c.beginPath(); c.moveTo(v.body.position.x, v.body.position.y); for (const p of v.path) c.lineTo(p.x, p.y); c.stroke();
      this.label(`#${v.id} ${v.kind === 'police' ? v.ai.role : ''} / ${v.ai.phase}`, v.body.position.x, v.body.position.y - 3, 0.68, c.strokeStyle as string, '600'); c.restore();
    }
    if (this.debugColliders) {
      c.save(); c.lineWidth = 0.08; c.strokeStyle = '#e9d789';
      for (const item of [...g.world.props, ...g.vehicles]) if (item.alive && this.visible(item.body.position, Math.max(item.body.w, item.body.h))) { const points = item.body.corners(); c.beginPath(); c.moveTo(points[0].x, points[0].y); for (const p of points.slice(1)) c.lineTo(p.x, p.y); c.closePath(); c.stroke(); }
      c.restore();
    }
  }
  edgePointer() {
    const g = this.game, p = this.screen(g.target), compact = this.width <= 700 || this.width <= 1000 && this.height <= 500;
    const left = compact ? 30 : 370, right = this.width - (compact ? 30 : 220);
    const top = compact ? this.height <= 500 ? 170 : 190 : 125;
    const bottom = Math.max(top + 30, this.height - (compact ? 170 : 160));
    if (p.x > left && p.x < right && p.y > top && p.y < bottom) return;
    const center = this.screen(g.actor.position), d = sub(p, center), theta = Math.atan2(d.y, d.x);
    const x = clamp(p.x, left, right), y = clamp(p.y, top, bottom), c = this.ctx;
    c.save(); c.translate(x, y); c.rotate(theta); c.fillStyle = g.navToGarage ? '#a7bcca' : g.job.stage === 'pickup' ? GOLD : MINT; c.beginPath(); c.moveTo(12, 0); c.lineTo(-7, -8); c.lineTo(-3, 0); c.lineTo(-7, 8); c.fill(); c.restore();
    this.label(`${Math.round(dist(g.target, g.actor.position))} m`, x, y + 24, 11, '#e9e9da', '600');
  }
  minimap() {
    const { HIGHLAND_OUTLINE, RIDGES, GOLF_COURSE, VILLAS, COUNTRY_ROADS } = this.game.map.country;
    const { BEACH_OUTLINE, PROMENADE, BEACH_HOTELS } = this.game.map.beach;
    const { roadPath } = this.game.world.navigation;
    const width = this.map.clientWidth, height = this.map.clientHeight;
    if (!width || !height) return; // Collapsed radar needs no drawing work.
    const pixelsW = Math.round(width * this.dpr), pixelsH = Math.round(height * this.dpr);
    if (this.map.width !== pixelsW || this.map.height !== pixelsH) { this.map.width = pixelsW; this.map.height = pixelsH; }
    const c = this.mapCtx, g = this.game, chartHeight = height - 18;
    const view = radarView(g.actor.position, width, chartHeight), s = view.scale;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, width, height);
    c.save(); c.beginPath(); c.rect(0, 0, width, chartHeight); c.clip();
    c.translate(view.offset.x, view.offset.y); c.scale(s, s);
    trace(c, HIGHLAND_OUTLINE, true); c.fillStyle = '#45634a'; c.fill();
    for (const ridge of RIDGES) { trace(c, ridge, true); c.fillStyle = '#717566'; c.fill(); }
    c.fillStyle = '#6f8983'; c.fillRect(HARBOUR.left, HARBOUR.top, HARBOUR.right - HARBOUR.left, HARBOUR.bottom - HARBOUR.top);
    for (const box of PORT_CONTAINERS) { c.fillStyle = box.color; c.fillRect(box.position.x - 7, box.position.y - 2.8, 14, 5.6); }
    c.fillStyle = '#a3ddc2'; c.fillRect(SWAP_CONTAINER.x - 5, SWAP_CONTAINER.y - 3, 10, 6); c.fillRect(PORT_ENTRY.x - 3, PORT_ENTRY.y - 3, 6, 6);
    c.fillStyle = '#90a66b'; c.fillRect(GOLF_COURSE.center.x - GOLF_COURSE.width / 2, GOLF_COURSE.center.y - GOLF_COURSE.height / 2, GOLF_COURSE.width, GOLF_COURSE.height);
    for (const villa of VILLAS) { c.fillStyle = '#dcc4a1'; c.fillRect(villa.position.x - 5, villa.position.y - 3, 10, 6); }
    for (const road of COUNTRY_ROADS) { trace(c, road.points); c.strokeStyle = road.bridge ? '#b4bbb0' : '#a2af94'; c.lineWidth = road.bridge ? 5 : 3; c.stroke(); }
    trace(c, BEACH_OUTLINE, true); c.fillStyle = '#d9bd88'; c.fill();
    c.fillStyle = '#d8d5c3'; c.fillRect(PROMENADE.left, PROMENADE.top, PROMENADE.right - PROMENADE.left, PROMENADE.bottom - PROMENADE.top);
    for (const b of g.world.blocks) { c.fillStyle = b.park ? '#456955' : '#3c4b50'; c.fillRect(b.x + 7, b.y + 7, 26, 26); }
    for (const hotel of BEACH_HOTELS) { c.fillStyle = hotel.color; c.fillRect(hotel.position.x - hotel.width / 2, hotel.position.y - hotel.height / 2, hotel.width, hotel.height); }
    c.strokeStyle = g.onFoot ? '#8edbe8' : (g.navToHarbour || g.harbour.vehicleId === g.player.id) ? '#8edbe8' : g.navToGarage ? '#a7bcca' : g.job.stage === 'pickup' ? '#c8ac5a' : '#8cc4a8'; c.lineWidth = 1.4 / s; c.beginPath(); c.moveTo(g.actor.position.x, g.actor.position.y); for (const p of roadPath(g.actor.position, g.target, g.onFoot ? 'walk' : 'drive')) c.lineTo(p.x, p.y); c.stroke();
    const markerScale = 0.66 / s;
    if (!g.onFoot && g.job.stage === 'pickup') for (const offer of g.missionOffers.values()) if (offer !== g.job) {
      c.strokeStyle = '#8edbe8'; c.lineWidth = 1 / s; c.beginPath(); c.arc(offer.pickup.x, offer.pickup.y, 4 * markerScale, 0, Math.PI * 2); c.stroke();
    }
    if (g.onFoot) for (const v of g.vehicles) if (v.definition.access.playerDrivable && v.parked && !v.sinking && v.damage.status !== 'burning' && v.damage.status !== 'wreck' && (v.model !== 'motorcycle' || motorcycleEngineWorks(v.damage))) { c.fillStyle = '#8edbe8'; c.fillRect(v.body.position.x - 2 * markerScale, v.body.position.y - 2 * markerScale, 4 * markerScale, 4 * markerScale); }
    c.fillStyle = '#b1c5d4'; c.fillRect(GARAGE.x - 3 * markerScale, GARAGE.y - 3 * markerScale, 6 * markerScale, 6 * markerScale);
    for (const v of g.police) { c.fillStyle = '#ef8579'; c.beginPath(); c.arc(v.body.position.x, v.body.position.y, 3 * markerScale, 0, Math.PI * 2); c.fill(); }
    c.save(); c.translate(g.actor.position.x, g.actor.position.y); c.rotate(g.actor.angle); c.scale(markerScale, markerScale); c.fillStyle = GOLD; c.beginPath(); c.moveTo(6, 0); c.lineTo(-4, -3.5); c.lineTo(-2, 0); c.lineTo(-4, 3.5); c.closePath(); c.fill(); c.restore();
    c.restore();
    const marker = radarMarker(g.target, view, width, chartHeight);
    c.save(); c.translate(marker.position.x, marker.position.y);
    c.strokeStyle = c.fillStyle = g.onFoot ? '#8edbe8' : (g.navToHarbour || g.harbour.vehicleId === g.player.id) ? '#8edbe8' : g.navToGarage ? '#a7bcca' : g.job.stage === 'pickup' ? GOLD : MINT;
    c.lineWidth = 1.5; c.beginPath();
    if (marker.offscreen) { c.rotate(marker.angle); c.moveTo(5, 0); c.lineTo(-4, -4); c.lineTo(-2, 0); c.lineTo(-4, 4); c.closePath(); c.fill(); }
    else { c.arc(0, 0, 4, 0, Math.PI * 2); c.stroke(); }
    c.restore(); c.fillStyle = '#b4c5c2'; c.font = '8px "Space Grotesk", sans-serif'; c.textAlign = 'left'; c.fillText(district(g.actor.position, g.map), 8, height - 5, width - 35); c.textAlign = 'right'; c.fillText('N ↑', width - 7, height - 5);
  }
}
