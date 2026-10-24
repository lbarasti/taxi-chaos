import { characters, type CharacterId } from '../narrative/characters';
import type { NotebookEntry, NotebookRun } from '../narrative/player-records';
import type { CompiledStops } from '../missions/stops';
import type { CampaignDefinition } from './model';

export type NotebookGroup = { id: string; run?: NotebookRun; entries: NotebookEntry[] };

const characterFor = (name: string, definition: CampaignDefinition): CharacterId | undefined =>
  definition.everydayJobs.find(job => job.name === name)?.character
  ?? Object.entries(characters).find(([, character]) => character.name === name)?.[0] as CharacterId | undefined;

/** Read old signed slips without rewriting the player's original records. */
function receiptRun(entry: NotebookEntry, definition: CampaignDefinition): NotebookRun | undefined {
  if (entry.run) return entry.run;
  if (!/^fare-\d+$/.test(entry.id) || entry.kind !== 'receipt') return;
  const title = /^(.*?) · signed (delivery|fare) receipt$/.exec(entry.title);
  const destination = /\. Pickup \([^)]*\) → (.*?)\. Base \$/.exec(entry.text)?.[1];
  const paid = /\bPaid \$(\d+(?:\.\d+)?)/.exec(entry.text)?.[1];
  if (!title || !destination || paid === undefined) return;
  return { id: `legacy-${entry.id}`, customer: title[1], character: characterFor(title[1], definition),
    type: title[2] === 'delivery' ? 'parcel' : 'fare', destination, totalFare: Number(paid), minute: entry.minute ?? (entry.shift - 1) * 1440 + 420 };
}

/** Group by booking identity, never by a recurring customer's name or the day. */
export function notebookGroups(entries: readonly NotebookEntry[], definition: CampaignDefinition, stops: CompiledStops): NotebookGroup[] {
  const visible = entries.filter(entry => !/^ordinary-\d+-dispatch$/.test(entry.id)
    && !(entry.source === definition.dispatcher && /^New (?:delivery|fare) · .*Pickup marked; destination /.test(entry.text)));
  const receipts = visible.flatMap(entry => {
    const run = receiptRun(entry, definition);
    return run && /^fare-\d+$/.test(entry.id) ? [{ entry, run }] : [];
  });
  const missions = Object.entries(definition.missions.missions).sort(([a], [b]) => b.length - a.length);
  const inferRun = (entry: NotebookEntry): NotebookRun | undefined => {
    if (entry.run) return entry.run;
    const receipt = receipts.find(receipt => receipt.entry.id === entry.id);
    if (receipt) return receipt.run;
    const ordinary = /^(?:ride-)?ordinary-(\d+)-(?:pickup|during|arrival)$/.exec(entry.id);
    if (ordinary) {
      const completed = receipts.find(receipt => receipt.entry.id === `fare-${ordinary[1]}`);
      if (completed) return completed.run;
      const character = Object.hasOwn(characters, entry.source ?? '') ? entry.source as CharacterId : undefined;
      return { id: `legacy-fare-${ordinary[1]}`, customer: character ? characters[character].name : entry.title.split(' · ')[0], character,
        type: 'fare', destination: '', minute: entry.minute ?? (entry.shift - 1) * 1440 + 420 };
    }
    const mission = missions.find(([id, mission]) => entry.id.startsWith(`ride-${id}-`)
      || mission.effects?.some(effect => 'acquireMaterial' in effect && effect.acquireMaterial === entry.id));
    if (!mission) return;
    const [id, spec] = mission, character = spec.passenger as CharacterId | undefined;
    const customer = definition.jobNames[id] ?? (character ? characters[character].name : undefined);
    if (!customer) return;
    const destination = stops.byId[spec.stops.dropoff]?.name ?? '';
    const completed = receipts.filter(receipt => receipt.run.customer === customer && receipt.run.destination === destination)
      .sort((a, b) => Math.abs(a.entry.at - entry.at) - Math.abs(b.entry.at - entry.at))[0];
    return completed?.run ?? { id: `legacy-${id}`, customer, character, destination, type: 'fare', minute: entry.minute ?? (entry.shift - 1) * 1440 + 420 };
  };
  const groups = new Map<string, NotebookGroup>();
  for (const entry of [...visible].reverse()) {
    const run = inferRun(entry), id = run?.id ?? entry.id;
    const group = groups.get(id) ?? { id, run, entries: [] };
    if (run?.totalFare !== undefined) group.run = run;
    group.entries.unshift(entry);
    groups.set(id, group);
  }
  return [...groups.values()];
}
