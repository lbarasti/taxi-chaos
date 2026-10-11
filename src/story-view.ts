import { messageCharacter, type Character } from './characters';
import { portraitLayout } from './portraits';
import type { Dialogue, DialogueState } from './story';

export const storyMarkup = `
  <aside id="story" class="story panel" aria-label="Ride conversation" hidden>
    <div class="story-header"><span id="story-label"></span><button id="story-close" aria-label="Minimize dialogue" title="Minimize dialogue">×</button></div>
    <div class="story-body">
      <div class="story-speaker"><span id="story-portrait-frame" class="story-portrait"><img id="story-portrait" alt=""></span><strong id="story-name"></strong></div>
      <div class="story-copy"><p id="story-text" aria-hidden="true"></p><p id="story-accessible" class="story-sr" role="status" aria-atomic="true"></p></div>
    </div>
    <button id="story-read" class="story-read">Read all</button>
  </aside>`;

const categoryLabels = { plot: 'STORY', 'side-quest': 'SIDE QUEST', lore: 'CITY LORE' };

/**
 * Applies immutable character metadata to the panel image. The display name sits
 * beside the portrait, so the image stays decorative (`alt=""`).
 */
export function showCharacterPortrait(portrait: HTMLImageElement, character: Character) {
  const layout = portraitLayout(character);
  portrait.src = layout.src;
  portrait.alt = '';
  Object.assign(portrait.style, {
    position: 'absolute', objectFit: layout.objectFit, objectPosition: layout.objectPosition,
    width: layout.width, height: layout.height, left: layout.left, top: layout.top,
  });
}

export function bindStoryView(root: HTMLElement, dialogue: () => Dialogue, focusGame: () => void, presented: () => void = () => {}) {
  const get = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const panel = get('story'), text = get('story-text'), read = get('story-read');
  const portrait = get('story-portrait') as HTMLImageElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let shown: DialogueState | null = null;
  let recorded: DialogueState | null = null;
  read.addEventListener('click', () => {
    const d = dialogue();
    if (!d.active?.expanded || d.complete || reducedMotion.matches) d.replay(); else d.readAll();
    refresh(true); focusGame();
  });
  get('story-close').addEventListener('click', () => { dialogue().collapse(); refresh(true); focusGame(); });
  function refresh(visible: boolean) {
    const d = dialogue(), active = d.active;
    panel.hidden = !visible || !active;
    if (!active) { shown = recorded = null; get('story-accessible').textContent = ''; return; }
    const speaker = messageCharacter(active.message);
    if (shown !== active) {
      shown = active;
      showCharacterPortrait(portrait, speaker);
      get('story-name').textContent = speaker.name.toUpperCase();
      get('story-label').textContent = `${categoryLabels[active.message.category]} / ${active.message.channel === 'sender' ? 'SENDER NOTE' : 'ON BOARD'}`;
      // Announce a whole message once, never each typewriter letter.
      get('story-accessible').textContent = `${speaker.name}: ${active.message.text}`;
    }
    if (visible && recorded !== active) { recorded = active; presented(); }
    const complete = d.complete || reducedMotion.matches;
    panel.classList.toggle('collapsed', !active.expanded);
    panel.classList.toggle('typing', !complete && active.expanded);
    text.textContent = active.message.text.slice(0, complete ? active.message.text.length : d.letters);
    read.textContent = !active.expanded ? `${speaker.name} · Replay message` : complete ? 'Replay' : 'Read all';
    read.setAttribute('aria-label', !active.expanded || complete ? `Replay ${speaker.name}'s message` : 'Show the full dialogue');
  }
  return refresh;
}
