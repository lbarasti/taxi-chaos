// Stylized pulp-gore, vehicle fire and explosion effects for Taxi Chaos.
// Pure Canvas 2D procedural art: no assets, audio or network, and no per-frame
// randomness (fires/smoke are deterministic functions of time+seed) so the muted
// city palette stays legible. Every ctx mutation is wrapped in save()/restore().
// All coordinates are WORLD METRES, matching `src/rendering/renderer.ts`'s scaled camera space.
import { add, clamp, length, normalize, scale, vec, type Vec } from '../physics';
import { seeded, type Person } from '../world/world';
import { defaultMap } from '../map/default';

export type GoreKind = 'pulp' | 'cloth' | 'shard';
export type BloodLobe = { x: number; y: number; r: number };

export type BloodMark = {
  position: Vec; color: string; clot: string; radius: number; angle: number;
  life: number; ttl: number; lobes: BloodLobe[]; specks: BloodLobe[];
};

export type GoreChunk = {
  position: Vec; velocity: Vec; z: number; vz: number; size: number; color: string; edge: string;
  life: number; ttl: number; angle: number; spin: number; kind: GoreKind; points: Vec[]; bounce: number;
};

export type BlastRing = {
  position: Vec; radius: number; maxRadius: number; life: number; ttl: number; seed: number; color: string;
};

export type Ember = {
  position: Vec; velocity: Vec; z: number; vz: number; size: number; color: string;
  life: number; ttl: number; angle: number; spin: number;
};

export type SmokePuff = {
  position: Vec; velocity: Vec; size: number; life: number; ttl: number; tone: string; seed: number;
};

export const MAX_BLOOD_MARKS = 400;
export const MAX_CHUNKS = 180;
export const MAX_BLASTS = 30;
export const MAX_EMBERS = 220;
export const MAX_SMOKE = 160;
export const BLOOD_MARK_TTL = 90;
export const BLAST_TTL = 0.7;
// Visual shockwave may cover the whole gas-station dangerous area (physics ~30 m).
export const MAX_BLAST_RADIUS = 34;

const CHUNK_TTL = 4.5;
const BLOOD_TONES = ['#7e1420', '#8f1b22', '#5c1018', '#6d141c', '#a3242a'];

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(a: string, b: string, t: number): string {
  const A = parseHex(a), B = parseHex(b);
  if (!A || !B) return B ? b : a;
  const mix = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
}

// Layered, time-wobbled flame. Local space: base at y=+w/2, tip toward -y.
function flame(ctx: CanvasRenderingContext2D, x: number, height: number, width: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, width * 0.45);
  ctx.bezierCurveTo(-width, width * 0.1, -width * 0.7 + x, -height * 0.55, x, -height);
  ctx.bezierCurveTo(width * 0.7 + x, -height * 0.55, width, width * 0.1, 0, width * 0.45);
  ctx.closePath();
  ctx.fill();
}

const FIRE_LAYERS = [
  { color: '#c22c18', w: 0.95, h: 1.75, phase: 0.0 },
  { color: '#ff5a1e', w: 0.72, h: 1.5, phase: 1.1 },
  { color: '#ff9f28', w: 0.5, h: 1.15, phase: 2.3 },
  { color: '#ffe08a', w: 0.28, h: 0.8, phase: 3.4 },
];

/**
 * Vehicle / object fire. Deterministic in (time, seed): no flicker from frame
 * randomness. The renderer may rotate ctx before calling to aim the flames.
 */
