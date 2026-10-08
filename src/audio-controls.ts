import type { AudioFX } from './audio';

export function audioMarkup(audio: AudioFX) {
  const p = audio.preferences;
  return `<fieldset class="audio-settings"><legend>SOUND FX</legend>
    <label class="audio-toggle"><input type="checkbox" data-audio="muted" ${p.muted ? 'checked' : ''}> Mute FX</label>
    <label>FX volume <input type="range" min="0" max="100" step="1" value="${Math.round(p.volume * 100)}" data-audio="volume" aria-label="FX volume"><output data-audio-out="volume">${Math.round(p.volume * 100)}%</output></label>
    <label>Sirens <input type="range" min="0" max="100" step="1" value="${Math.round(p.sirens * 100)}" data-audio="sirens" aria-label="Siren volume"><output data-audio-out="sirens">${Math.round(p.sirens * 100)}%</output></label>
    <small data-audio-status>Sound starts with your first click or driving key.</small>
    <details class="audio-credits"><summary>Sound credits &amp; licences</summary><p>Engine: <a href="https://opengameart.org/content/racing-car-engine-sound-loops" target="_blank" rel="noopener">domasx2</a> · Impacts/explosions: <a href="https://kenney.nl/assets" target="_blank" rel="noopener">Kenney</a> · Siren: <a href="https://opengameart.org/content/sirens-and-alarm-noise" target="_blank" rel="noopener">aquinn</a> (CC0).</p><p>Tyres: <a href="https://opengameart.org/content/car-tire-squeal-skid-loop" target="_blank" rel="noopener">audible-edge / Tom Haigh, loop by qubodup</a> · Boost: <a href="https://opengameart.org/content/racing-speed-boost-sound" target="_blank" rel="noopener">Iwan Gabovitch / qubodup</a> · Fire: <a href="https://opengameart.org/content/fire-loop" target="_blank" rel="noopener">qubodup</a> (<a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>). Samples edited for mono, loudness, loop seams and size; pitch/filter changes in-game.</p></details>
  </fieldset>`;
}
export function bindAudioControls(root: HTMLElement, audio: AudioFX) {
  for (const input of Array.from(root.querySelectorAll<HTMLInputElement>('[data-audio]'))) {
    input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', () => {
      const key = input.dataset.audio as 'muted' | 'volume' | 'sirens';
      audio.configure(key === 'muted' ? { muted: input.checked } : { [key]: Number(input.value) / 100 });
      void audio.unlock(); refreshAudioControls(audio);
    });
  }
}
export function refreshAudioControls(audio: AudioFX) {
  const state = audio.state();
  for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('[data-audio]'))) {
    const key = input.dataset.audio as 'muted' | 'volume' | 'sirens';
    if (document.activeElement !== input) { if (key === 'muted') input.checked = state.muted; else input.value = String(Math.round(state[key] * 100)); }
  }
  for (const output of Array.from(document.querySelectorAll<HTMLOutputElement>('[data-audio-out]'))) {
    const key = output.dataset.audioOut as 'volume' | 'sirens'; output.textContent = `${Math.round(state[key] * 100)}%`;
  }
  const message = state.muted ? 'FX muted.' : state.volume === 0 ? 'FX volume is zero.' : state.status === 'locked' ? 'Sound starts with your first click or driving key.' : state.status === 'loading' ? 'Preparing sound FX…' : state.status === 'unavailable' ? 'Sound unavailable in this browser.' : state.context !== 'running' ? 'Click or press a driving key to resume sound.' : state.failures.length ? `${state.decoded}/${state.total} sounds ready; some samples unavailable.` : 'FX ready · Sirens at 0% disables sirens.';
  for (const label of Array.from(document.querySelectorAll<HTMLElement>('[data-audio-status]'))) label.textContent = message;
}
