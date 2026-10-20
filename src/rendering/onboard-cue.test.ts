import { describe, expect, it } from 'vitest';
import { Game } from '../game/game';
import { loadScenario } from '../debug/lab';
import { onBoardCue, onBoardLight } from './onboard-cue';

/** Mount the parked courier bike exactly like the motorcycle integration tests. */
function takeBike() {
  const g = new Game(); loadScenario(g, 'motorcycle');
  expect(g.interact()).toBe(true);
  g.keys = new Set(['KeyS']); for (let i = 0; i < 24; i++) g.update(1 / 120); g.keys.clear();
  expect(g.enterableCar?.model).toBe('motorcycle'); expect(g.interact()).toBe(true);
  return g;
}

describe('on-board world cue', () => {
  it('confines the cab glow to its roof instead of spilling across the street', () => {
    const g = new Game(undefined, false);
    expect(onBoardLight(g, g.player)).toBeNull();
    g.job.stage = 'dropoff';
    const light = onBoardLight(g, g.player, true)!;
    expect(light).toMatchObject({ cue: 'roof', radius: 1.4, color: [74, 255, 132], intensity: 0.6, groundOnly: false });
    expect(light.radius * 2).toBeLessThan(g.player.body.w);
    expect(light.artificial).toBeUndefined(); // no dusk/dawn dimming
    expect(light.profile).toBeUndefined(); // shared soft radial sprite, no ring or cone
    expect({ x: light.x, y: light.y }).toEqual(g.player.body.toWorld({ x: -0.1, y: 0 }));
    g.time += 1;
    expect(onBoardLight(g, g.player, true)).toEqual(light); // reduced motion: steady light
    expect(onBoardLight(g, g.player)!.intensity).toBeGreaterThan(0.5);
    g.newJob(false);
    expect(onBoardLight(g, g.player)).toBeNull();
  });

  it('gives the bike a compact dimmer ground glow and no leftover light when abandoned', () => {
    const g = takeBike(); g.job.stage = 'dropoff';
    expect(onBoardLight(g, g.player, true)).toMatchObject({ cue: 'body', ...g.player.body.position, radius: 3.2, intensity: 0.6, groundOnly: true });
    g.onFoot = true;
    expect(onBoardLight(g, g.player)).toBeNull();
    g.onFoot = false; g.player.alive = false;
    expect(onBoardLight(g, g.player)).toBeNull();
  });
  it('glows on the active cab roof only while a passenger is aboard', () => {
    const g = new Game(undefined, false);
    expect(g.player.model).toBe('car'); expect(g.player.kind).toBe('taxi');
    expect(onBoardCue(g, g.player)).toBeNull(); // still collecting
    g.job.stage = 'dropoff';
    expect(onBoardCue(g, g.player)).toBe('roof');
  });

  it('glows on the courier bike body while its parcel is aboard', () => {
    const g = takeBike();
    expect(g.player.model).toBe('motorcycle'); expect(g.job.type).toBe('parcel');
    expect(onBoardCue(g, g.player)).toBeNull(); // parcel not collected yet
    g.job.stage = 'dropoff';
    expect(onBoardCue(g, g.player)).toBe('body');
  });

  it('keeps the roof cue for any player-driven cab, including a replacement car', () => {
    const g = new Game(undefined, false);
    (g.player as { model: Game['player']['model'] }).model = 'pickup';
    g.job.stage = 'dropoff';
    expect(onBoardCue(g, g.player)).toBe('roof');
  });

  it('clears after delivery and never marks an abandoned or other vehicle', () => {
    const g = new Game(undefined, false);
    g.job.stage = 'dropoff';
    expect(onBoardCue(g, g.player)).toBe('roof');
    g.newJob(false);
    expect(g.job.stage).toBe('pickup');
    expect(onBoardCue(g, g.player)).toBeNull();
    // Abandoning the cab (walking away) drops the cue even mid-fare.
    g.job.stage = 'dropoff'; g.onFoot = true;
    expect(onBoardCue(g, g.player)).toBeNull();
    g.onFoot = false;
    const other = g.vehicles.find(v => v !== g.player)!;
    expect(onBoardCue(g, other)).toBeNull();
  });

  it('never marks a wrecked, burning or sinking ride', () => {
    const g = new Game(undefined, false);
    g.job.stage = 'dropoff';
    for (const status of ['wreck', 'burning'] as const) {
      g.player.damage.status = status;
      expect(onBoardCue(g, g.player)).toBeNull();
    }
    g.player.damage.status = 'intact';
    g.player.sinking = { elapsed: 0, entrySpeed: 5 };
    expect(onBoardCue(g, g.player)).toBeNull();
  });

  it('is a deterministic, read-only view of the fare state', () => {
    const g = new Game(undefined, false);
    g.job.stage = 'dropoff';
    const before = g.snapshot();
    const first = onBoardCue(g, g.player);
    expect(onBoardCue(g, g.player)).toBe(first);
    expect(onBoardLight(g, g.player)).toEqual(onBoardLight(g, g.player));
    expect(g.snapshot()).toEqual(before);
  });
});
