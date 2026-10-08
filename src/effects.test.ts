import { describe, expect, it } from 'vitest';
import {
  Effects, MAX_BLASTS, MAX_BLAST_RADIUS, MAX_BLOOD_MARKS, MAX_CHUNKS, MAX_EMBERS, MAX_SMOKE,
  drawCorpse, drawFire, drawSmoke,
} from './effects';
import { vec } from './physics';
import type { Person } from './world';

// Lightweight recording 2D context so draw code can be exercised under Node
// (no Canvas, no jsdom). Counts save/restore balance and draw calls.
function mockCtx() {
  let calls = 0, saves = 0, restores = 0;
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, prop) {
      const key = String(prop);
      if (key === 'save') return () => { saves++; calls++; };
      if (key === 'restore') return () => { restores++; calls++; };
      if (key in t) return t[key];
      return () => { calls++; };
    },
    set(t, prop, value) { t[String(prop)] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls: () => calls, saves: () => saves, restores: () => restores };
}

const person = (over: Partial<Person> = {}): Person => ({
  id: 3, position: vec(10, 10), home: vec(10, 10), phase: 0, color: '#a7bce0', panic: 0,
  alive: false, aboard: false, health: 0, velocity: vec(), angle: 0.4, deathTime: 2, role: 'civilian', hitAt: 2,
  ...over,
});

const advance = (fx: Effects, seconds: number, dt = 0.1) => { for (let t = 0; t < seconds; t += dt) fx.update(dt); };

describe('effect object budgets and lifetime', () => {
  it('caps blood marks and gore chunks under sustained hits', () => {
    const fx = new Effects();
    for (let i = 0; i < 1200; i++) fx.bloodHit(vec(i % 240, (i * 7) % 240), vec(30, 5), 3, '#334850');
    expect(fx.bloodMarks.length).toBeLessThanOrEqual(MAX_BLOOD_MARKS);
    expect(fx.chunks.length).toBeLessThanOrEqual(MAX_CHUNKS);
    expect(fx.bloodMarks.length).toBe(MAX_BLOOD_MARKS);
  });

  it('caps blast rings, embers and smoke under sustained explosions', () => {
    const fx = new Effects();
    for (let i = 0; i < 200; i++) fx.explode(vec(i % 240, (i * 5) % 240), 6);
    expect(fx.blasts.length).toBeLessThanOrEqual(MAX_BLASTS);
    expect(fx.embers.length).toBeLessThanOrEqual(MAX_EMBERS);
    expect(fx.smoke.length).toBeLessThanOrEqual(MAX_SMOKE);
  });

  it('shows the full gas-station dangerous area up to 34 m without raising FX counts', () => {
    const fx = new Effects();
    fx.explode(vec(120, 120), 30);
    expect(fx.blasts[0].maxRadius).toBe(30);
    expect(fx.embers.length).toBeLessThanOrEqual(60);
    expect(fx.smoke.length).toBeLessThanOrEqual(34);
    advance(fx, 0.6, 0.1);
    expect(fx.blasts[0].radius).toBeGreaterThan(25); // ring reaches the 30 m edge
    fx.explode(vec(0, 0), 99);
    expect(fx.blasts.at(-1)!.maxRadius).toBe(MAX_BLAST_RADIUS);
  });

  it('expires marks, chunks, blasts, embers and smoke after their TTLs', () => {
    const fx = new Effects();
    fx.bloodHit(vec(4, 4), vec(20, 0), 3, '#a7bce0');
    fx.explode(vec(4, 4), 5);
    fx.explode(vec(8, 8), 2);
    advance(fx, 7); // all chunk lifetimes are <= 5.85s
    expect(fx.chunks.length).toBe(0);
    expect(fx.blasts.length).toBe(0);
    expect(fx.embers.length).toBe(0);
    expect(fx.smoke.length).toBe(0);
    expect(fx.bloodMarks.length).toBeGreaterThan(0);
    advance(fx, 92);
    expect(fx.bloodMarks.length).toBe(0);
  });

  it('keeps integrated particle coordinates finite and inside world bounds', () => {
    const fx = new Effects();
    for (let i = 0; i < 40; i++) fx.explode(vec(120 + i, 120 - i), 7);
    for (let i = 0; i < 200; i++) { fx.bloodHit(vec(120, 120), vec(60, -40), 2, '#e4ca79'); fx.update(1 / 60); }
    for (const c of fx.chunks) { expect(Number.isFinite(c.position.x)).toBe(true); expect(Number.isFinite(c.position.y)).toBe(true); expect(c.position.x).toBeGreaterThan(-30); expect(c.position.x).toBeLessThan(270); }
    for (const e of fx.embers) { expect(Number.isFinite(e.z)).toBe(true); }
  });

  it('reset clears every array', () => {
    const fx = new Effects();
    fx.bloodHit(vec(1, 1), vec(10, 0), 2, '#e9a69b');
    fx.explode(vec(1, 1), 4);
    fx.reset();
    expect(fx.bloodMarks.length + fx.chunks.length + fx.blasts.length + fx.embers.length + fx.smoke.length).toBe(0);
  });

  it('direction and speed of the hit bias the spray downrange', () => {
    const fx = new Effects();
    for (let i = 0; i < 40; i++) fx.bloodHit(vec(0, 0), vec(50, 0), 2, '#a7bce0');
    const mean = fx.chunks.reduce((sum, c) => sum + c.velocity.x, 0) / fx.chunks.length;
    expect(mean).toBeGreaterThan(10);
    const fast = new Effects();
    fast.bloodHit(vec(0, 0), vec(60, 0), 2, '#a7bce0');
    const slow = new Effects();
    slow.bloodHit(vec(0, 0), vec(0, 0), 2, '#a7bce0');
    expect(fast.chunks.length).toBeGreaterThan(slow.chunks.length);
  });
});

