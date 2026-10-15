// Match the HUD's monochrome, rounded stroke icons.
const paths = {
  gore: '<path d="M8 17v4h8v-4a8 8 0 1 0-8 0Z"/><circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/><path d="m11 14 1-2 1 2m-1 4v3"/>',
  difficulty: '<path d="M4 19a10 10 0 1 1 16 0M12 4v2M4 12h2m12 0h2m-8 0 5-5"/><circle cx="12" cy="12" r="2"/>',
  muted: '<path d="M11 5 6 9H3v6h3l5 4Zm5 4 6 6m0-6-6 6"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4Zm4 3a5 5 0 0 1 0 8m3-11a9 9 0 0 1 0 14"/>',
  sirens: '<path d="M6 18v-7a6 6 0 0 1 12 0v7M4 18h16v3H4ZM12 1v1M3 4l2 2m16-2-2 2M1 11h2m18 0h2"/>',
};
export type SettingKey = keyof typeof paths;
export function settingRow(key: SettingKey, label: string, value: string, hint = '') {
  const toggle = key === 'gore' || key === 'muted';
  const difficulty = key === 'difficulty';
  const current = difficulty ? ['Cruise', 'Street', 'Chaos'].indexOf(value) : parseInt(value);
  const control = toggle
    ? `<input type="checkbox" role="switch" id="${key}-option" data-setting-input="${key}" ${value === 'On' ? 'checked' : ''}>`
    : `<input type="range" id="${key}-option" data-setting-input="${key}" min="0" max="${difficulty ? 2 : 100}" step="1" value="${current}" ${difficulty ? `aria-valuetext="${value}" list="difficulty-stops"` : ''}><output for="${key}-option">${value}</output>${difficulty ? '<datalist id="difficulty-stops"><option value="0"></option><option value="1"></option><option value="2"></option></datalist>' : ''}`;
  return `<label class="setting-row" data-setting="${key}" for="${key}-option">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[key]}</svg>
    <span class="setting-label">${label}${hint ? `<small>${hint}</small>` : ''}</span>
    <span class="setting-value${toggle ? ' setting-toggle' : ''}">${control}</span>
  </label>`;
}
