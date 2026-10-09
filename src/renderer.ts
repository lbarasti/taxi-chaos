import { Game, type Vehicle } from './game';
import { add, clamp, dist, length, rotate, scale, sub, vec, type Vec } from './physics';
import { GARAGE, district, roadPath, type Prop } from './world';
import { drawCorpse, drawFire, drawSmoke } from './effects';
import { LightingLayer, collectLights, cullLights, type LightScene, type LightingRenderOptions, type Viewport } from './lighting';
import type { LightingState } from './day-night';

const GOLD = '#f7ce55', MINT = '#a3ddc2';

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
    this.ground(); this.route();
    g.fx.drawGround(c, g.settings.gore);
    for (const s of g.skids) { if (s.blood && !g.settings.gore) continue; c.globalAlpha = Math.min(0.6, s.life / 18); c.strokeStyle = s.blood ? '#7c1726' : '#11191b'; c.lineWidth = s.blood ? 0.32 : 0.23; c.beginPath(); c.moveTo(s.a.x, s.a.y); c.lineTo(s.b.x, s.b.y); c.stroke(); } c.globalAlpha = 1;
    for (const prop of g.world.props) if (this.visible(prop.body.position, Math.max(prop.body.w, prop.body.h))) this.prop(prop);
    for (const person of g.world.people) if (this.visible(person.position, 2)) {
      if (person.aboard) continue;
      if (!person.alive) { if (g.settings.gore && person.deathTime >= 0) drawCorpse(c, person); continue; }
      const pp = person.position, so = this.shadowOffset();
      c.globalAlpha = this.shadowAlpha; this.circle(add(pp, add(vec(0.18, 0.22), so)), 0.4, '#0d1a2280'); c.globalAlpha = 1;
      c.save(); c.translate(pp.x, pp.y); c.rotate(Math.sin(g.time * 3 + person.phase) * 0.2);
      this.rect(-0.22, -0.1, 0.44, 0.6, person.color); this.circle(vec(0, -0.22), 0.23, '#dfc4ab');
      this.rect(-0.33, 0.05, 0.14, 0.36, person.color); this.rect(0.2, person.panic > 0 ? -0.35 : 0.05, 0.14, 0.36, person.color);
      c.restore();
    }
    for (const v of g.vehicles) if (v.alive && this.visible(v.body.position)) this.car(v);
    if (g.onFoot) {
      const p = g.driver.position;
      this.circle(p, 1.05, '#f7ce5525'); c.strokeStyle = GOLD; c.lineWidth = 0.12; c.beginPath(); c.arc(p.x, p.y, 1.05, 0, Math.PI * 2); c.stroke();
      c.save(); c.translate(p.x, p.y); c.rotate(g.driver.angle + Math.PI / 2);
      const stride = Math.sin(g.time * 17) * Math.min(g.speed / 5.5, 1) * 0.15;
      this.rect(-0.24, -0.05, 0.48, 0.6, GOLD); this.circle(vec(0, -0.23), 0.24, '#dfc4ab');
      this.rect(-0.26, 0.42 + stride, 0.18, 0.32, '#273c44'); this.rect(0.08, 0.42 - stride, 0.18, 0.32, '#273c44'); c.restore();
    }
    g.fx.drawAir(c, g.time, g.settings.gore);
    c.restore();
    this.lightingPass(lighting);
    // Navigation, labels and debug feedback are redrawn above the lighting pass so night never
    // buries the route or hides the player's read-outs.
    c.save(); c.translate(this.width * 0.53, this.height * 0.54); c.scale(this.zoom, this.zoom); c.translate(-this.camera.x, -this.camera.y);
    this.marker(GARAGE, '#a7bcca', 'PIT STOP', true);
    const target = g.job.stage === 'pickup' ? g.job.pickup : g.job.dropoff; this.marker(target, g.job.stage === 'pickup' ? GOLD : MINT, g.job.stage === 'pickup' ? 'PICK UP' : 'DROP OFF');
    this.route();
    for (const person of g.world.people) if (person.alive && !person.aboard && person.panic > 0 && this.visible(person.position, 2)) this.label('!', person.position.x, person.position.y - 1, 1.1, GOLD, '700');
    if (g.job.stage === 'pickup') {
      const person = g.world.people.find(p => p.id === g.job.customerId), waiting = person?.position ?? add(g.job.pickup, vec(3.4, 0));
      const waving = add(waiting, vec(0.6, -0.3 - Math.sin(g.time * 6) * 0.2)); this.circle(waving, 0.18, GOLD);
      this.label(g.job.name.toUpperCase(), waiting.x, waiting.y - 1.8, 0.8, GOLD, '700');
    }
    if (g.onFoot) {
      const p = g.driver.position;
      this.label('YOU', p.x, p.y - 1.8, 0.72, GOLD, '700');
      const car = g.nearestCar; if (car) this.marker(car.body.position, '#8edbe8', g.enterableCar ? 'E · GET IN' : 'REPLACEMENT CAR');
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
  private shadowRect(x: number, y: number, w: number, h: number, color: string) { this.ctx.globalAlpha = this.shadowAlpha; this.rect(x, y, w, h, color); this.ctx.globalAlpha = 1; }
  private shadowCircle(p: Vec, r: number, color: string) { this.ctx.globalAlpha = this.shadowAlpha; this.circle(p, r, color); this.ctx.globalAlpha = 1; }
  private worldViewport(): Viewport {
    const left = this.camera.x + (0 - this.width * 0.53) / this.zoom, right = this.camera.x + (this.width - this.width * 0.53) / this.zoom;
    const top = this.camera.y + (0 - this.height * 0.54) / this.zoom, bottom = this.camera.y + (this.height - this.height * 0.54) / this.zoom;
    return { minX: left, minY: top, maxX: right, maxY: bottom };
  }
  private lightingPass(lighting: LightingState) {
    const g = this.game;
    const scene: LightScene = {
      time: g.time, artificial: clamp(lighting.artificialLight, 0, 1), playerId: g.player.id, playerOnFoot: g.onFoot,
      playerBoosting: !g.onFoot && g.mode === 'playing' && g.controls.boost === true && g.boost > 1, arrest: g.arrest,
      vehicles: g.vehicles, props: g.world.props, blasts: g.fx.blasts,
    };
    const lights = cullLights(collectLights(scene), this.worldViewport());
    const options: LightingRenderOptions = { width: this.width, height: this.height, dpr: this.dpr, state: lighting, lights, zoom: this.zoom, project: point => this.screen(point) };
    this.lightLayer.render(this.ctx, options);
  }
  ground() {
    const c = this.ctx, g = this.game;
    // The base palette was authored for a night city; lift it toward daylight so morning/afternoon
    // do not read as a darker night before the ambient lighting pass is applied.
    this.rect(-14, -14, 268, 268, mixHex('#29383e', '#84938a', this.daylight * 0.45));
    // Waterfront: graphic waves, not textures.
    c.strokeStyle = mixHex('#31505a', '#9bc0c6', this.daylight * 0.5); c.lineWidth = 0.12;
    for (let y = -70; y < 320; y += 7) { c.beginPath(); for (let x = -100; x < 350; x += 2) { if (x > -17 && x < 257 && y > -17 && y < 257) continue; const yy = y + Math.sin(x * 0.5 + g.time * 0.3) * 0.3; c.lineTo(x, yy); } c.stroke(); }
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
    // Workshop's apron, immediately beside the starting cab.
    this.rect(6.2, 24, 2.5, 8, '#a0b89d'); this.label('TAXI', 7.4, 28, 0.65, '#29483e', '700');
  }
  route() {
    const g = this.game, c = this.ctx, route = g.onFoot && g.clearWalk(g.actor.position, g.target) ? [g.target] : roadPath(g.actor.position, g.target);
    c.strokeStyle = g.onFoot ? '#8edbe870' : g.navToGarage ? '#a7bcca70' : g.job.stage === 'pickup' ? '#f7ce5538' : '#a3ddc248'; c.lineWidth = 0.65; c.lineJoin = 'round'; c.setLineDash([1, 1.8]); c.lineDashOffset = -g.time * 2;
    c.beginPath(); c.moveTo(g.actor.position.x, g.actor.position.y); for (const p of route) c.lineTo(p.x, p.y); c.stroke(); c.setLineDash([]);
  }
  marker(p: Vec, color: string, label: string, garage = false) {
    if (!this.visible(p, 10)) return; const c = this.ctx, g = this.game;
    c.save(); c.translate(p.x, p.y); c.strokeStyle = color; c.fillStyle = color + '12'; c.lineWidth = 0.15;
    if (garage) { c.setLineDash([0.5, 0.4]); c.strokeRect(-3.8, -4.7, 7.6, 9.4); c.setLineDash([]); this.label('⚒', 0, 0, 2, color); }
    else { c.beginPath(); c.arc(0, 0, 5 + Math.sin(g.time * 3) * 0.2, 0, Math.PI * 2); c.fill(); c.stroke(); c.beginPath(); c.arc(0, 0, 4.6, -Math.PI / 2, -Math.PI / 2 + g.job.wait / 0.8 * Math.PI * 2); c.lineWidth = 0.45; c.stroke(); this.label(g.job.stage === 'pickup' ? '↓' : '✓', 0, 0, 2.4, color, '700'); }
    this.label(label, 0, garage ? 6 : -6.5, 0.9, color, '700'); c.restore();
  }
  prop(prop: Prop) {
    const c = this.ctx, b = prop.body, so = this.shadowOffset(b.angle);
    c.save(); c.translate(b.position.x, b.position.y); c.rotate(b.angle);
    if (!prop.alive) {
      if (prop.kind === 'hydrant') { this.circle(vec(), 1.7, '#6ba2b63c'); this.circle(vec(), 0.3, '#343d41'); }
      else {
        const large = b.w > 5 || b.h > 5;
        this.rect(-b.w / 2, -b.h / 2, b.w, b.h, '#18232860');
        for (let i = 0; i < (large ? 32 : 4); i++) { const x = ((prop.id * 13 + i * 7) % 31 / 31 - 0.5) * b.w * 1.2, y = ((prop.id * 7 + i * 5) % 29 / 29 - 0.5) * b.h * 1.3; this.rect(x, y, large ? 0.5 + i % 3 * 0.4 : Math.min(0.5, b.w / 3), large ? 0.4 + i % 2 * 0.4 : Math.min(0.35, b.h / 3), i % 3 ? prop.color : '#858579'); }
        if (large) this.label('RUBBLE / CLEAR', 0, 0, 0.7, '#d4cbb0');
      }
      if (prop.fire > 0) drawFire(c, vec(), prop.kind === 'station' ? 3 : 1.4, this.game.time, prop.id);
      c.restore(); return;
    }
    if (prop.kind === 'building') {
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
        this.rect(-5.3, 0, 0.5, 3, '#758488'); for (let y = 0; y < 3; y += 0.5) this.rect(-5.3, y, 0.5, 0.12, '#2c3b43');
      }
    } else if (['shed', 'barracks', 'station'].includes(prop.kind)) {
      this.shadowRect(-b.w / 2 + 0.8 + so.x, -b.h / 2 + 1 + so.y, b.w, b.h, '#13212870');
      this.rect(-b.w / 2, -b.h / 2, b.w, b.h, prop.color, '#a1a18a80');
      for (let x = -b.w / 2 + 0.5; x < b.w / 2; x += 1) this.rect(x, -b.h / 2, 0.1, b.h, '#222f3440');
      this.rect(-b.w / 2, -0.3, b.w, 0.6, '#8c95816a');
      this.label(prop.label, 0, 2, Math.min(1, b.w / (prop.label.length * 0.65)), '#e2ddbe', '700');
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
      c.strokeStyle = '#26383c'; c.lineWidth = 0.13; c.beginPath(); c.moveTo(0.6, 0); c.lineTo(1.2, 0); c.lineTo(1.2, 0.8); c.lineTo(0.6, 0.8); c.stroke();
      if (prop.fire > 0) drawFire(c, vec(), 1.4, this.game.time, prop.id);
    } else if (prop.kind === 'tree') {
      this.shadowCircle(vec(0.5 + so.x, 0.5 + so.y), 2.1, '#172c2d80'); this.circle(vec(), 1.9, '#294c43'); this.circle(vec(-0.25, -0.3), 1.6, prop.color); this.circle(vec(-0.6, -0.7), 0.8, '#6b92724a');
    } else if (prop.kind === 'hydrant') {
      this.shadowCircle(vec(0.15 + so.x, 0.2 + so.y), 0.5, '#15242b70'); this.rect(-0.45, -0.15, 0.9, 0.3, '#bd584e'); this.circle(vec(), 0.33, prop.color); this.circle(vec(-0.07, -0.07), 0.16, '#fca086');
    } else if (prop.kind === 'lamp') {
      this.circle(vec(), 2.5, '#e8d69a09'); this.circle(vec(), 0.4, '#59706d'); this.rect(-0.06, -0.7, 0.12, 0.9, '#8a9a96'); this.rect(-0.3, -0.9, 0.6, 0.4, '#e3dbad');
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
    const c = this.ctx, b = v.body, police = v.kind === 'police', taxi = v.kind === 'taxi', wreck = v.damage.status === 'wreck', so = this.shadowOffset(b.angle);
    c.save(); c.translate(b.position.x, b.position.y); c.rotate(b.angle);
    if (v === this.game.player && !this.game.onFoot && this.game.mode === 'playing' && this.game.controls.boost) {
      const pulse = 0.5 + Math.sin(this.game.time * 43) * 0.12;
      for (const side of [-0.67, 0.67]) {
        c.fillStyle = '#57d6f1aa'; c.beginPath(); c.moveTo(-1.9, side - 0.3); c.lineTo(-4.6 - pulse, side); c.lineTo(-1.9, side + 0.3); c.fill();
        c.fillStyle = '#d9fbff'; c.beginPath(); c.moveTo(-2, side - 0.14); c.lineTo(-3.5 - pulse, side); c.lineTo(-2, side + 0.14); c.fill();
      }
      c.strokeStyle = '#8ee8f78a'; c.lineWidth = 0.1;
      for (const side of [-1.35, 1.35]) { c.beginPath(); c.moveTo(-1.8, side); c.lineTo(-5.5 - pulse * 2, side); c.stroke(); }
    }
    this.shadowRect(-2 + 0.25 + so.x, -1 + 0.35 + so.y, 4.2, 2.1, '#0e1a2270');
    for (const t of v.dynamics.tyres) { c.save(); c.translate(t.position.x, t.position.y * 1.44); c.rotate(t.angle); this.rect(-0.48, -0.16, 0.96, 0.32, '#101b20'); c.restore(); }
    c.fillStyle = wreck ? '#34393b' : v.color; c.beginPath(); c.roundRect(-2.1, -1.02, 4.2, 2.04, 0.35); c.fill();
    this.rect(-1.15, -0.89, 2.45, 1.78, wreck ? '#252c2f' : police ? '#273945' : taxi ? '#e4b747' : v.color);
    this.rect(0.5, -0.83, 0.65, 1.66, '#29434b'); this.rect(-1.4, -0.8, 0.45, 1.6, '#29434b');
    this.rect(-0.9, -0.95, 1.3, 0.13, '#24414c'); this.rect(-0.9, 0.82, 1.3, 0.13, '#24414c');
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
    if (v.damage.status === 'burning') { drawFire(c, b.toWorld(vec(0.9, 0)), 1.35, this.game.time, v.id); drawSmoke(c, b.position, 1.4, this.game.time, v.id); this.label(`${v.damage.fuse.toFixed(1)}s`, b.position.x, b.position.y - 3.5, 0.85, '#f4c693', '700'); }
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
    const g = this.game, p = this.screen(g.target), mobile = this.width < 700;
    if (p.x > (mobile ? 20 : 300) && p.x < this.width - (mobile ? 20 : 260) && p.y > (mobile ? 290 : 125) && p.y < this.height - (mobile ? 300 : 160)) return;
    const center = this.screen(g.actor.position), d = sub(p, center), theta = Math.atan2(d.y, d.x);
    const x = clamp(p.x, mobile ? 50 : 320, this.width - (mobile ? 50 : 260)), y = clamp(p.y, mobile ? 310 : 125, this.height - (mobile ? 310 : 190)), c = this.ctx;
    c.save(); c.translate(x, y); c.rotate(theta); c.fillStyle = g.navToGarage ? '#a7bcca' : g.job.stage === 'pickup' ? GOLD : MINT; c.beginPath(); c.moveTo(12, 0); c.lineTo(-7, -8); c.lineTo(-3, 0); c.lineTo(-7, 8); c.fill(); c.restore();
    this.label(`${Math.round(dist(g.target, g.actor.position))} m`, x, y + 24, 11, '#e9e9da', '600');
  }
  minimap() {
    const c = this.mapCtx, g = this.game; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, 220, 190); c.fillStyle = '#192c33'; c.fillRect(0, 0, 220, 190);
    const s = 0.66, ox = 30, oy = 12; c.save(); c.translate(ox, oy); c.scale(s, s);
    for (const b of g.world.blocks) { c.fillStyle = b.park ? '#456955' : '#3c4b50'; c.fillRect(b.x + 7, b.y + 7, 26, 26); }
    c.strokeStyle = g.onFoot ? '#8edbe8' : g.navToGarage ? '#a7bcca' : g.job.stage === 'pickup' ? '#c8ac5a' : '#8cc4a8'; c.lineWidth = 2; c.beginPath(); c.moveTo(g.actor.position.x, g.actor.position.y); for (const p of roadPath(g.actor.position, g.target)) c.lineTo(p.x, p.y); c.stroke();
    if (g.onFoot) for (const v of g.vehicles) if (v.parked && v.damage.status !== 'burning' && v.damage.status !== 'wreck') { c.fillStyle = '#8edbe8'; c.fillRect(v.body.position.x - 2, v.body.position.y - 2, 4, 4); }
    c.fillStyle = '#b1c5d4'; c.fillRect(GARAGE.x - 3, GARAGE.y - 3, 6, 6);
    for (const v of g.police) { c.fillStyle = '#ef8579'; c.beginPath(); c.arc(v.body.position.x, v.body.position.y, 3, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = g.job.stage === 'pickup' ? GOLD : MINT; c.lineWidth = 2; c.beginPath(); c.arc(g.target.x, g.target.y, 6, 0, Math.PI * 2); c.stroke();
    c.save(); c.translate(g.actor.position.x, g.actor.position.y); c.rotate(g.actor.angle); c.fillStyle = GOLD; c.beginPath(); c.moveTo(6, 0); c.lineTo(-4, -3.5); c.lineTo(-2, 0); c.lineTo(-4, 3.5); c.closePath(); c.fill(); c.restore();
    c.restore(); c.fillStyle = '#9aafb5'; c.font = '9px "Space Grotesk", sans-serif'; c.textAlign = 'left'; c.fillText(district(g.actor.position), 14, 182); c.textAlign = 'right'; c.fillText('N ↑', 205, 182);
  }
}
