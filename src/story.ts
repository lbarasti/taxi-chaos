/** Authored pickup beats. IDs belong to missions, never to a recurring dispatch name. */
export type StoryCategory = 'plot' | 'side-quest' | 'lore';
export type StoryMessage = Readonly<{
  speaker: string; portrait: 'mia'; category: StoryCategory;
  channel: 'passenger' | 'sender'; text: string;
}>;
const meridianClue = 'I saw two Meridian vans outside the café again… and the usual police car never showed up.';
export const storyBeats = Object.freeze({
  'mia-meridian-vans': Object.freeze({
    fare: Object.freeze({ speaker: 'Mia', portrait: 'mia', category: 'plot', channel: 'passenger', text: meridianClue } satisfies StoryMessage),
    parcel: Object.freeze({ speaker: 'Mia', portrait: 'mia', category: 'plot', channel: 'sender', text: `Thanks for taking my parcel. ${meridianClue}` } satisfies StoryMessage),
  }),
});
export type StoryBeatId = keyof typeof storyBeats;
export const STORY_LETTERS_PER_SECOND = 32;
export type DialogueState = { beatId: StoryBeatId; message: StoryMessage; elapsed: number; expanded: boolean };

/** Run-only presentation state; does not consume RNG, write saves or affect fares. */
export class Dialogue {
  active: DialogueState | null = null;
  start(beatId: StoryBeatId | undefined, type: 'fare' | 'parcel') {
    this.active = beatId ? { beatId, message: storyBeats[beatId][type], elapsed: 0, expanded: true } : null;
  }
  clear() { this.active = null; }
  update(dt: number) {
    if (this.active?.expanded) this.active.elapsed = Math.min(this.active.message.text.length / STORY_LETTERS_PER_SECOND, this.active.elapsed + dt);
  }
  get letters() { return this.active ? Math.min(this.active.message.text.length, Math.floor(this.active.elapsed * STORY_LETTERS_PER_SECOND + 1e-7)) : 0; }
  get complete() { return !!this.active && this.letters === this.active.message.text.length; }
  readAll() { if (this.active) this.active.elapsed = this.active.message.text.length / STORY_LETTERS_PER_SECOND; }
  replay() { if (this.active) { this.active.elapsed = 0; this.active.expanded = true; } }
  collapse() { if (this.active) this.active.expanded = false; }
  snapshot() { return structuredClone(this.active); }
}
