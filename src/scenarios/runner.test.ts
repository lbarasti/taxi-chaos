import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ScenarioRunner, parseCommand, parseScenario } from './runner';
import { dayMinute } from '../campaign/clock';

const example = (name: string) => parseScenario(JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')));
const pass = (runner: ScenarioRunner, command: unknown) => {
  const reply = runner.execute(command);
  expect(reply.status, reply.error).toBe('passed');
  return reply;
};
afterEach(() => vi.unstubAllGlobals());

describe('stateful scenario harness', () => {
  it('runs the documented investigation through dispatch, pickups, source checks, edition and delayed response', () => {
    const scenario = example('open-shore'), runner = new ScenarioRunner(scenario.options);
    for (const command of scenario.steps) pass(runner, command);
    const final = runner.snapshot();
    expect(final.completed).toEqual(['bea-first-shift', 'celia-barriers', 'nico-safe-ride']);
    expect(final.campaign?.newsroom.received['cleaner-note'].verifiedAt).not.toBeNull();
    expect(final.campaign?.publications).toHaveLength(1);
    expect(final.campaign?.world.security).toBe('suspended');
    expect(final.materialIds).toEqual(['barrier-receipt', 'cafe-photo', 'cleaner-note']);
    expect(final.physicsSeconds).toBeLessThan(16);
  }, 10000);

  it('resolves missing events without granting evidence, and respects when a hypothesis arrived', () => {
    for (const name of ['missed-cafe', 'tenant-hearing']) {
      const scenario = example(name), runner = new ScenarioRunner(scenario.options);
      for (const command of scenario.steps) pass(runner, command);
      expect(runner.snapshot().materialIds).toEqual([]);
      expect(runner.game.save.campaign.world.cafe).toBe(name === 'missed-cafe' ? 'closed' : 'tenancy-review');
    }
  });

  it('discovers borrowed linen, resumes an accepted wash and records local aftermath without campaign evidence', () => {
    const scenario = example('borrowed-linen'), runner = new ScenarioRunner(scenario.options);
    for (const command of scenario.steps) pass(runner, command);
    const final = runner.snapshot();
    expect(final.completed).toEqual(['linen-sam-clockoff', 'linen-mags-loan', 'linen-return']);
    expect(final.campaign?.world['linen-stock']).toBe('clean');
    expect(final.materialIds).toEqual([]);
    const unvisited = new ScenarioRunner();
    pass(unvisited, { op: 'advance', event: 'linen-stock-count' });
    const outsideLinen = (world: Record<string, unknown>) => Object.fromEntries(Object.entries(world).filter(([key]) => !key.startsWith('linen-')));
    expect(outsideLinen(final.campaign!.world)).toEqual(outsideLinen(unvisited.snapshot().campaign!.world));
    expect(final.campaign?.newsroom).toEqual(unvisited.snapshot().campaign?.newsroom);
    expect(final.campaign?.publications).toEqual(unvisited.snapshot().campaign?.publications);
    expect(final.physicsSeconds).toBeLessThan(25);
  }, 10000);

  it('retains accepted choices and material across a real serialized save reconstruction, without user storage', () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }; vi.stubGlobal('localStorage', storage);
    const r = new ScenarioRunner();
    pass(r, { op: 'advance', to: { day: 3 } });
    pass(r, { op: 'route', mission: 'nico-safe-ride' });
    const picked = pass(r, { op: 'pickup' });
    expect(picked.state.choices['nico-trip']).toBe('room');
    const oldGame = r.game;
    pass(r, { op: 'reload' });
    expect(r.game).not.toBe(oldGame); expect(r.game.job.stage).toBe('dropoff');
    expect(r.game.save.story.choices['nico-trip']).toBe('room');
    pass(r, { op: 'deliver' });
    const record = r.game.save.playerRecords.notebook.find(e => e.id === 'cleaner-note');
    expect(record?.source).toBeDefined();
    pass(r, { op: 'reload' });
    expect(r.game.save.playerRecords.notebook.find(e => e.id === 'cleaner-note')).toEqual(record);
    expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('rejects unavailable actions by default and tests expected rejections without granting state', () => {
    const r = new ScenarioRunner();
    expect(r.execute({ op: 'photo' }).status).toBe('failed');
    pass(r, { op: 'photo', expected: false });
    pass(r, { op: 'submit', material: 'cafe-photo', expected: false });
    pass(r, { op: 'route', mission: 'nico-safe-ride', expected: false });
    pass(r, { op: 'stopover', action: 'route', expected: false });
    pass(r, { op: 'stopover', action: 'begin', expected: false });
    expect(r.snapshot().materialIds).toEqual([]); expect(r.snapshot().choices).toEqual({});
    expect(r.execute({ op: 'deliver' }).status).toBe('failed');
  });

  it('uses fixed-step inputs, freezes simulation time in menus and keeps campaign advance independent of physics', () => {
    const r = new ScenarioRunner(), start = r.snapshot();
    pass(r, { op: 'step', seconds: 0.25, keys: ['KeyW'] });
    expect(r.snapshot().position).not.toEqual(start.position);
    pass(r, { op: 'mode', mode: 'paused' }); const paused = r.snapshot();
    pass(r, { op: 'step', seconds: 0.25 });
    expect(r.snapshot().time).toBe(paused.time); expect(r.snapshot().campaign?.minute).toBe(paused.campaign?.minute);
    pass(r, { op: 'advance', event: 'cafe-boarded' });
    expect(r.snapshot().time).toBe(paused.time); expect(r.snapshot().campaign?.minute).toBe(dayMinute(3));
    expect(r.execute({ op: 'advance', to: { day: 2 } }).error).toContain('backwards');
  });

  it('validates all facts before mutation and cannot rewrite committed branches or earlier world outcomes', () => {
    const r = new ScenarioRunner(), before = r.snapshot();
    expect(r.execute({ op: 'facts', facts: { cash: 999, flags: { typo: true } } }).status).toBe('failed');
    expect(r.snapshot()).toEqual(before);
    pass(r, { op: 'facts', facts: { choices: { 'nico-trip': 'room' }, health: 50 } });
    expect(r.execute({ op: 'facts', facts: { cash: 999, choices: { 'nico-trip': 'roster' } } }).status).toBe('failed');
    expect(r.game.save.cash).toBe(80); expect(r.game.health).toBe(50);
    expect(r.execute({ op: 'advance', event: 'invented-event' }).status).toBe('failed');
  });

  it('reports useful assertion failures, distinguishes missing paths from null, and detaches returned state', () => {
    const r = new ScenarioRunner();
    pass(r, { op: 'expect', path: 'choices.nico-trip', exists: false });
    expect(r.execute({ op: 'expect', path: 'choices.nico-trip', equals: null }).error).toContain('<missing>');
    pass(r, { op: 'expect', path: 'choices', equals: {} });
    pass(r, { op: 'expect', path: 'health', gte: 100 });
    const reply = r.execute({ op: 'expect', path: 'campaign.world.cafe', equals: 'closed' });
    expect(reply.status).toBe('failed'); expect(reply.error).toContain('got "open"');
    reply.state.flags.push('contact-bea-lost'); reply.state.campaign!.world.cafe = 'closed';
    expect(r.game.save.story.flags).toEqual([]); expect(r.game.save.campaign.world.cafe).toBe('open');
  });

  it('rejects misspelled fields, ambiguous clocks, invalid names and unbounded physics before execution', () => {
    for (const command of [
      { op: 'stepp', seconds: 1 }, { op: 'step', seconds: 31 }, { op: 'step', seconds: 1, keys: ['eval'] },
      { op: 'advance', minutes: 5, to: { day: 3 } }, { op: 'advance', to: { day: 3, hours: 7 } },
      { op: 'place', at: { x: 3, y: NaN } }, { op: 'capture', name: '../escape' },
      { op: 'capture', name: 'panel', panelOnly: true }, { op: 'expect', path: 'cash', equals: 5, gte: 0 },
      { op: 'facts', facts: { publications: ['coordination'] } }, { op: 'sleep', expect: false },
      { op: 'ordinary', character: 'nobody' },
      { op: 'ordinary', character: '' },
      { op: 'stopover', action: 'complete' }, { op: 'stopover' }, { op: 'stopover', action: 'begin', expected: 'yes' },
    ]) expect(() => parseCommand(command)).toThrow();
    expect(() => parseScenario({ version: 2, name: 'Future', steps: [{ op: 'read' }] })).toThrow();
    expect(() => parseScenario({ version: 1, name: 'Duplicate', steps: [{ op: 'capture', name: 'x' }, { op: 'capture', name: 'x' }] })).toThrow();
    const r = new ScenarioRunner();
    expect(r.execute({ op: 'place', at: 'typo' }).status).toBe('failed');
    expect(r.execute({ op: 'step', seconds: 31 }).state.physicsSeconds).toBe(0);
  });

  it('dispatches a named ordinary fare without moving the taxi', () => {
    const r = new ScenarioRunner();
    const start = { ...r.game.actor.position };
    for (const character of ['sam', 'june', 'ravi', 'cleo', 'oscar'] as const) {
      const reply = pass(r, { op: 'ordinary', character });
      expect(reply.state.job.name.toLowerCase()).toBe(character);
      expect(r.game.job.everyday?.character).toBe(character);
      expect(reply.state.dialogue?.message.speaker).toBe('bea');
      expect(r.game.actor.position).toEqual(start);
    }
  });

  it('bounds a stateful stream and does not spend physics budget on scheduler advances', () => {
    const r = new ScenarioRunner();
    vi.spyOn(r.game, 'update').mockImplementation(() => {});
    for (let i = 0; i < 4; i++) pass(r, { op: 'step', seconds: 30 });
    expect(r.execute({ op: 'step', seconds: 0.1 }).error).toContain('physics budget');
    pass(r, { op: 'advance', to: { day: 15 } });
    expect(r.snapshot().physicsSeconds).toBe(120);
    pass(r, { op: 'capture', name: 'one' });
    expect(r.execute({ op: 'capture', name: 'one' }).error).toContain('Duplicate');
  });
});
