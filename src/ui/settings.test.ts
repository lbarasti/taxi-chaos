import { describe, expect, it, vi } from 'vitest';
import type { AudioFX } from '../audio/audio';
import { Game } from '../game/game';
import { createSettings } from './settings';
import { settingRow } from './setting-controls';

function audioStub() {
  const audio = {
    preferences: { muted: false, volume: 0.65, playerEngine: 0.7, sirens: 0.25 },
    configure: vi.fn((patch: Parameters<AudioFX['configure']>[0]) => { Object.assign(audio.preferences, patch); }),
    unlock: vi.fn(async () => true),
  };
  return audio;
}

describe('typed setting controls', () => {
  it('renders a switch for a new setting without interpreting its ID or label', () => {
    const markup = settingRow({ id: 'captions', icon: 'volume', label: 'Captions', type: 'switch', read: () => true, write: () => {} });
    expect(markup).toContain('type="checkbox" role="switch" id="captions-option" checked');
    expect(markup).not.toContain('type="range"');
  });
  it('keeps a slider numeric value separate from its formatted display', () => {
    const markup = settingRow({ id: 'steering', icon: 'difficulty', label: 'Steering', type: 'slider', min: 0.5, max: 2, step: 0.25, read: () => 1.5, write: () => {}, format: value => `×${value}` });
    expect(markup).toContain('min="0.5" max="2" step="0.25" value="1.5"');
    expect(markup).toContain('aria-valuetext="×1.5"');
    expect(markup).toContain('<output for="steering-option">×1.5</output>');
  });
  it('reads and writes gameplay settings on the current game instance', () => {
    let game = new Game(undefined, false);
    const previousGame = game;
    const controls = createSettings(() => game, audioStub());
    game = new Game(undefined, false);
    controls.gore.write(true);
    controls.difficulty.write(2);
    expect(game.settings.gore).toBe(true);
    expect(game.settings.difficulty).toBe('chaos');
    expect(controls.gore.read()).toBe(true);
    expect(controls.difficulty.format(controls.difficulty.read())).toBe('Chaos');
    expect(previousGame.settings.gore).toBe(false);
    expect(previousGame.settings.difficulty).toBe('standard');
  });
  it('keeps audio conversion, mute and unlocking in their own setting definitions', () => {
    const audio = audioStub();
    const controls = createSettings(() => new Game(undefined, false), audio);
    controls.volume.write(42);
    expect(audio.preferences).toEqual({ muted: false, volume: 0.42, playerEngine: 0.7, sirens: 0.25 });
    controls.playerEngine.write(23);
    expect(controls.playerEngine.read()).toBe(23);
    expect(controls.playerEngine.format(controls.playerEngine.read())).toBe('23%');
    controls.sirens.write(0);
    expect(audio.preferences).toEqual({ muted: false, volume: 0.42, playerEngine: 0.23, sirens: 0 });
    controls.muted.write(true);
    expect(audio.preferences.muted).toBe(true);
    expect(audio.unlock).toHaveBeenCalledTimes(4);
    audio.preferences.volume = 0.81;
    expect(controls.volume.read()).toBe(81);
    expect(controls.volume.format(controls.volume.read())).toBe('81%');
  });
});
