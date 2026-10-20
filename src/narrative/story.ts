import type { CharacterId } from './characters';

/**
 * Authored dialogue identities. A beat id is a stable string resolved from the
 * mission catalogue (`dialogue` section), never a recurring dispatch name.
 */
export type BeatId = string;
export type StoryCategory = 'plot' | 'side-quest' | 'lore';
export type StoryMessage = Readonly<{
  /** Stable character identity; the display name and portrait resolve from the catalogue. */
  speaker: CharacterId; category: StoryCategory;
  channel: 'passenger' | 'sender'; text: string;
}>;
export const STORY_LETTERS_PER_SECOND = 32;
export type DialogueState = { beatId: BeatId; message: StoryMessage; elapsed: number; expanded: boolean };

/** Run-only presentation state; does not consume RNG, write saves or affect fares. */
export class Dialogue {
  active: DialogueState | null = null;
  /** Starts a resolved beat. Passing no beat/message clears the panel. */
  start(beatId: BeatId | undefined, message: StoryMessage | null) {
    this.active = beatId && message ? { beatId, message, elapsed: 0, expanded: true } : null;
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
