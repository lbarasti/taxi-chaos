import { menuItem } from '../ui/drawer-markup';
import { audioCreditsMarkup } from '../ui/credits';
import type { AudioFX } from './audio';

export function audioMarkup(audio: AudioFX, { credits = 'inline' }: { credits?: 'inline' | 'page' } = {}) {
  const p = audio.preferences;
  return `<fieldset class="audio-settings"><legend>SOUND FX</legend>
    <label class="audio-toggle menu-field"><input type="checkbox" data-audio="muted" ${p.muted ? 'checked' : ''}> Mute FX</label>
    <label class="menu-field">FX volume <input type="range" min="0" max="100" step="1" value="${Math.round(p.volume * 100)}" data-audio="volume" aria-label="FX volume"><output data-audio-out="volume">${Math.round(p.volume * 100)}%</output></label>
    <label class="menu-field">Player engine <input type="range" min="0" max="100" step="1" value="${Math.round(p.playerEngine * 100)}" data-audio="playerEngine" aria-label="Player engine volume"><output data-audio-out="playerEngine">${Math.round(p.playerEngine * 100)}%</output></label>
    <label class="menu-field">Ambient <input type="range" min="0" max="100" step="1" value="${Math.round(p.ambient * 100)}" data-audio="ambient" aria-label="Ambient volume"><output data-audio-out="ambient">${Math.round(p.ambient * 100)}%</output></label>
    <label class="menu-field">Sirens <input type="range" min="0" max="100" step="1" value="${Math.round(p.sirens * 100)}" data-audio="sirens" aria-label="Siren volume"><output data-audio-out="sirens">${Math.round(p.sirens * 100)}%</output></label>
    <small>FX volume controls all sound effects. Ambient adjusts traffic, horns, fire and impacts within that level.</small>
    <small data-audio-status>Sound starts with your first click or driving key.</small>
    ${credits === 'page' ? menuItem('Sound credits & licences', { id: 'menu-credits', page: 'credits' }) : audioCreditsMarkup()}
  </fieldset>`;
}
export function bindAudioControls(root: HTMLElement, audio: AudioFX) {
  for (const input of Array.from(root.querySelectorAll<HTMLInputElement>('[data-audio]'))) {
    input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', () => {
      const key = input.dataset.audio as keyof AudioFX['preferences'];
      audio.configure(key === 'muted' ? { muted: input.checked } : { [key]: Number(input.value) / 100 });
      void audio.unlock(); refreshAudioControls(audio);
    });
  }
}
export function refreshAudioControls(audio: AudioFX) {
  const state = audio.state();
  for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('[data-audio]'))) {
    const key = input.dataset.audio as keyof AudioFX['preferences'];
    if (document.activeElement !== input) { if (key === 'muted') input.checked = state.muted; else input.value = String(Math.round(state[key] * 100)); }
  }
  for (const output of Array.from(document.querySelectorAll<HTMLOutputElement>('[data-audio-out]'))) {
    const key = output.dataset.audioOut as 'volume' | 'playerEngine' | 'ambient' | 'sirens'; output.textContent = `${Math.round(state[key] * 100)}%`;
  }
  const message = state.muted ? 'FX muted.' : state.volume === 0 ? 'FX volume is zero.' : state.status === 'locked' ? 'Sound starts with your first click or driving key.' : state.status === 'loading' ? 'Preparing sound FX…' : state.status === 'unavailable' ? 'Sound unavailable in this browser.' : state.context !== 'running' ? 'Click or press a driving key to resume sound.' : state.failures.length ? `${state.decoded}/${state.total} sounds ready; some samples unavailable.` : 'FX ready.';
  for (const label of Array.from(document.querySelectorAll<HTMLElement>('[data-audio-status]'))) label.textContent = message;
}
