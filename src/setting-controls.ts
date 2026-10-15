// Match the HUD's monochrome, rounded stroke icons.
const paths = {
  gore: '<path d="M8 17v4h8v-4a8 8 0 1 0-8 0Z"/><circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/><path d="m11 14 1-2 1 2m-1 4v3"/>',
  difficulty: '<path d="M4 19a10 10 0 1 1 16 0M12 4v2M4 12h2m12 0h2m-8 0 5-5"/><circle cx="12" cy="12" r="2"/>',
  muted: '<path d="M11 5 6 9H3v6h3l5 4Zm5 4 6 6m0-6-6 6"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4Zm4 3a5 5 0 0 1 0 8m3-11a9 9 0 0 1 0 14"/>',
  sirens: '<path d="M6 18v-7a6 6 0 0 1 12 0v7M4 18h16v3H4ZM12 1v1M3 4l2 2m16-2-2 2M1 11h2m18 0h2"/>',
};
type SettingBase = { id: string; icon: keyof typeof paths; label: string; hint?: string };
export type SwitchSetting = SettingBase & {
  type: 'switch';
  read: () => boolean;
  write: (value: boolean) => void;
};
export type SliderSetting = SettingBase & {
  type: 'slider';
  min: number; max: number; step: number;
  read: () => number;
  write: (value: number) => void;
  format: (value: number) => string;
  stops?: readonly number[];
};
export type Setting = SwitchSetting | SliderSetting;

function switchMarkup(setting: SwitchSetting) {
  return `<input type="checkbox" role="switch" id="${setting.id}-option" ${setting.read() ? 'checked' : ''}>`;
}
function sliderMarkup(setting: SliderSetting) {
  const { id, min, max, step, stops } = setting, value = setting.read(), text = setting.format(value);
  return `<input type="range" id="${id}-option" min="${min}" max="${max}" step="${step}" value="${value}" aria-valuetext="${text}" ${stops ? `list="${id}-stops"` : ''}><output for="${id}-option">${text}</output>${stops ? `<datalist id="${id}-stops">${stops.map(stop => `<option value="${stop}"></option>`).join('')}</datalist>` : ''}`;
}
export function settingRow(setting: Setting) {
  const control = setting.type === 'switch' ? switchMarkup(setting) : sliderMarkup(setting);
  return `<label class="setting-row" data-setting="${setting.id}" for="${setting.id}-option">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[setting.icon]}</svg>
    <span class="setting-label">${setting.label}${setting.hint ? `<small>${setting.hint}</small>` : ''}</span>
    <span class="setting-value${setting.type === 'switch' ? ' setting-toggle' : ''}">${control}</span>
  </label>`;
}

function bindSwitch(input: HTMLInputElement, setting: SwitchSetting) {
  const refresh = () => { input.checked = setting.read(); };
  input.addEventListener('input', () => { setting.write(input.checked); refresh(); });
  return refresh;
}
function bindSlider(input: HTMLInputElement, setting: SliderSetting) {
  const output = input.parentElement!.querySelector('output')!;
  const refresh = () => {
    const value = setting.read(), text = setting.format(value);
    input.value = String(value);
    input.setAttribute('aria-valuetext', text);
    if (output.textContent !== text) output.textContent = text;
  };
  input.addEventListener('input', () => { setting.write(input.valueAsNumber); refresh(); });
  return refresh;
}
export function bindSettingControls(root: HTMLElement, settings: readonly Setting[]): () => void {
  const refreshers: (() => void)[] = [];
  for (const setting of settings) {
    const input = root.querySelector<HTMLInputElement>(`#${setting.id}-option`);
    if (input) refreshers.push(setting.type === 'switch' ? bindSwitch(input, setting) : bindSlider(input, setting));
  }
  return () => { for (const refresh of refreshers) refresh(); };
}
