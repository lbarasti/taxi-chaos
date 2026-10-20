import { calendarLabel, dayMinute } from '../campaign/clock';
import { characters, type CharacterId } from '../narrative/characters';
import { vehicleDefinitions, type VehicleModel, type VehicleRole } from '../vehicles/vehicles';
import type { CompiledMissions, CompiledMission } from './compile';
import { MissionDirector, type DirectorContext } from './director';
import { defaultMissionProgress } from './progress';
import type { Condition, Effect } from './schema';

export type PreviewState = {
  character?: string; shift?: number; flags?: string[]; choices?: Record<string, string>;
  completed?: string[]; failed?: string[]; chapter?: number; deliveries?: number;
  careerDeliveries?: number; time?: number; jobType?: 'fare' | 'parcel';
  model?: VehicleModel; kind?: VehicleRole; availableOnly?: boolean;
};
export type PreviewCheck = { label: string; passed: boolean; children?: PreviewCheck[] };
export type PreviewMessage = {
  id: string; trigger: 'offer' | 'pickup' | 'parcel-pickup'; character: CharacterId;
  channel: 'text' | 'passenger' | 'sender'; text: string; selected: boolean;
};
export type PreviewJob = {
  id: string; title: string; category: string; chapter: number;
  route: { pickup: string; dropoff: string }; status: 'available' | 'locked' | 'completed' | 'missed';
  checks: PreviewCheck[]; messages: PreviewMessage[];
  pickupEffects: string[]; completionEffects: string[]; contactLostEffects: string[];
};

const involved = (mission: CompiledMission) => new Set([
  mission.offer?.character, mission.beats.pickup.message.speaker, mission.beats.pickupSender?.message.speaker,
].filter((id): id is CharacterId => !!id));

/** Discover valid inputs from the compiled catalogue, including flags produced by outcomes. */
export function previewInputs(catalogue: CompiledMissions) {
  const flags = new Set<string>(), cast = new Set<CharacterId>();
  const choices: Record<string, string[]> = {};
  const visit = (condition: Condition): void => {
    if ('all' in condition) condition.all.forEach(visit);
    else if ('any' in condition) condition.any.forEach(visit);
    else if ('not' in condition) visit(condition.not);
    else if ('flag' in condition) flags.add(condition.flag);
  };
  const effects = (items: readonly Effect[]) => items.forEach(effect => {
    if ('setFlag' in effect) flags.add(effect.setFlag);
    if ('clearFlag' in effect) flags.add(effect.clearFlag);
  });
  for (const id of catalogue.order) {
    const mission = catalogue.missions[id];
    involved(mission).forEach(character => cast.add(character));
    visit(mission.requires); effects(mission.effects); effects(mission.contactLost.effects);
    for (const group of mission.choices) {
      choices[group.id] = group.options.map(option => option.id);
      for (const option of group.options) { if (option.requires) visit(option.requires); effects(option.effects); }
    }
  }
  return {
    characters: [...cast].map(id => ({ id, name: characters[id].name,
      jobs: catalogue.order.filter(key => involved(catalogue.missions[key]).has(id)).length })),
    flags: [...flags].sort(), choices, missions: [...catalogue.order],
  };
}

function conditionLabel(condition: Condition): string {
  if ('all' in condition) return condition.all.length ? 'All of these prerequisites' : 'No story prerequisites';
  if ('any' in condition) return 'At least one of these prerequisites';
  if ('not' in condition) return `NOT (${conditionLabel(condition.not)})`;
  if ('flag' in condition) return `Flag set: ${condition.flag}`;
  if ('missionCompleted' in condition) return `Completed job: ${condition.missionCompleted}`;
  if ('choiceEquals' in condition) return `Choice: ${condition.choiceEquals.group} = ${condition.choiceEquals.choice}`;
  if ('choiceUnset' in condition) return `Choice not yet committed: ${condition.choiceUnset}`;
  if ('minuteAtLeast' in condition) return `Pickup from ${calendarLabel(condition.minuteAtLeast)}`;
  if ('minuteBefore' in condition) return `Pickup before ${calendarLabel(condition.minuteBefore)}`;
  if ('shiftAtLeast' in condition) return `Shift >= ${condition.shiftAtLeast}`;
  if ('shiftAtMost' in condition) return `Shift <= ${condition.shiftAtMost}`;
  if ('minDeliveries' in condition) return `Campaign deliveries >= ${condition.minDeliveries}`;
  if ('minCareerDeliveries' in condition) return `Career deliveries >= ${condition.minCareerDeliveries}`;
  if ('chapter' in condition) return `Chapter >= ${condition.chapter}`;
  return JSON.stringify(condition);
}

function checkCondition(condition: Condition, director: MissionDirector, context: DirectorContext): PreviewCheck {
  const children = 'all' in condition ? condition.all : 'any' in condition ? condition.any : 'not' in condition ? [condition.not] : [];
  return { label: conditionLabel(condition), passed: director.evaluate(condition, context),
    ...(children.length ? { children: children.map(child => checkCondition(child, director, context)) } : {}) };
}

