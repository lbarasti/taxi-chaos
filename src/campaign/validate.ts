import { assertCondition, assertEffects, assertMissionCatalogue, type Condition, type Effect } from '../missions/schema';
import { isCharacterId } from '../narrative/characters';
import { vehicleDefinitions } from '../vehicles/vehicles';
import { CAMPAIGN_START, campaignDays, editionTime } from './clock';
import type { CampaignDefinition } from './model';

const id = (value: string) => { if (!/^[a-z][a-z0-9-]{0,79}$/.test(value)) throw new Error(`Invalid campaign id: ${value}`); };
function walk(c: Condition, visit: (c: Condition) => void): void {
  visit(c);
  if ('all' in c) c.all.forEach(child => walk(child, visit));
  if ('any' in c) c.any.forEach(child => walk(child, visit));
  if ('not' in c) walk(c.not, visit);
}

/** Time predicates must be checked at their own boundary during large skips. */
export function conditionTimes(c: Condition | undefined, start = CAMPAIGN_START): number[] {
  const times: number[] = [];
  if (c) walk(c, node => {
    if ('minuteAtLeast' in node) times.push(node.minuteAtLeast);
    if ('minuteBefore' in node) times.push(node.minuteBefore);
    if ('shiftAtLeast' in node) times.push(Math.max(start, start + (node.shiftAtLeast - 1) * 1440));
    if ('shiftAtMost' in node) times.push(start + node.shiftAtMost * 1440);
  });
  return times;
}

/** Stable dependency order is derived from authored claim predicates. */
export function claimOrder(def: CampaignDefinition): string[] {
  const done = new Set<string>(), visiting = new Set<string>(), result: string[] = [];
  const visit = (id: string) => {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error(`Claim dependency cycle: ${id}`);
    const claim = def.claims[id]; if (!claim) throw new Error(`Unknown claim: ${id}`);
    visiting.add(id);
    for (const c of [claim.verifyRequires, claim.approveRequires, claim.publishRequires]) if (c) walk(c, node => {
      const ref = 'caseState' in node ? node.caseState.id : 'published' in node ? node.published : 'reacted' in node ? node.reacted : null;
      if (ref) visit(ref);
    });
    visiting.delete(id); done.add(id); result.push(id);
  };
  Object.keys(def.claims).forEach(visit); return result;
}