describe('gore gating and ctx state', () => {
  it('drawGround is a complete no-op when gore is false', () => {
    const fx = new Effects();
    fx.bloodHit(vec(3, 3), vec(20, 0), 3, '#a7bce0');
    const off = mockCtx();
    fx.drawGround(off.ctx, false);
    expect(off.calls()).toBe(0);
    const on = mockCtx();
    fx.drawGround(on.ctx, true);
    expect(on.calls()).toBeGreaterThan(0);
  });

  it('drawAir draws more when gore chunks are enabled', () => {
    const fx = new Effects();
    fx.explode(vec(5, 5), 4);
    fx.bloodHit(vec(5, 5), vec(30, 0), 3, '#b0cbaa');
    expect(fx.chunks.length).toBeGreaterThan(0);
    const off = mockCtx(); fx.drawAir(off.ctx, 1.2, false);
    const on = mockCtx(); fx.drawAir(on.ctx, 1.2, true);
    expect(on.calls()).toBeGreaterThan(off.calls());
  });

  it('all draw entry points balance save()/restore()', () => {
    const fx = new Effects();
    fx.bloodHit(vec(3, 3), vec(20, 5), 2, '#e4ca79');
    fx.explode(vec(3, 3), 4);
    fx.update(0.2);
    const m = mockCtx();
    fx.drawGround(m.ctx, true);
    fx.drawAir(m.ctx, 1.4, true);
    drawFire(m.ctx, vec(2, 2), 1.2, 1.4, 7);
    drawSmoke(m.ctx, vec(2, 2), 1.2, 1.4, 7);
    drawCorpse(m.ctx, person());
    expect(m.saves()).toBeGreaterThan(0);
    expect(m.restores()).toBe(m.saves());
  });

  it('deterministic fire/smoke produce no NaN and complete without state leaks', () => {
    const m = mockCtx();
    drawFire(m.ctx, vec(0, 0), 2, 3.7, 11);
    drawSmoke(m.ctx, vec(0, 0), 2, 3.7, 11);
    expect(m.restores()).toBe(m.saves());
  });
});