function describeEffect(effect: Effect): string {
  if ('setFlag' in effect) return `Set flag: ${effect.setFlag}`;
  if ('clearFlag' in effect) return `Clear flag: ${effect.clearFlag}`;
  if ('setChoice' in effect) return `Commit choice: ${effect.setChoice.group} = ${effect.setChoice.choice}`;
  if ('setChapter' in effect) return `Set chapter: ${effect.setChapter}`;
  if ('setWorld' in effect) return `World: ${effect.setWorld.key} = ${effect.setWorld.value}`;
  if ('acquireMaterial' in effect) return `Acquire record: ${effect.acquireMaterial}`;
  return `Relationship: ${effect.relationship.character} ${effect.relationship.delta >= 0 ? '+' : ''}${effect.relationship.delta}`;
}

/** Read-only snapshot. A fresh director evaluates gates; no Game, storage or simulation is created. */
export function generateDialoguePreview(catalogue: CompiledMissions, input: PreviewState = {}) {
  const options = previewInputs(catalogue);
  const character = input.character ?? (options.characters.some(item => item.id === 'bea') ? 'bea' : options.characters[0].id);
  if (character !== 'all' && !options.characters.some(item => item.id === character)) throw new Error(`Unknown character: ${character}. Use --list.`);
  const integer = (name: string, value: number, min: number, max = 1e9) => {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer in [${min}, ${max}]`);
    return value;
  };
  const shift = integer('shift', input.shift ?? 1, 1, 15);
  const chapter = integer('chapter', input.chapter ?? 1, 0, 1e6);
  const deliveries = integer('deliveries', input.deliveries ?? 0, 0);
  const careerDeliveries = integer('career-deliveries', input.careerDeliveries ?? deliveries, 0);
  const time = input.time ?? 0;
  if (!Number.isFinite(time) || time < 0) throw new Error('time must be a finite nonnegative number');
  const jobType = input.jobType ?? 'fare', model = input.model ?? (jobType === 'parcel' ? 'motorcycle' : 'car'), kind = input.kind ?? 'taxi';
  if (!['fare', 'parcel'].includes(jobType)) throw new Error(`Unknown job type: ${jobType}`);
  if (!Object.hasOwn(vehicleDefinitions, model)) throw new Error(`Unknown vehicle model: ${model}`);
  if (!['taxi', 'traffic', 'police'].includes(kind)) throw new Error(`Unknown vehicle kind: ${kind}`);
  const validateIds = (label: string, values: string[] | undefined, known: string[]) => {
    for (const value of values ?? []) if (!known.includes(value)) throw new Error(`Unknown ${label}: ${value}. Use --list.`);
    return [...new Set(values ?? [])];
  };
  const progress = defaultMissionProgress();
  progress.chapter = chapter; progress.deliveries = deliveries; progress.campaignSeconds = time;
  progress.flags = validateIds('flag', input.flags, options.flags);
  progress.completed = validateIds('completed job', input.completed, options.missions);
  progress.failed = validateIds('failed job', input.failed, options.missions);
  if (progress.completed.some(id => progress.failed.includes(id))) throw new Error('A job cannot be both completed and failed');
  for (const [group, choice] of Object.entries(input.choices ?? {})) {
    if (!options.choices[group]?.includes(choice)) throw new Error(`Unknown choice: ${group}=${choice}. Use --list.`);
    progress.choices[group] = choice;
  }
  const context: DirectorContext = { shift, minute: dayMinute(shift), deliveries, careerDeliveries, time, jobType, model, kind };
  const director = new MissionDirector(catalogue, progress);
  const jobs: PreviewJob[] = [];
  for (const id of catalogue.order) {
    const mission = catalogue.missions[id];
    if (character !== 'all' && !involved(mission).has(character as CharacterId)) continue;
    const status = director.status(id, context);
    if (status === 'active') throw new Error('Preview director must remain inactive');
    if (input.availableOnly && status !== 'available') continue;
    const checks: PreviewCheck[] = [checkCondition(mission.requires, director, context),
      { label: `Job type allowed: ${mission.allowed.jobs.join(', ')}`, passed: mission.allowed.jobs.includes(jobType) },
      { label: `Vehicle model allowed: ${mission.allowed.models?.join(', ') ?? 'any'}`, passed: !mission.allowed.models || mission.allowed.models.includes(model) },
      { label: `Vehicle kind allowed: ${mission.allowed.kinds?.join(', ') ?? 'any'}`, passed: !mission.allowed.kinds || mission.allowed.kinds.includes(kind) },
      { label: mission.repeat === 'once' ? 'One-time job not already completed' : 'Repeatable job', passed: mission.repeat !== 'once' || !progress.completed.includes(id) },
      { label: 'Job not failed / contact not lost for this booking', passed: !progress.failed.includes(id) },
    ];
    const pickupEffects: string[] = [], completionEffects = mission.effects.map(describeEffect);
    if (mission.pickupChoice) {
      const { group, choice } = mission.pickupChoice;
      const committed = progress.choices[group];
      checks.push({ label: `Pickup choice ${group} must be unset or ${choice} (simulated: ${committed ?? 'unset'})`, passed: committed === undefined || committed === choice });
      const option = Object.values(catalogue.missions).flatMap(m => m.choices).find(g => g.id === group)!.options.find(o => o.id === choice)!;
      if (option.requires) checks.push(checkCondition(option.requires, director, context));
      pickupEffects.push(`Commit choice: ${group} = ${choice}`, ...option.effects.map(describeEffect));
    }
    for (const group of mission.choices) if (group.id !== mission.pickupChoice?.group) {
      const target = group.commit === 'pickup' ? pickupEffects : completionEffects;
      target.push(`Choice group: ${group.id} (${group.options.map(o => o.id).join(' / ')})`);
    }
    const messages: PreviewMessage[] = [];
    const matches = (speaker: CharacterId) => character === 'all' || speaker === character;
    if (mission.offer && matches(mission.offer.character)) messages.push({ id: mission.offer.messageId, trigger: 'offer', character: mission.offer.character, channel: 'text', text: mission.offer.text, selected: true });
    for (const [trigger, beat] of [['pickup', mission.beats.pickup], ['parcel-pickup', mission.beats.pickupSender]] as const) {
      if (!beat || !matches(beat.message.speaker)) continue;
      if (trigger === 'parcel-pickup' && !mission.allowed.jobs.includes('parcel')) continue;
      messages.push({ id: beat.beatId, trigger, character: beat.message.speaker, channel: beat.message.channel, text: beat.message.text,
        selected: jobType === 'parcel' ? trigger === (mission.beats.pickupSender ? 'parcel-pickup' : 'pickup') : trigger === 'pickup' });
    }
    jobs.push({ id, title: mission.title, chapter: mission.chapter, category: mission.category, status,
      route: { pickup: catalogue.stops.byId[mission.stopIds.pickup].name, dropoff: catalogue.stops.byId[mission.stopIds.dropoff].name },
      checks, messages, pickupEffects, completionEffects, contactLostEffects: mission.contactLost.effects.map(describeEffect) });
  }
  return { character, name: character === 'all' ? 'All characters' : characters[character as CharacterId].name,
    context, state: progress, availableOnly: input.availableOnly ?? false, jobs };
}

export type DialoguePreview = ReturnType<typeof generateDialoguePreview>;

export function dialoguePreviewMarkdown(preview: DialoguePreview): string {
  const { context, state } = preview;
  const lines = [`# Dialogue preview: ${preview.name}`, '',
    `Simulated shift **${context.shift}** · ${context.jobType} · ${context.model} / ${context.kind} · chapter ${state.chapter}`,
    `Flags: ${state.flags.join(', ') || 'none'}`,
    `Choices: ${Object.entries(state.choices).map(([group, choice]) => `${group}=${choice}`).join(', ') || 'none'}`,
    `Completed: ${state.completed.join(', ') || 'none'} · Failed: ${state.failed.join(', ') || 'none'}`,
    `Deliveries: ${context.deliveries} campaign / ${context.careerDeliveries} career · elapsed: ${context.time}s`, '',
    'Read-only authored copy, in catalogue order. Eligibility is for a fresh dispatch offer; pickup lines play only after collection.',
    'Flags gate availability; they do not rewrite these lines. No preceding job is assumed unless listed as a prerequisite.', ''];
  const checkLines = (checks: PreviewCheck[], depth = 0): string[] => checks.flatMap(check => [
    `${'  '.repeat(depth)}- [${check.passed ? 'x' : ' '}] ${check.label}`, ...checkLines(check.children ?? [], depth + 1),
  ]);
  for (const job of preview.jobs) {
    lines.push(`## ${job.title} — ${job.status.toUpperCase()}`, `ID: \`${job.id}\` · ${job.category} · chapter ${job.chapter}`,
      `Route: ${job.route.pickup} → ${job.route.dropoff}`, '', '### Timing and prerequisites', ...checkLines(job.checks), '', '### Messages');
    if (!job.messages.some(message => message.trigger === 'offer')) lines.push('No advance text from this character.');
    for (const message of job.messages) {
      const label = message.trigger === 'offer' ? 'Offer text — before pickup' : message.trigger === 'parcel-pickup' ? 'Parcel pickup' : 'Pickup';
      lines.push('', `**${label} · ${characters[message.character].name} · ${message.channel}${message.selected ? ' · selected for simulated job type' : ' · alternate job type'}**`, `Beat: \`${message.id}\``);
      const duplicate = message.trigger === 'parcel-pickup' && job.messages.find(other => other.trigger === 'pickup' && other.text === message.text && other.character === message.character);
      lines.push(duplicate ? `Same wording as pickup; channel: ${message.channel}.` : `> ${message.text.replace(/\n/g, '\n> ')}`);
    }
    lines.push('', '### Outcomes (not prerequisites)',
      `- On pickup: ${job.pickupEffects.join('; ') || 'no authored state effects'}`,
      `- On completed delivery: ${job.completionEffects.join('; ') || 'no authored state effects'}`,
      `- On contact loss: ${job.contactLostEffects.join('; ') || 'no authored state effects'}`, '');
  }
  if (!preview.jobs.length) lines.push('No jobs match this selection.');
  return lines.join('\n') + '\n';
}
