import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { vec } from './physics';
import { campaignDefinition } from './campaign/content';
import { dayMinute } from './campaign/clock';
import { observationActionState } from './navigation-hud';
import { parsePlayerRecords } from './player-records';
import type { CampaignDefinition } from './campaign/model';

const make = (definition = campaignDefinition) => {
  const g = new Game(undefined, false, true, undefined, definition);
  g.start();
  return g;
};
const visit = (g: Game) => {
  g.advanceNarrativeTo(dayMinute(3));
  g.player.body.position = { ...g.missions.catalogue.stops.byId['garden-cafe'].position };
  g.player.body.velocity = vec();
};

describe('deliberate observation quick action', () => {
  it('stays hidden until the authored scene and physical visit are both eligible', () => {
    const g = make();
    expect(observationActionState(g)).toBeNull();
    g.player.body.position = { ...g.missions.catalogue.stops.byId['garden-cafe'].position };
    expect(observationActionState(g)).toBeNull();
    expect(g.observeScene()).toBe(false);
    visit(g);
    const before = structuredClone(g.save);
    expect(observationActionState(g)).toEqual({ id: 'cafe-photo', label: 'Record café frontage', disabled: false, recorded: false });
    expect(g.save).toEqual(before); // Viewing/hinting never acquires a source.
    g.player.body.position.y += 16.01;
    expect(observationActionState(g)).toBeNull();
    expect(g.observeScene()).toBe(false);
    expect(g.save.playerRecords.notebook).toEqual([]);
  });

  it('shares exact radius, speed and mode gates with the collection command', () => {
    const g = make(); visit(g);
    g.player.body.position.y += 16;
    g.player.body.velocity = vec(2.81, 0);
    expect(observationActionState(g)).toMatchObject({ disabled: true, label: 'Record café frontage: Slow down to record this observation.' });
    expect(g.observeScene()).toBe(false);
    g.player.body.velocity = vec(2.8, 0);
    expect(observationActionState(g)?.disabled).toBe(false);
    for (const mode of ['intro', 'paused', 'garage', 'wasted', 'arrested'] as const) {
      g.setMode(mode);
      expect(observationActionState(g)?.disabled).toBe(true);
      expect(g.observeScene()).toBe(false);
    }
    g.setMode('playing');
    expect(g.observeScene('unknown-scene')).toBe(false);
    expect(g.observationStatus('unknown-scene')).toBeNull();
    expect(g.observeScene()).toBe(true);
  });

  it('follows the active actor on foot instead of the abandoned vehicle', () => {
    const g = make();
    g.advanceNarrativeTo(dayMinute(3));
    g.onFoot = true;
    g.driver.position = { ...g.missions.catalogue.stops.byId['garden-cafe'].position };
    g.player.body.velocity = vec(20, 0);
    expect(observationActionState(g)?.disabled).toBe(false);
    g.driver.velocity = vec(3, 0);
    expect(observationActionState(g)?.disabled).toBe(true);
    expect(g.observeScene()).toBe(false);
    g.driver.velocity = vec();
    expect(g.observeScene()).toBe(true);
    expect(g.save.campaign.newsroom.received).toEqual({});
    expect(g.save.campaign.publications).toEqual([]);
  });

  it('records once, confirms the notebook destination and retains the checked state after reconstruction', () => {
    const definition: CampaignDefinition = { ...campaignDefinition, handlers: [
      { on: 'observation', id: 'cafe-photo', effects: [{ relationship: { character: 'iris', delta: 1 } }] },
    ] };
    const g = make(definition); visit(g);
    expect(g.observeScene()).toBe(true);
    expect(g.toast).toBe('Observation saved: Garden Café frontage. In Dispatch notebook; bring a copy to the newsroom.');
    expect(observationActionState(g)).toMatchObject({ recorded: true, disabled: true, label: 'Already recorded: Garden Café frontage. Saved in your Dispatch notebook.' });
    const saved = structuredClone(g.save), log = [...g.eventLog];
    g.toastTime = 0;
    expect(g.observeScene()).toBe(true); // Existing command stays idempotent.
    expect(g.save).toEqual(saved);
    expect(g.eventLog).toEqual(log);
    expect(g.toastTime).toBe(0);
    expect(g.save.story.relationships.iris).toBe(1);
    expect(g.save.playerRecords.notebook.filter(entry => entry.id === 'cafe-photo')).toHaveLength(1);
    saved.playerRecords = parsePlayerRecords(JSON.parse(JSON.stringify(saved.playerRecords)));
    const loaded = new Game(undefined, false, true, saved, definition);
    loaded.start();
    expect(observationActionState(loaded)).toMatchObject({ recorded: true, disabled: true });
  });

  it('selects the actual nearby scene and prefers an unrecorded scene over a checked one', () => {
    const cafe = campaignDefinition.observations[0];
    const second = { ...cafe, id: 'quay-photo', stop: 'the-docks', label: 'Record quay frontage', requires: { all: [] } } as const;
    const definition: CampaignDefinition = { ...campaignDefinition,
      materials: { ...campaignDefinition.materials, 'quay-photo': { ...campaignDefinition.materials['cafe-photo'], title: 'Quay frontage' } },
      observations: [second, cafe],
    };
    const g = make(definition); visit(g);
    expect(observationActionState(g)?.id).toBe('cafe-photo');
    g.player.body.position = { ...g.missions.catalogue.stops.byId['the-docks'].position };
    expect(observationActionState(g)?.id).toBe('quay-photo');
    expect(g.observeScene('quay-photo')).toBe(true);

    const colocated = make({ ...definition, observations: [{ ...second, stop: cafe.stop }, cafe] });
    visit(colocated);
    expect(colocated.observeScene('quay-photo')).toBe(true);
    expect(observationActionState(colocated)).toMatchObject({ id: 'cafe-photo', recorded: false, disabled: false });
  });

  it('offers no collection in persistence-disabled map previews without a campaign', () => {
    const g = new Game(undefined, false, false);
    g.start(); visit(g);
    expect(observationActionState(g)).toBeNull();
    expect(g.observeScene()).toBe(false);
  });
});
