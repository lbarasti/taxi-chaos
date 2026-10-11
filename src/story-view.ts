import miaPortrait from './assets/mia.svg';
import type { Dialogue, DialogueState } from './story';

export const storyMarkup = `
  <aside id="story" class="story panel" aria-label="Pickup dialogue" hidden>
    <div class="story-header"><span id="story-label"></span><button id="story-close" aria-label="Minimize dialogue" title="Minimize dialogue">×</button></div>
    <div class="story-body">
      <div class="story-speaker"><img id="story-portrait" src="${miaPortrait}" alt="" width="100" height="116"><strong id="story-name"></strong></div>
      <div class="story-copy"><p id="story-text" aria-hidden="true"></p><p id="story-accessible" class="story-sr" role="status" aria-atomic="true"></p></div>
    </div>
    <button id="story-read" class="story-read">Read all</button>
  </aside>`;

const categoryLabels = { plot: 'STORY', 'side-quest': 'SIDE QUEST', lore: 'CITY LORE' };
export function bindStoryView(root: HTMLElement, dialogue: () => Dialogue, focusGame: () => void) {
  const get = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const panel = get('story'), text = get('story-text'), read = get('story-read');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let shown: DialogueState | null = null;
  read.addEventListener('click', () => {
    const d = dialogue();
    if (!d.active?.expanded || d.complete || reducedMotion.matches) d.replay(); else d.readAll();
    refresh(true); focusGame();
  });
  get('story-close').addEventListener('click', () => { dialogue().collapse(); refresh(true); focusGame(); });
  function refresh(visible: boolean) {
    const d = dialogue(), active = d.active;
    panel.hidden = !visible || !active;
    if (!active) { shown = null; get('story-accessible').textContent = ''; return; }
    if (shown !== active) {
      shown = active;
      get('story-name').textContent = active.message.speaker.toUpperCase();
      get('story-label').textContent = `${categoryLabels[active.message.category]} / ${active.message.channel === 'sender' ? 'SENDER NOTE' : 'ON BOARD'}`;
      // Announce a whole message once, never each typewriter letter.
      get('story-accessible').textContent = `${active.message.speaker}: ${active.message.text}`;
    }
    const complete = d.complete || reducedMotion.matches;
    panel.classList.toggle('collapsed', !active.expanded);
    panel.classList.toggle('typing', !complete && active.expanded);
    text.textContent = active.message.text.slice(0, complete ? active.message.text.length : d.letters);
    read.textContent = !active.expanded ? `${active.message.speaker} · Replay message` : complete ? 'Replay' : 'Read all';
    read.setAttribute('aria-label', !active.expanded || complete ? `Replay ${active.message.speaker}'s message` : 'Show the full dialogue');
  }
  return refresh;
}