/** Validate workload, shapes and cross-domain references before dispatch. */
export function assertCampaignDefinition(def: CampaignDefinition): void {
  const t = def.timing;
  if (!t || ![t.start, t.end, t.lastEdition, t.editionHour].every(Number.isInteger) || t.start < 0 || t.end <= t.start || campaignDays(t) > 366 || t.lastEdition < t.start || t.lastEdition >= t.end || t.editionHour < 0 || t.editionHour > 23) throw new Error('Invalid campaign timing');
  id(def.id); assertMissionCatalogue(def.missions);
  for (const job of def.everydayJobs) if (!isCharacterId(job.character)) throw new Error(`Unknown everyday character: ${job.character}`);
  for (const [name, items, max] of [
    ['world', Object.keys(def.initialWorld), 128], ['materials', Object.keys(def.materials), 100], ['claims', Object.keys(def.claims), 100],
    ['operations', def.operations, 256], ['handlers', def.handlers, 256], ['scenes', def.scenes, 256],
  ] as const) if (items.length > max) throw new Error(`Too many campaign ${name}`);
  const ref = (collection: object, key: string, kind: string) => { if (!Object.hasOwn(collection, key)) throw new Error(`Unknown ${kind}: ${key}`); };
  const groups = Object.fromEntries(Object.values(def.missions.missions).flatMap(m => (m.choices ?? []).map(g => [g.id, g.options.map(o => o.id)])));
  const choice = (group: string, option?: string) => { ref(groups, group, 'choice group'); if (option && !groups[group].includes(option)) throw new Error(`Unknown choice option: ${option}`); };
  const value = (key: string, v: unknown) => {
    ref(def.initialWorld, key, 'world key');
    if (!['string', 'number', 'boolean'].includes(typeof v) || typeof v !== typeof def.initialWorld[key] || typeof v === 'number' && !Number.isFinite(v)) throw new Error(`Invalid world value: ${key}`);
  };
  const condition = (c: Condition | undefined) => {
    if (!c) return;
    assertCondition(c, 'campaign.condition');
    walk(c, node => {
      if ('choiceEquals' in node) choice(node.choiceEquals.group, node.choiceEquals.choice);
      if ('choiceUnset' in node) choice(node.choiceUnset);
      if ('relationshipAtLeast' in node && !isCharacterId(node.relationshipAtLeast.character)) throw new Error(`Unknown character: ${node.relationshipAtLeast.character}`);
      if ('worldEquals' in node) value(node.worldEquals.key, node.worldEquals.value);
      if ('worldAtLeast' in node) value(node.worldAtLeast.key, node.worldAtLeast.value);
      if ('knows' in node) ref(def.materials, node.knows, 'material');
      if ('materialState' in node) ref(def.materials, node.materialState.id, 'material');
      if ('caseState' in node) ref(def.claims, node.caseState.id, 'claim');
      if ('published' in node) ref(def.claims, node.published, 'claim');
      if ('reacted' in node) ref(def.claims, node.reacted, 'claim');
      if ('missionCompleted' in node) ref(def.missions.missions, node.missionCompleted, 'mission');
      if ('occurred' in node && !def.operations.some(op => op.id === node.occurred)) throw new Error(`Unknown operation: ${node.occurred}`);
    });
  };
  const effects = (items: readonly Effect[]) => {
    assertEffects(items, 'campaign.effects');
    for (const e of items) {
      if ('setChoice' in e) choice(e.setChoice.group, e.setChoice.choice);
      if ('relationship' in e && !isCharacterId(e.relationship.character)) throw new Error(`Unknown character: ${e.relationship.character}`);
      if ('setWorld' in e) value(e.setWorld.key, e.setWorld.value);
      if ('acquireMaterial' in e) ref(def.materials, e.acquireMaterial, 'material');
    }
  };
  for (const [key, initial] of Object.entries(def.initialWorld)) { id(key); value(key, initial); }
  const ids = new Set<string>();
  for (const op of def.operations) {
    if (ids.has(op.id)) throw new Error(`Duplicate operation: ${op.id}`); id(op.id); ids.add(op.id);
    if (!Number.isInteger(op.at) || op.at < t.start || op.at >= t.end) throw new Error(`Invalid operation time: ${op.id}`);
    effects(op.effects);
    if (op.outcomes) {
      if (!op.outcomes.length || op.outcomes.length > 16 || op.outcomes.at(-1)!.requires || op.outcomes.slice(0, -1).some(o => !o.requires)) throw new Error(`Operation needs a final fallback outcome: ${op.id}`);
      const outcomes = new Set<string>();
      for (const o of op.outcomes) { id(o.id); if (outcomes.has(o.id)) throw new Error(`Duplicate outcome: ${o.id}`); outcomes.add(o.id); condition(o.requires); effects(o.effects); }
    }
  }
  for (const [key, claim] of Object.entries(def.claims)) {
    id(key);
    if (!claim.routes.length || claim.routes.length > 16 || claim.routes.some(route => !route.length || route.length > 16)) throw new Error(`Invalid corroboration routes: ${key}`);
    claim.routes.flat().forEach(material => ref(def.materials, material, 'material'));
    condition(claim.verifyRequires); condition(claim.approveRequires); condition(claim.publishRequires); effects(claim.reactionEffects);
  }
  const eventTypes = ['clock', 'accepted', 'pickup', 'completed', 'abandoned', 'choice', 'missed', 'observation', 'material-submitted', 'publication-requested', 'operation', 'material-verified', 'case-verified', 'edition', 'reaction', 'ride-completed'];
  for (const h of def.handlers) {
    if (!eventTypes.includes(h.on)) throw new Error(`Unknown domain event: ${h.on}`);
    if (h.id) {
      id(h.id);
      if (['accepted', 'pickup', 'completed', 'abandoned', 'missed', 'ride-completed'].includes(h.on)) ref(def.missions.missions, h.id, 'mission');
      if (['case-verified', 'publication-requested', 'edition', 'reaction'].includes(h.on)) ref(def.claims, h.id, 'claim');
      if (['material-submitted', 'material-verified', 'observation'].includes(h.on)) ref(def.materials, h.id, 'material');
      if (h.on === 'choice') choice(h.id);
      if (h.on === 'operation' && !ids.has(h.id)) throw new Error(`Unknown operation: ${h.id}`);
    }
    condition(h.requires); effects(h.effects);
  }
  for (const [id, m] of Object.entries(def.missions.missions)) {
    const window = def.jobWindows[id];
    if (!window || !Number.isInteger(window.from) || !Number.isInteger(window.until) || window.from < t.start || window.until > t.end || window.from >= window.until) throw new Error(`Invalid campaign job window: ${id}`);
    condition(m.requires); effects(m.effects ?? []); effects(m.contactLost?.effects ?? []);
    for (const g of m.choices ?? []) for (const o of g.options) { condition(o.requires); effects(o.effects ?? []); }
  }
  for (const o of def.observations) { if (!Number.isFinite(o.radius) || o.radius <= 0 || o.radius > 100) throw new Error('Invalid observation radius'); ref(def.materials, o.id, 'observation material'); condition(o.requires); }
  for (const v of def.vehicles) { id(v.id); ref(vehicleDefinitions, v.model, 'vehicle model'); if (!v.offsets.length || v.offsets.length > 16 || v.offsets.some(o => !Number.isFinite(o.x) || !Number.isFinite(o.y)) || !Number.isFinite(v.angle)) throw new Error('Invalid campaign vehicle placement'); condition(v.present); }
  for (const s of def.scenes) {
    if (!!s.site === !!s.vehicle || s.site && !Object.hasOwn(def.sites, s.site) || s.vehicle && !def.vehicles.some(v => v.id === s.vehicle) || s.shapes.length > 100) throw new Error('Invalid campaign scene');
    for (const shape of s.shapes) {
      if ('rect' in shape) { const [x, y, w, h, color] = shape.rect; if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0 || typeof color !== 'string') throw new Error('Invalid scene rectangle'); }
      else { const [text, x, y, size, color] = shape.label; if (typeof text !== 'string' || ![x, y, size].every(Number.isFinite) || size <= 0 || typeof color !== 'string') throw new Error('Invalid scene label'); }
    }
    condition(s.requires);
  }
  for (const t of [...def.bulletins, ...def.ordinaryResponses]) condition(t.requires);
  if (def.newspaper) {
    const press = def.newspaper, articles = [...press.daily, ...Object.values(press.investigations)];
    if (press.daily.length !== campaignDays(t) || editionTime(press.daily.length, t) > t.lastEdition) throw new Error('Every campaign day needs a newspaper edition');
    if (new Set(articles.map(a => a.id)).size !== articles.length || new Set(articles.flatMap(a => a.image ? [a.image] : [])).size !== articles.filter(a => a.image).length) throw new Error('Newspaper articles need distinct IDs and pictures');
    for (const a of articles) { id(a.id); if (![a.title, a.deck, a.imageAlt, a.caption, a.section, ...a.body].every(v => typeof v === 'string' && v.length > 0) || !a.body.length || a.body.length > 8) throw new Error('Incomplete newspaper article'); }
    for (const key of Object.keys(press.investigations)) ref(def.claims, key, 'newspaper claim');
    // Only direct timed operation/reaction writes can be reconstructed from the ledger.
    const unrecordedWrites = new Set([
      ...def.handlers.flatMap(handler => handler.effects),
      ...Object.values(def.missions.missions).flatMap(mission => [...(mission.effects ?? []), ...(mission.contactLost?.effects ?? []),
        ...(mission.choices ?? []).flatMap(group => group.options.flatMap(option => option.effects ?? []))]),
    ].flatMap(effect => 'setWorld' in effect ? [effect.setWorld.key] : []));
    for (const b of press.briefs) {
      id(b.id); condition(b.requires);
      if (b.requires) walk(b.requires, node => {
        if (!['all', 'any', 'not', 'minuteAtLeast', 'minuteBefore', 'shiftAtLeast', 'shiftAtMost', 'worldEquals', 'worldAtLeast', 'occurred', 'published', 'reacted'].some(key => Object.hasOwn(node, key))) throw new Error(`Brief requires a reconstructible historical predicate: ${b.id}`);
        const key = 'worldEquals' in node ? node.worldEquals.key : 'worldAtLeast' in node ? node.worldAtLeast.key : undefined;
        if (key && unrecordedWrites.has(key)) throw new Error(`Brief depends on unrecorded world changes: ${b.id} / ${key}`);
      });
    }
  }
  for (const milestone of def.milestones ?? []) condition(milestone.requires);
  claimOrder(def);
}
