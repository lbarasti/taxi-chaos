import { campaignCondition } from '../missions/conditions';
import { campaignDays, editionTime } from './clock';
import type { Campaign, PrintedEdition } from './state';
import type { CampaignContext, CampaignDefinition, NewsArticle } from './model';

export const newspaperArticles = (definition: CampaignDefinition): readonly NewsArticle[] => definition.newspaper
  ? [...definition.newspaper.daily, ...Object.values(definition.newspaper.investigations)] : [];
export const editionArticle = (definition: CampaignDefinition, id: string) => newspaperArticles(definition).find(article => article.id === id);

/** Select coverage once, after every claim in this printing boundary has settled. */
export function printEdition(ctx: CampaignContext, day: number): boolean {
  const { state, definition } = ctx, press = definition.newspaper;
  if (!press || state.editions.some(edition => edition.day === day)) return false;
  const daily = press.daily[day - 1], at = editionTime(day, definition.timing);
  if (!daily || at > definition.timing.lastEdition || at > state.minute) return false;
  const investigations = state.publications.filter(publication => publication.at === at)
    .map(publication => press.investigations[publication.allegation]).filter((article): article is NewsArticle => !!article);
  const articles = [...investigations.reverse(), daily].map(article => article.id);
  state.editions.push({ day, at, articles, briefs: press.briefs.filter(brief => campaignCondition(brief.requires, state, ctx)).map(brief => brief.id), read: false });
  return true;
}

/** Old saves gain a historical archive; current saves retain the choices made at print. */
export function restoreEditions(state: Campaign, raw: unknown, definition: CampaignDefinition): void {
  state.editions = [];
  const press = definition.newspaper;
  if (!press) return;
  const saved = Array.isArray(raw) ? raw : [];
  const articleIds = new Set(newspaperArticles(definition).map(article => article.id));
  const briefIds = new Set(press.briefs.map(brief => brief.id));
  for (let day = 1; day <= campaignDays(definition.timing); day++) {
    const at = editionTime(day, definition.timing);
    if (at > state.minute || at > definition.timing.lastEdition) break;
    const entry = saved.find((value: unknown) => value && typeof value === 'object' && (value as PrintedEdition).day === day) as PrintedEdition | undefined;
    const published = state.publications.filter(publication => publication.at === at).map(publication => press.investigations[publication.allegation]?.id);
    const allowed = new Set([press.daily[day - 1]?.id, ...published]);
    if (entry?.at === at && Array.isArray(entry.articles) && entry.articles.length > 0 && entry.articles.length <= Object.keys(definition.claims).length + 1
      && new Set(entry.articles).size === entry.articles.length && entry.articles.every(id => articleIds.has(id) && allowed.has(id))
      && Array.isArray(entry.briefs) && entry.briefs.length <= press.briefs.length && entry.briefs.every(id => briefIds.has(id))) {
      state.editions.push({ day, at, articles: [...entry.articles], briefs: [...new Set(entry.briefs)], read: entry.read === true });
      continue;
    }
    // Rebuild only world facts that already existed at this edition's timestamp.
    const history: Campaign = { ...state, minute: at, editions: [], world: { ...definition.initialWorld }, publications: state.publications.filter(p => p.at <= at), reactions: Object.fromEntries(Object.entries(state.reactions).filter(([, r]) => r && r.at <= at)), occurrences: Object.fromEntries(Object.entries(state.occurrences).filter(([, o]) => o.at <= at)) };
    const effects = [
      ...definition.operations.filter(op => op.at <= at).map(op => ({ at: op.at, effects: [...op.effects, ...(op.outcomes?.find(outcome => outcome.id === state.occurrences[op.id]?.outcome)?.effects ?? [])] })),
      ...Object.entries(history.reactions).map(([id, reaction]) => ({ at: reaction!.at, effects: definition.claims[id].reactionEffects })),
    ].sort((a, b) => a.at - b.at);
    for (const event of effects) for (const effect of event.effects) if ('setWorld' in effect) history.world[effect.setWorld.key] = effect.setWorld.value;
    printEdition({ state: history, definition }, day);
    state.editions.push(...history.editions);
  }
}
