import { describe, expect, it, vi } from 'vitest';
import { Game } from '../game';
import { defaultCompiledMap } from '../map/compile';
import { vec } from '../physics';
import { parseMissionProgress } from './progress';
import { MissionDirector } from './director';
import { compileMissions } from './compile';
import catalogue from './catalogue.json';
import type { MissionCatalogue } from './schema';
import { parsePlayerRecords } from '../player-records';

const step = (g: Game, seconds = 0.9) => { for (let i = 0; i < seconds * 120; i++) g.update(1 / 120); };
const arrive = (g: Game, point: { x: number; y: number }) => {
  g.player.body.position = { ...point }; g.player.body.velocity = vec(); step(g);
};
const ready = () => {
  const g = new Game(defaultCompiledMap, false, 'legacy');
  g.vehicles = [g.player]; g.trafficTarget = 0; g.settings.noPolice = true; g.start();
  arrive(g, g.job.pickup); arrive(g, g.job.dropoff);
  return g;
};

describe('parallel text offers and physical branches', () => {
  it('gives non-campaign texts a two-day expiry and prevents expired pickups after reload', () => {
    const g = ready(), receipt = g.save.playerRecords.texts.find(t => t.missionId === 'frankie-arcade-lift')!;
    expect(receipt.expiresMinute! - receipt.receivedMinute!).toBe(2880);
    expect(g.routeMissionOffer(receipt.missionId)).toBe(true);
    g.save.story.campaignSeconds += 2880; g.syncMissionOffers();
    expect(g.routeMissionOffer(receipt.missionId)).toBe(false);
    expect(g.save.story.failed).toContain(receipt.missionId);
    expect(g.save.playerRecords.texts).toContainEqual(receipt);
    expect(g.save.story.flags).not.toContain('contact-frankie-lost');
    const restored = new Game(defaultCompiledMap, false, 'legacy', structuredClone(g.save)); restored.start();
    expect(restored.routeMissionOffer(receipt.missionId)).toBe(false);
  });

  it('rejects a physical pickup at expiry even between offer reconciliation checkpoints', () => {
    const g = ready(); g.routeMissionOffer('frankie-arcade-lift');
    const receipt = g.save.playerRecords.texts.find(t => t.missionId === 'frankie-arcade-lift')!;
    g.save.story.campaignSeconds += receipt.expiresMinute! - g.textMessageMinute - 0.001;
    g.syncMissionOffers();
    g.player.body.position = { ...g.job.pickup }; g.player.body.velocity = vec(); g.job.wait = 0.795;
    g.update(1 / 120);
    expect(g.save.story.failed).toContain(receipt.missionId);
    expect(g.job.missionId).not.toBe(receipt.missionId);
    expect(g.save.story.completed).not.toContain(receipt.missionId);
  });

  it('retains received/read information after a competing pickup closes its opportunity', () => {
    const g = ready(), receipt = g.save.playerRecords.texts.find(t => t.missionId === 'frankie-ledger-trail')!;
    expect(receipt.readAt).toBeNull();
    g.readTextMessages([receipt.messageId]); const readAt = receipt.readAt;
    arrive(g, g.missionOffers.get('mia-cafe-trail')!.pickup);
    expect(g.save.playerRecords.texts.find(t => t.messageId === receipt.messageId)).toEqual(receipt);
    expect(receipt.readAt).toBe(readAt);
    expect(g.routeMissionOffer(receipt.missionId)).toBe(false);
    expect(parsePlayerRecords(JSON.parse(JSON.stringify(g.save.playerRecords))).texts).toContainEqual(receipt);
    g.resetRun(); expect(g.save.playerRecords.texts).toHaveLength(3);
    expect(g.save.playerRecords.texts.find(t => t.messageId === receipt.messageId)?.readAt).toBe(readAt);
    g.resetStory(); expect(g.save.playerRecords.texts).toEqual([]);
  });

  it('records an authored missed outcome when an unselected offer contact dies, without respawning', () => {
    const g = ready(), lost = g.missionOffers.get('frankie-ledger-trail')!;
    g.routeMissionOffer('mia-cafe-trail');
    const person = g.world.people.find(p => p.id === lost.customerId)!;
    person.alive = false; person.deathTime = g.time; g.death(person, vec(), 0, false);
    const count = g.world.people.length;
    step(g, 1);
    expect(g.world.people.length).toBe(count);
    expect(g.missionOffers.has('frankie-ledger-trail')).toBe(false);
    expect(g.save.story.failed).toContain('frankie-ledger-trail');
    expect(g.save.story.flags).toContain('ledger-lead-missed');
    expect(g.save.playerRecords.texts.some(t => t.missionId === 'frankie-ledger-trail')).toBe(true);
    expect(g.job.missionId).toBe('mia-cafe-trail');
    expect(g.missions.loseContact('frankie-ledger-trail', g.time)).toBe(false);
    const progress = parseMissionProgress(JSON.parse(JSON.stringify(g.save.story)));
    expect(new MissionDirector(g.missions.catalogue, progress).available({deliveries:1,jobType:'fare',model:'car',kind:'taxi',time:progress.campaignSeconds})).not.toContain('frankie-ledger-trail');
    g.resetRun(); expect(g.missionOffers.has('frankie-ledger-trail')).toBe(false);
  });

  it('prefers the routed offer when two authored pickups share a stop', () => {
    const doc = structuredClone(catalogue);
    doc.missions['frankie-ledger-trail'].stops.pickup = 'garden-cafe';
    const g = new Game(defaultCompiledMap, false, 'legacy');
    g.missions = new MissionDirector(compileMissions(g.map, doc as unknown as MissionCatalogue), g.save.story);
    g.save.story.completed.push('mia-meridian-lead'); g.newJob();
    g.vehicles = [g.player]; g.trafficTarget = 0; g.settings.noPolice = true; g.start();
    g.routeMissionOffer('frankie-ledger-trail'); arrive(g, g.job.pickup);
    expect(g.job.missionId).toBe('frankie-ledger-trail');
    expect(g.save.story.choices['meridian-trail']).toBe('ledger');
  });

  it('bounds reconciliation to narrative checkpoints instead of every physics tick', () => {
    const g = ready(), sync = vi.spyOn(g, 'syncMissionOffers');
    step(g, 1);
    expect(sync.mock.calls.length).toBeLessThanOrEqual(2);
    expect(sync.mock.calls.length).toBeGreaterThan(0);
  });

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

  it('abandonment, save reload and a fresh shift preserve the chosen branch', () => {
    const g = ready(); arrive(g, g.missionOffers.get('mia-cafe-trail')!.pickup);
    g.setMode('wasted'); g.recover();
    expect(g.save.story.choices['meridian-trail']).toBe('cafe');
    expect(g.save.story.completed).not.toContain('mia-cafe-trail');
    const saved = parseMissionProgress(JSON.parse(JSON.stringify(g.save.story)));
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
