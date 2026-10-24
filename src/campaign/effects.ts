import { MAX_NOTEBOOK_ENTRIES, type NotebookEntry } from '../narrative/player-records';
import type { MissionProgress } from '../missions/progress';
import type { Effect } from '../missions/schema';
import type { CampaignContext } from './model';

/** Material records survive ordinary history rollover; acquiring a record is idempotent. */
export function recordNote(ctx: CampaignContext, entry: Omit<NotebookEntry, 'shift' | 'at'>): boolean {
  if (!ctx.records) throw new Error('Campaign knowledge effects require player records');
  const notebook = ctx.records.notebook;
  if (notebook.some(e => e.id === entry.id)) return false;
  if (notebook.length >= MAX_NOTEBOOK_ENTRIES) {
    let oldest = notebook.findIndex(e => !Object.hasOwn(ctx.definition.materials, e.id) && (e.id.startsWith('fare-') || e.id.startsWith('ride-ordinary-')));
    if (oldest < 0) oldest = notebook.findIndex(e => !Object.hasOwn(ctx.definition.materials, e.id));
    if (oldest < 0) return false;
    notebook.splice(oldest, 1);
  }
  notebook.push({ ...entry, ...(entry.run ? { run: { ...entry.run } } : {}), shift: ctx.state.shift, at: ctx.progress?.campaignSeconds ?? 0, minute: ctx.state.minute, source: entry.source ?? 'driver-record' });
  return true;
}

/** Called only on detached transaction drafts, for missions and all campaign events. */
export function applyEffectsTo(progress: MissionProgress | undefined, effects: readonly Effect[], ctx?: CampaignContext): void {
  for (const effect of effects) {
    if ('setWorld' in effect) {
      if (!ctx || !Object.hasOwn(ctx.definition.initialWorld, effect.setWorld.key)) throw new Error(`Unknown world key ${effect.setWorld.key}`);
      if (typeof ctx.definition.initialWorld[effect.setWorld.key] !== typeof effect.setWorld.value) throw new Error(`Wrong world value type for ${effect.setWorld.key}`);
      ctx.state.world[effect.setWorld.key] = effect.setWorld.value;
    } else if ('acquireMaterial' in effect) {
      const material = ctx?.definition.materials[effect.acquireMaterial];
      if (!ctx || !material) throw new Error(`Unknown material ${effect.acquireMaterial}`);
      recordNote(ctx, { id: effect.acquireMaterial, ...material, ...(ctx.notebookRun ? { run: ctx.notebookRun } : {}) });
    } else {
      if (!progress) throw new Error('Story effects require mission progress');
      if ('setFlag' in effect) { if (!progress.flags.includes(effect.setFlag)) progress.flags.push(effect.setFlag); }
      else if ('clearFlag' in effect) progress.flags = progress.flags.filter(id => id !== effect.clearFlag);
      else if ('setChapter' in effect) progress.chapter = Math.max(progress.chapter, effect.setChapter);
      else if ('setChoice' in effect) {
        const { group, choice } = effect.setChoice, existing = progress.choices[group];
        if (existing !== undefined && existing !== choice) throw new Error(`Conflicting setChoice for ${group}: ${existing} vs ${choice}`);
        progress.choices[group] = choice;
      } else if ('relationship' in effect) progress.relationships[effect.relationship.character] = Math.max(-1000, Math.min(1000, (progress.relationships[effect.relationship.character] ?? 0) + effect.relationship.delta));
    }
  }
}

export function campaignTransaction<T>(ctx: CampaignContext, build: (draft: CampaignContext) => T): T {
  const draft: CampaignContext = { ...ctx, state: structuredClone(ctx.state), progress: ctx.progress && structuredClone(ctx.progress), records: ctx.records && structuredClone(ctx.records) };
  const result = build(draft);
  Object.assign(ctx.state, draft.state);
  if (ctx.progress && draft.progress) Object.assign(ctx.progress, draft.progress);
  if (ctx.records && draft.records) Object.assign(ctx.records, draft.records);
  return result;
}
