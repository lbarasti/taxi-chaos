import { corroboration, materials, type Allegation } from './content';

export type Publication = { allegation: Allegation; submittedShift: number; publishedShift: number };
export type Campaign = { version: 1; shift: number; finished: boolean; submitted: string[]; publications: Publication[]; regularRides: Record<string, number> };
export const defaultCampaign = (): Campaign => ({ version: 1, shift: 1, finished: false, submitted: [], publications: [], regularRides: {} });
export function migrateCampaign(raw: unknown): Campaign {
  const state = defaultCampaign();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state;
  const s = raw as Partial<Campaign>;
  if (s.version !== 1) return state;
  if (typeof s.shift === 'number' && Number.isInteger(s.shift)) state.shift = Math.max(1, Math.min(14, s.shift));
  state.finished = state.shift === 14 && s.finished === true;
  if (Array.isArray(s.submitted)) state.submitted = [...new Set(s.submitted.filter((id): id is string => typeof id === 'string' && Object.hasOwn(materials, id)))];
  if (Array.isArray(s.publications)) for (const p of s.publications.slice(0, 3)) {
    if (!p || !Object.hasOwn(corroboration, p.allegation) || state.publications.some(old => old.allegation === p.allegation)) continue;
    if (!Number.isInteger(p.submittedShift) || !Number.isInteger(p.publishedShift) || p.submittedShift < 1 || p.publishedShift !== p.submittedShift + 1 || p.publishedShift > state.shift) continue;
    if (!corroboration[p.allegation].some(route => route.every(id => state.submitted.includes(id)))) continue;
    state.publications.push({ allegation: p.allegation, submittedShift: p.submittedShift, publishedShift: p.publishedShift });
  }
  if (s.regularRides && typeof s.regularRides === 'object' && !Array.isArray(s.regularRides)) for (const [name, count] of Object.entries(s.regularRides).slice(0, 16)) {
    if (/^[A-Za-z]{1,20}$/.test(name) && Number.isInteger(count) && count >= 0) state.regularRides[name] = Math.min(1e6, count);
  }
  if (!['coordination', 'policing'].every(link => state.publications.some(p => p.allegation === link))) state.publications = state.publications.filter(p => p.allegation !== 'knowledge');
  return state;
}

/** Review waits until the next shift; receipt alone is neither verification nor publication. */
export function advanceCampaign(state: Campaign): boolean {
  if (state.finished) return false;
  if (state.shift === 14) { state.finished = true; return true; }
  const submittedShift = state.shift;
  state.shift++;
  for (const allegation of Object.keys(corroboration) as Allegation[]) {
    if (state.publications.some(p => p.allegation === allegation)) continue;
    if (allegation === 'knowledge' && !['coordination', 'policing'].every(link => state.publications.some(p => p.allegation === link))) continue;
    if (corroboration[allegation].some(route => route.every(id => state.submitted.includes(id)))) state.publications.push({ allegation, submittedShift, publishedShift: state.shift });
  }
  return true;
}