export function drawFire(ctx: CanvasRenderingContext2D, position: Vec, size: number, time: number, seed: number) {
  const s = clamp(Number.isFinite(size) ? size : 1, 0.3, 10);
  ctx.save();
  ctx.translate(position.x, position.y);
  const glow = 0.16 + 0.05 * Math.sin(time * 5.3 + seed);
  ctx.globalAlpha = glow;
  ctx.fillStyle = '#ff7a24';
  ctx.beginPath(); ctx.arc(0, 0, s * 1.9, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = glow * 0.9;
  ctx.fillStyle = '#ffb03a';
  ctx.beginPath(); ctx.arc(0, 0, s * 1.1, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < FIRE_LAYERS.length; i++) {
    const layer = FIRE_LAYERS[i];
    const sway = Math.sin(time * (4.4 + i * 0.7) + seed * 0.7 + layer.phase) * 0.16 * s;
    const height = s * layer.h * (1 + Math.sin(time * (6.1 + i) + layer.phase) * 0.08);
    const width = s * layer.w * (1 + Math.sin(time * 5.2 + layer.phase) * 0.06);
    ctx.globalAlpha = 0.9 - i * 0.12;
    flame(ctx, sway, height, width, layer.color);
  }
  ctx.restore();
}

/** Thin, soft, slowly-drifting smoke plume. Local up is -y. */
export function drawSmoke(ctx: CanvasRenderingContext2D, position: Vec, size: number, time: number, seed: number) {
  const s = clamp(Number.isFinite(size) ? size : 1, 0.3, 10);
  ctx.save();
  ctx.translate(position.x, position.y);
  for (let i = 0; i < 3; i++) {
    const phase = seed * 0.9 + i * 2.4;
    const rise = (time * 0.55 + i * 0.4 + ((seed % 100) / 100) * 0.13) % 1;
    const x = Math.sin(time * 0.8 + phase) * s * 0.5 + (i - 1) * s * 0.35;
    const y = -rise * s * 2.2;
    const r = s * (0.55 + rise * 0.9);
    const alpha = (1 - rise) * 0.16;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = i === 1 ? '#6f7570' : '#565f66';
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = '#8b8f88';
    ctx.beginPath(); ctx.ellipse(x + r * 0.2, y - r * 0.15, r * 0.55, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/**
 * Cartoon overhead corpse: dark-red pool, spread limbs, clothing-coloured torso
 * and a simple head with X eyes. Deterministic per person id. Not photoreal.
 */
export function drawCorpse(ctx: CanvasRenderingContext2D, person: Person) {
  const p = person.position;
  const rnd = seeded((person.id + 1) * 7919 + 17);
  ctx.save();
  ctx.translate(p.x, p.y);
  // Pool + pulp splatter under the body.
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#5a1017';
  ctx.beginPath(); ctx.ellipse(0.25, 0.35, 1.15, 0.85, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7d1a22';
  ctx.beginPath(); ctx.ellipse(-0.15, 0.1, 0.85, 0.62, 0.2, 0, Math.PI * 2); ctx.fill();
  // Darker pulp core keeps the kill readable from directly overhead.
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#3d0a0f';
  ctx.beginPath(); ctx.ellipse(0.05, 0.12, 0.5, 0.36, 0.4, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, d = 0.9 + rnd() * 1.3;
    ctx.globalAlpha = 0.45 + rnd() * 0.3;
    ctx.fillStyle = rnd() < 0.5 ? '#8f2028' : '#e7d9bb';
    ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d * 0.8); ctx.rotate(rnd() * Math.PI);
    ctx.fillRect(-0.09, -0.05, 0.18, 0.1); ctx.restore();
  }
  // Body follows the person's facing.
  ctx.rotate(person.angle);
  ctx.globalAlpha = 1;
  ctx.fillStyle = person.color;
  ctx.save(); ctx.rotate(0.55); ctx.fillRect(-0.16, 0.1, 0.32, 0.72); ctx.restore();
  ctx.save(); ctx.rotate(-0.5); ctx.fillRect(-0.16, 0.1, 0.32, 0.72); ctx.restore();
  ctx.save(); ctx.rotate(1.25); ctx.fillRect(-0.14, 0.05, 0.28, 0.6); ctx.restore();
  ctx.save(); ctx.rotate(-1.3); ctx.fillRect(-0.14, 0.05, 0.28, 0.6); ctx.restore();
  ctx.fillStyle = person.color;
  ctx.beginPath(); ctx.roundRect(-0.3, -0.34, 0.6, 0.68, 0.12); ctx.fill();
  ctx.fillStyle = mixHex(person.color, '#120a0c', 0.35);
  ctx.fillRect(-0.3, -0.02, 0.6, 0.14);
  ctx.fillStyle = '#dfc4ab';
  ctx.beginPath(); ctx.arc(0, -0.5, 0.24, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#4a2b25'; ctx.lineWidth = 0.04; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-0.11, -0.55); ctx.lineTo(-0.03, -0.47); ctx.moveTo(-0.03, -0.55); ctx.lineTo(-0.11, -0.47);
  ctx.moveTo(0.03, -0.55); ctx.lineTo(0.11, -0.47); ctx.moveTo(0.11, -0.55); ctx.lineTo(0.03, -0.47);
  ctx.stroke();
  ctx.restore();
}

/**
 * Persistent, bounded effect store. main/game own creation and ordering; this
 * class only integrates particles and draws them. The `gore` flag is evaluated
 * at draw time, so all blood is hidden instantly when gore is off.
 */
export class Effects {
  constructor(private readonly envelope = defaultMap.envelope) {}
  bloodMarks: BloodMark[] = [];
  chunks: GoreChunk[] = [];
  blasts: BlastRing[] = [];
  embers: Ember[] = [];
  smoke: SmokePuff[] = [];
  splashes: { position: Vec; elapsed: number; strength: number }[] = [];
  railDebris: { position: Vec; velocity: Vec; angle: number; spin: number; life: number }[] = [];
  private random = seeded(0x9e3779b9);
  private seedTick = 1;

  /** Alias kept for integrations that read a plain `blood` array. */
  get blood() { return this.bloodMarks; }

  reset(): void {
    this.bloodMarks.length = 0;
    this.chunks.length = 0;
    this.blasts.length = 0;
    this.embers.length = 0;
    this.smoke.length = 0;
    this.splashes.length = 0;
    this.railDebris.length = 0;
    this.random = seeded(0x9e3779b9);
    this.seedTick = 1;
  }

  private nextSeed(): number { return (this.seedTick++ * 2654435761) >>> 0; }

  private inBounds(p: Vec): boolean { return p.x > this.envelope.min.x - 30 && p.x < this.envelope.max.x + 30 && p.y > this.envelope.min.y - 30 && p.y < this.envelope.max.y + 30; }

  private trim(): void {
    if (this.bloodMarks.length > MAX_BLOOD_MARKS) this.bloodMarks.splice(0, this.bloodMarks.length - MAX_BLOOD_MARKS);
    if (this.chunks.length > MAX_CHUNKS) this.chunks.splice(0, this.chunks.length - MAX_CHUNKS);
    if (this.blasts.length > MAX_BLASTS) this.blasts.splice(0, this.blasts.length - MAX_BLASTS);
    if (this.embers.length > MAX_EMBERS) this.embers.splice(0, this.embers.length - MAX_EMBERS);
    if (this.smoke.length > MAX_SMOKE) this.smoke.splice(0, this.smoke.length - MAX_SMOKE);
  }

  private bloodTone(): string { return BLOOD_TONES[Math.floor(this.random() * BLOOD_TONES.length) % BLOOD_TONES.length]; }

  private makeMark(position: Vec, radius: number, dir: Vec, cloth: string): BloodMark {
    const r = this.random, blood = this.bloodTone();
    const angle = Math.atan2(dir.y, dir.x) + (r() - 0.5) * 0.8;
    const lobes: BloodLobe[] = [], specks: BloodLobe[] = [];
    const lobeCount = 3 + Math.floor(r() * 3);
    for (let i = 0; i < lobeCount; i++) {
      const a = r() * Math.PI * 2, d = radius * (0.2 + r() * 0.6);
      lobes.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.8, r: radius * (0.28 + r() * 0.5) });
    }
    const speckCount = 4 + Math.floor(r() * 6);
    for (let i = 0; i < speckCount; i++) {
      const a = r() * Math.PI * 2, d = radius * (0.7 + r() * 1.7);
      specks.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.8, r: 0.05 + r() * 0.13 });
    }
    const color = cloth ? mixHex(cloth, blood, 0.65) : blood;
    return {
      position: { ...position }, color, clot: mixHex(color, '#1e0509', 0.55), radius, angle,
      life: BLOOD_MARK_TTL, ttl: BLOOD_MARK_TTL, lobes, specks,
    };
  }

  private makeChunk(position: Vec, velocity: Vec, kind: GoreKind, severity: number, cloth: string): GoreChunk {
    const r = this.random, blood = this.bloodTone();
    const size = kind === 'cloth' ? 0.12 + r() * 0.16 : kind === 'shard' ? 0.1 + r() * 0.12 : 0.09 + r() * (0.12 + severity * 0.03);
    const color = kind === 'cloth' ? (cloth || '#b9a58c') : kind === 'shard' ? '#e6d8bc' : blood;
    const edge = kind === 'shard' ? '#b9a488' : mixHex(color, '#20060a', 0.45);
    const points: Vec[] = [];
    const count = kind === 'pulp' ? 5 + Math.floor(r() * 3) : 3;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r() * 0.5, d = 0.6 + r() * 0.7;
      points.push(vec(Math.cos(a) * d, Math.sin(a) * d));
    }
    const life = CHUNK_TTL * (0.7 + r() * 0.6);
    return {
      position: { ...position }, velocity: add(velocity, vec((r() - 0.5) * 1.5, (r() - 0.5) * 1.5)),
      z: 0.15 + r() * 0.5, vz: 2.4 + r() * 3.2 + severity * 0.4, size, color, edge,
      life, ttl: life, angle: r() * Math.PI * 2, spin: (r() - 0.5) * 12, kind, points, bounce: 0.25 + r() * 0.3,
    };
  }

  /**
   * Blood pulse at an impact. `severity` scales the pool and pulp count;
   * `force` gives direction and speed, so fast hits throw long downrange sprays.
   */
  bloodHit(position: Vec, force: Vec, severity: number, clothingColor = ''): void {
    const p = { ...position };
    const sev = clamp(Number.isFinite(severity) ? severity : 1, 0.15, 4);
    const speed = clamp(length(force), 0, 80);
    const dir = speed > 0.001 ? normalize(force) : vec(0, -1);
    const side = vec(-dir.y, dir.x);
    const poolRadius = clamp(0.35 + sev * 0.5, 0.35, 2.6);
    this.bloodMarks.push(this.makeMark(p, poolRadius, dir, ''));
    const spraySteps = Math.min(5, Math.floor(speed / 9));
    for (let i = 0; i < spraySteps; i++) {
      const travel = 0.5 + (i + 1) * (0.45 + speed * 0.03);
      const off = (this.random() - 0.5) * (0.6 + i * 0.5);
      const q = add(p, add(scale(dir, travel), scale(side, off)));
      const radius = clamp(poolRadius * (0.5 - i * 0.06) * (0.7 + this.random() * 0.6), 0.12, poolRadius);
      this.bloodMarks.push(this.makeMark(q, radius, dir, this.random() < 0.3 ? clothingColor : ''));
    }
    const count = clamp(Math.round(3 + sev * 4 + speed * 0.9), 1, 22);
    for (let i = 0; i < count; i++) {
      const spread = (this.random() - 0.5) * (5 + sev * 2 + speed * 0.25);
      const along = speed * (0.25 + this.random() * 0.5) + 2 + this.random() * 4 * sev;
      const v = add(scale(dir, along), scale(side, spread));
      const kind: GoreKind = clothingColor && this.random() < 0.34 ? 'cloth' : this.random() < 0.18 ? 'shard' : 'pulp';
      this.chunks.push(this.makeChunk(p, v, kind, sev, clothingColor));
    }
    this.trim();
  }

  splash(position: Vec, strength = 1): void {
    this.splashes.push({ position: { ...position }, elapsed: 0, strength: clamp(strength, 0.5, 2) });
    if (this.splashes.length > 40) this.splashes.shift();
  }
  breakRail(position: Vec, velocity: Vec, angle: number) {
    for (let i = 0; i < 6; i++) this.railDebris.push({
      position: { ...position }, velocity: add(scale(velocity, 0.2 + this.random() * 0.15), vec((this.random() - 0.5) * 6, (this.random() - 0.5) * 6)),
      angle, spin: (this.random() - 0.5) * 9, life: 4,
    });
    if (this.railDebris.length > 72) this.railDebris.splice(0, this.railDebris.length - 72);
  }

  explode(position: Vec, radius: number): void {
    const p = { ...position };
    const rad = clamp(Number.isFinite(radius) ? radius : 3, 0.8, MAX_BLAST_RADIUS);
    const r = this.random;
    this.blasts.push({ position: p, radius: 0, maxRadius: rad, life: 0, ttl: BLAST_TTL, seed: this.nextSeed(), color: '#ffb347' });
    const emberCount = clamp(Math.round(rad * 5), 6, 60);
    for (let i = 0; i < emberCount; i++) {
      const a = r() * Math.PI * 2, off = rad * (0.08 + r() * 0.32), sp = 3 + r() * Math.min(rad, 18) * 1.6;
      const life = 0.5 + r() * 0.8;
      this.embers.push({
        position: add(p, vec(Math.cos(a) * off, Math.sin(a) * off * 0.7)),
        velocity: vec(Math.cos(a) * sp, Math.sin(a) * sp * 0.7),
        z: 0.2 + r() * rad * 0.3, vz: 2 + r() * 5, size: 0.05 + r() * 0.09,
        color: r() < 0.5 ? '#ffb347' : r() < 0.6 ? '#ffe08a' : '#ff6a2a',
        life, ttl: life, angle: r() * Math.PI * 2, spin: (r() - 0.5) * 10,
      });
    }
    const puffCount = clamp(Math.round(rad * 2.6), 3, 34);
    for (let i = 0; i < puffCount; i++) {
      const a = r() * Math.PI * 2, off = rad * (0.05 + r() * 0.4), sp = r() * Math.min(rad, 14) * 0.5;
      const life = 1.2 + r() * 1.6;
      this.smoke.push({
        position: add(p, vec(Math.cos(a) * off, Math.sin(a) * off * 0.7)),
        velocity: vec(Math.cos(a) * sp, Math.sin(a) * sp * 0.7),
        size: 0.5 + r() * rad * 0.28, life, ttl: life, tone: r() < 0.5 ? '#59636a' : '#6c6f6b', seed: this.nextSeed(),
      });
    }
    this.trim();
  }

  update(dt: number): void {
    const step = Number.isFinite(dt) ? clamp(dt, 0, 0.2) : 0;
    if (step <= 0) return;
    for (const s of this.splashes) s.elapsed += step;
    this.splashes = this.splashes.filter(s => s.elapsed < 1.5);
    for (const shard of this.railDebris) {
      shard.life -= step; shard.position = add(shard.position, scale(shard.velocity, step));
      shard.velocity = scale(shard.velocity, Math.exp(-step * 2)); shard.angle += shard.spin * step;
    }
    this.railDebris = this.railDebris.filter(s => s.life > 0);
    for (const b of this.blasts) {
      b.life += step;
      const t = clamp(b.life / b.ttl, 0, 1);
      b.radius = b.maxRadius * (1 - (1 - t) * (1 - t));
    }
    this.blasts = this.blasts.filter(b => b.life < b.ttl);
    for (const c of this.chunks) {
      c.life -= step;
      c.vz -= 21 * step;
      c.z += c.vz * step;
      if (c.z <= 0) {
        c.z = 0;
        if (c.vz < 0) c.vz = -c.vz * c.bounce;
        if (Math.abs(c.vz) < 0.6) c.vz = 0;
        c.velocity = scale(c.velocity, Math.max(0, 1 - 2.5 * step));
      }
      c.position = add(c.position, scale(c.velocity, step));
      c.angle += c.spin * step;
    }
    this.chunks = this.chunks.filter(c => c.life > 0 && this.inBounds(c.position));
    for (const e of this.embers) {
      e.life -= step;
      e.vz -= 5 * step;
      e.z = Math.max(0, e.z + e.vz * step);
      e.position = add(e.position, scale(e.velocity, step));
      e.velocity = scale(e.velocity, Math.max(0, 1 - 3.2 * step));
      e.angle += e.spin * step;
    }
    this.embers = this.embers.filter(e => e.life > 0 && this.inBounds(e.position));
    for (const s of this.smoke) {
      s.life -= step;
      s.position = add(s.position, scale(s.velocity, step));
      s.velocity = scale(s.velocity, Math.max(0, 1 - 1.6 * step));
      s.size += step * 0.9;
    }
    this.smoke = this.smoke.filter(s => s.life > 0 && this.inBounds(s.position));
    for (const m of this.bloodMarks) m.life -= step;
    this.bloodMarks = this.bloodMarks.filter(m => m.life > 0);
    this.trim();
  }

  /** Ground decals; draw beneath vehicles. Completely no-op when gore is false. */
  drawGround(ctx: CanvasRenderingContext2D, gore: boolean): void {
    if (!gore) return;
    ctx.save();
    for (const m of this.bloodMarks) {
      const alpha = clamp(m.life / 12, 0, 1) * 0.9;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(m.position.x, m.position.y);
      ctx.rotate(m.angle);
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.ellipse(0, 0, m.radius, m.radius * 0.78, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = m.clot;
      for (const l of m.lobes) { ctx.beginPath(); ctx.ellipse(l.x, l.y, l.r, l.r * 0.8, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = alpha * 0.7;
      for (const s of m.specks) { ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    ctx.restore();
  }

  /** Air layers: shockwave rings, smoke and amber specks always; gore chunks only when gore. */
  drawAir(ctx: CanvasRenderingContext2D, time: number, gore: boolean): void {
    ctx.save();
    for (const s of this.splashes) {
      const t = s.elapsed / 1.5;
      ctx.save(); ctx.translate(s.position.x, s.position.y); ctx.scale(s.strength, s.strength); ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#e3ffff'; ctx.lineWidth = 0.13;
      for (const delay of [0, 0.2]) {
        const r = Math.max(0.1, 0.5 + (t - delay) * 4);
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.65, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = '#d6fcff';
      for (let i = 0; i < 18; i++) {
        const a = i * Math.PI * 2 / 18, r = 0.4 + t * (2.5 + i % 3);
        const lift = Math.max(0, Math.sin(Math.min(1, t * 1.7) * Math.PI)) * 2;
        ctx.beginPath(); ctx.ellipse(Math.cos(a) * r, Math.sin(a) * r * 0.6 - lift, 0.08, 0.16, a, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    for (const shard of this.railDebris) {
      ctx.save(); ctx.translate(shard.position.x, shard.position.y - Math.max(0, Math.sin((4 - shard.life) * Math.PI)) * 1.3);
      ctx.rotate(shard.angle); ctx.globalAlpha = Math.min(1, shard.life);
      ctx.fillStyle = '#bdccc6'; ctx.fillRect(-0.55, -0.1, 1.1, 0.2); ctx.restore();
    }
    for (const s of this.smoke) {
      const t = clamp(s.life / s.ttl, 0, 1);
      const alpha = 0.16 * t;
      const wobble = Math.sin(time * 0.9 + s.seed * 0.001) * 0.25;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.tone;
      ctx.beginPath(); ctx.ellipse(s.position.x + wobble, s.position.y - (1 - t) * 0.4, s.size, s.size * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = alpha * 1.5;
      ctx.beginPath(); ctx.ellipse(s.position.x + wobble * 0.6, s.position.y - (1 - t) * 0.4, s.size * 0.5, s.size * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (const e of this.embers) {
      const t = clamp(e.life / e.ttl, 0, 1);
      ctx.save();
      ctx.globalAlpha = t;
      ctx.translate(e.position.x, e.position.y - e.z * 0.15);
      ctx.rotate(e.angle);
      ctx.fillStyle = e.color;
      ctx.fillRect(-e.size, -e.size, e.size * 2, e.size * 2);
      ctx.restore();
    }
    for (const b of this.blasts) {
      const t = clamp(b.life / b.ttl, 0, 1), fade = (1 - t) * (1 - t);
      // Large rings fade harder so a 34 m wave stays a legible outline, not a flash.
      const legibility = clamp(8 / b.maxRadius, 0.3, 1);
      ctx.globalAlpha = fade * 0.85 * legibility;
      ctx.strokeStyle = b.color; ctx.lineWidth = 0.14 + (1 - t) * 0.22 * legibility;
      ctx.beginPath(); ctx.arc(b.position.x, b.position.y, b.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = fade * 0.4 * legibility;
      ctx.strokeStyle = '#ffe6b0'; ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.arc(b.position.x, b.position.y, Math.max(0.05, b.radius * 0.7), 0, Math.PI * 2); ctx.stroke();
    }
    if (gore) for (const c of this.chunks) this.drawChunk(ctx, c);
    ctx.restore();
  }

  private drawChunk(ctx: CanvasRenderingContext2D, c: GoreChunk): void {
    ctx.save();
    ctx.globalAlpha = 0.22 * clamp(1 - c.z * 0.3, 0.1, 1);
    ctx.fillStyle = '#140a0c';
    ctx.beginPath(); ctx.ellipse(c.position.x, c.position.y, c.size * 1.1, c.size * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = clamp(c.life / 1.2, 0, 1);
    ctx.translate(c.position.x, c.position.y - c.z * 0.15);
    ctx.rotate(c.angle);
    ctx.fillStyle = c.color; ctx.strokeStyle = c.edge; ctx.lineWidth = 0.02;
    ctx.beginPath();
    if (c.kind === 'cloth') ctx.rect(-c.size, -c.size * 0.6, c.size * 2, c.size * 1.2);
    else if (c.kind === 'shard') { ctx.moveTo(-c.size, c.size * 0.7); ctx.lineTo(c.size * 0.9, 0); ctx.lineTo(-c.size * 0.5, -c.size); ctx.closePath(); }
    else for (let i = 0; i < c.points.length; i++) { const x = c.points[i].x * c.size, y = c.points[i].y * c.size; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
