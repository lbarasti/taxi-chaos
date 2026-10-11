import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import { defaultCompiledMap } from '../map/compile';
import { vec } from '../physics';
import { migrateMissionProgress } from './progress';
import { MissionDirector } from './director';
import { compileMissions } from './compile';
import catalogue from './catalogue.json';
import type { MissionCatalogue } from './schema';

const step = (g: Game, seconds = 0.9) => { for (let i = 0; i < seconds * 120; i++) g.update(1 / 120); };
const arrive = (g: Game, point: { x: number; y: number }) => {
  g.player.body.position = { ...point }; g.player.body.velocity = vec(); step(g);
};
const ready = () => {
  const g = new Game(defaultCompiledMap, false);
  g.vehicles = [g.player]; g.trafficTarget = 0; g.settings.noPolice = true; g.start();
  arrive(g, g.job.pickup); arrive(g, g.job.dropoff);
  return g;
};

describe('parallel text offers and physical branches', () => {
  it('introduces three concurrent unaccepted offers after the opening delivery', () => {
    const g = ready();
    expect([...g.missionOffers.keys()]).toEqual(['mia-cafe-trail', 'frankie-ledger-trail', 'frankie-arcade-lift']);
    expect(g.missions.activeId).toBeNull();
    expect(g.save.story.choices).toEqual({});
    expect(g.world.people.filter(p => p.alive && p.role === 'customer').length).toBe(4);
  });

  it('routing between texts is reversible and does not spawn more people or advance RNG', () => {
    const g = ready(), other = ready(), count = g.world.people.length;
    for (let i = 0; i < 10; i++) {
      expect(g.routeMissionOffer('mia-cafe-trail')).toBe(true);
      expect(g.routeMissionOffer('frankie-ledger-trail')).toBe(true);
    }
    expect(g.world.people.length).toBe(count);
    expect(g.world.random()).toBe(other.world.random());
    expect(g.missions.activeId).toBeNull(); expect(g.save.story.choices).toEqual({});
    expect(g.missions.log.filter(e => e.type === 'abandoned')).toEqual([]);
  });

  it('locks the branch at the physically visited pickup, not the routed message', () => {
    const g = ready(); g.routeMissionOffer('mia-cafe-trail');
    arrive(g, g.missionOffers.get('frankie-ledger-trail')!.pickup);
    expect(g.job.missionId).toBe('frankie-ledger-trail'); expect(g.job.stage).toBe('dropoff');
    expect(g.save.story.choices).toEqual({ 'meridian-trail': 'ledger' });
    expect(g.save.story.relationships.frankie).toBe(2);
    expect([...g.missionOffers.keys()]).toEqual(['frankie-arcade-lift']);
    expect(g.routeMissionOffer('frankie-arcade-lift')).toBe(false);
    expect(g.save.story.flags).not.toContain('dock-ledger-found');
    arrive(g, g.job.dropoff);
    expect(g.save.story.flags).toContain('dock-ledger-found');
    expect(g.missionOffers.has('frankie-arcade-lift')).toBe(true);
  });

  it('an independent mission leaves both plot branches available', () => {
    const g = ready(); arrive(g, g.missionOffers.get('frankie-arcade-lift')!.pickup);
    expect(g.save.story.choices).toEqual({}); arrive(g, g.job.dropoff);
    expect([...g.missionOffers.keys()]).toEqual(['mia-cafe-trail', 'frankie-ledger-trail']);
    expect(g.save.story.completed).toContain('frankie-arcade-lift');
  });

  it('abandonment, save migration and a fresh shift preserve the chosen branch', () => {
    const g = ready(); arrive(g, g.missionOffers.get('mia-cafe-trail')!.pickup);
    g.setMode('wasted'); g.recover();
    expect(g.save.story.choices['meridian-trail']).toBe('cafe');
    expect(g.save.story.completed).not.toContain('mia-cafe-trail');
    const saved = migrateMissionProgress(JSON.parse(JSON.stringify(g.save.story)));
    const d = new MissionDirector(g.missions.catalogue, saved);
    const context = { deliveries: saved.deliveries, jobType: 'fare' as const, model: 'car' as const, kind: 'taxi' as const, time: saved.campaignSeconds };
    expect(d.available(context)).toContain('mia-cafe-trail'); expect(d.available(context)).not.toContain('frankie-ledger-trail');
    g.resetRun(); expect([...g.missionOffers.keys()]).toEqual(['mia-cafe-trail', 'frankie-arcade-lift']);
    for (const offer of g.missionOffers.values()) expect(g.world.people.find(p => p.id === offer.customerId)?.role).toBe('customer');
    g.resetStory(); expect(g.missionOffers.size).toBe(0); expect(g.save.story.choices).toEqual({});
  });

  it('rejects invalid text senders, branch references and completion-bound branches', () => {
    for (const edit of [
      (doc: MissionCatalogue) => { (doc.missions['mia-cafe-trail'].offer as { character: string }).character = 'missing'; },
      (doc: MissionCatalogue) => { (doc.missions['mia-cafe-trail'].pickupChoice as { choice: string }).choice = 'missing'; },
      (doc: MissionCatalogue) => { (doc.missions['mia-cafe-trail'].choices![0] as { commit: string }).commit = 'completion'; },
    ]) {
      const doc = structuredClone(catalogue) as unknown as MissionCatalogue; edit(doc);
      expect(() => compileMissions(defaultCompiledMap, doc)).toThrow();
    }
  });
});
