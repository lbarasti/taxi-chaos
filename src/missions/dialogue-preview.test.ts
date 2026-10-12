import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultCompiledMap } from '../map/compile';
import { missionsFor, openShoreMissions, type CompiledMissions } from './compile';
import { dialoguePreviewMarkdown, generateDialoguePreview, previewInputs } from './dialogue-preview';
import { dialoguePreviewScene } from './dialogue-preview-scene';

const campaign = openShoreMissions(defaultCompiledMap);
const find = (shift: number, id: string) => generateDialoguePreview(campaign, { shift }).jobs.find(job => job.id === id)!;
afterEach(() => vi.unstubAllGlobals());

describe('dialogue preview simulation', () => {
  it('lines up all Bea copy while evaluating exact shift boundaries without inventing previous jobs', () => {
    expect(generateDialoguePreview(campaign).jobs.map(job => job.id)).toEqual(['bea-first-shift', 'nico-safe-ride', 'bea-radio-repair', 'bea-vote']);
    expect([2, 3, 8, 9].map(shift => find(shift, 'nico-safe-ride').status)).toEqual(['locked', 'available', 'available', 'locked']);
    expect([7, 8, 13, 14].map(shift => find(shift, 'bea-radio-repair').status)).toEqual(['locked', 'available', 'available', 'locked']);
    expect(find(14, 'bea-vote').status).toBe('available');
    expect(find(15, 'bea-vote').status).toBe('locked');
    expect(find(8, 'nico-safe-ride').messages.map(message => message.trigger)).toEqual(['offer', 'pickup']);
    expect(find(1, 'bea-first-shift').messages.map(message => message.trigger)).toEqual(['pickup', 'parcel-pickup']);
  });

  it('distinguishes prerequisites from outcomes, competing choices and prior completion', () => {
    const blocked = generateDialoguePreview(campaign, { shift: 8, flags: ['contact-bea-lost'], choices: { 'nico-trip': 'roster' } });
    expect(blocked.jobs.every(job => job.status === 'locked')).toBe(true);
    const nico = blocked.jobs.find(job => job.id === 'nico-safe-ride')!;
    expect(nico.checks.find(check => check.label.startsWith('Pickup choice'))?.passed).toBe(false);
    expect(nico.completionEffects).toEqual(['Set flag: nico-safe']);
    expect(nico.pickupEffects).toEqual(['Commit choice: nico-trip = room']);
    const delivered = generateDialoguePreview(campaign, { shift: 8, completed: ['bea-radio-repair'] });
    expect(delivered.jobs.find(job => job.id === 'bea-radio-repair')?.status).toBe('completed');
    expect(generateDialoguePreview(campaign, { shift: 8, flags: ['bea-office-ready'], availableOnly: true }).jobs.map(job => job.id))
      .toEqual(['nico-safe-ride', 'bea-radio-repair']); // Outcome flag alone is not a completion gate.
  });

  it('supports the legacy cast, completion prerequisites, and sender variants', () => {
    const legacy = missionsFor(defaultCompiledMap);
    expect(generateDialoguePreview(legacy).character).toBe('mia');
    const frankie = generateDialoguePreview(legacy, { character: 'frankie', completed: ['mia-meridian-lead'] });
    expect(frankie.jobs.map(job => job.status)).toEqual(['available', 'available']);
    expect(frankie.jobs[1].messages.find(message => message.trigger === 'pickup')?.channel).toBe('sender');
    expect(previewInputs(legacy).choices['meridian-trail']).toEqual(['cafe', 'ledger']);
  });

  it('preserves nested OR and negation semantics through the authoritative director', () => {
    const custom: CompiledMissions = { ...campaign, missions: { ...campaign.missions,
      'bea-radio-repair': { ...campaign.missions['bea-radio-repair'], requires: {
        any: [{ flag: 'test-flag' }, { not: { shiftAtMost: 7 } }],
      } },
    } };
    const available = generateDialoguePreview(custom, { shift: 8 }).jobs.find(job => job.id === 'bea-radio-repair')!;
    expect(available.status).toBe('available');
    expect(available.checks[0].children?.map(check => check.passed)).toEqual([false, true]);
    expect(generateDialoguePreview(custom, { shift: 7 }).jobs.find(job => job.id === 'bea-radio-repair')?.status).toBe('locked');
  });

  it('rejects invalid simulated inputs and returns detached state', () => {
    for (const input of [{ shift: 16 }, { shift: NaN }, { flags: ['typo'] }, { character: 'typo' },
      { choices: { 'nico-trip': 'typo' } }, { completed: ['typo'] }, { time: -1 },
      { completed: ['bea-vote'], failed: ['bea-vote'] }]) expect(() => generateDialoguePreview(campaign, input)).toThrow();
    const input = { flags: ['bea-office-ready'], choices: { 'nico-trip': 'room' }, completed: ['bea-first-shift'] };
    const before = structuredClone(input), preview = generateDialoguePreview(campaign, input);
    preview.state.flags.length = 0; preview.state.completed.length = 0; preview.state.choices['nico-trip'] = 'roster';
    expect(input).toEqual(before);
    expect(dialoguePreviewMarkdown(generateDialoguePreview(campaign, { shift: 8 }))).toContain('Outcomes (not prerequisites)');
  });
});

describe('actual-app screenshot fixture', () => {
  it('stages the actual pickup beat without reading or writing saves or committing its outcome', () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    const input = { shift: 8, careerDeliveries: 20, flags: ['bea-office-ready'], choices: { 'nico-trip': 'roster' } };
    const before = structuredClone(input);
    const scene = dialoguePreviewScene(input, 'nico-safe-ride', 'pickup');
    expect(scene.job.status).toBe('locked');
    expect(scene.game.dialogue.active?.message).toEqual(campaign.missions['nico-safe-ride'].beats.pickup.message);
    expect(scene.game.dialogue.complete).toBe(true);
    expect(scene.game.save.story.choices['nico-trip']).toBe('roster');
    expect(scene.game.save.story.flags).not.toContain('nico-safe');
    expect(scene.game.save.deliveries).toBe(20);
    scene.game.persist();
    expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled();
    expect(input).toEqual(before);
  });

  it('provides just the requested actual inbox receipt and isolates consecutive shots', () => {
    const first = dialoguePreviewScene({ shift: 8 }, 'bea-radio-repair', 'offer');
    expect(first.game.save.playerRecords.texts).toHaveLength(1);
    expect(first.game.save.playerRecords.texts[0].text).toBe(campaign.missions['bea-radio-repair'].offer?.text);
    const next = dialoguePreviewScene({ shift: 14 }, 'bea-vote', 'pickup');
    expect(next.game).not.toBe(first.game);
    expect(next.game.save.story.completed).toEqual([]);
    expect(first.game.save.campaign.shift).toBe(8);
    const parcel = dialoguePreviewScene({ shift: 1, jobType: 'parcel' }, 'bea-first-shift', 'pickup');
    expect(parcel.game.dialogue.active?.message.channel).toBe('sender');
    expect(parcel.game.player.model).toBe('motorcycle');
    expect(() => dialoguePreviewScene({ shift: 1 }, 'bea-first-shift', 'offer')).toThrow(/no offer/);
  });
});
