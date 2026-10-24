export type InputDevice = 'keyboard' | 'touch' | 'xbox' | 'playstation';

const hints: Record<InputDevice, string> = {
  keyboard: '↑ ↓ Select · Enter Confirm',
  touch: 'Tap to select · Tap again to confirm',
  xbox: 'D-pad Select · A Confirm',
  playstation: 'D-pad Select · × Confirm',
};

// Shift and the newsroom sit on one horizontal wheel; say so only where a
// neighbouring panel actually exists.
const wheelHints: Partial<Record<InputDevice, string>> = {
  keyboard: '← → Panels · ↑ ↓ Select · Enter Confirm',
  xbox: '◄ ► Panels · D-pad Select · A Confirm',
  playstation: '◄ ► Panels · D-pad Select · × Confirm',
};

export function menuHintText(device: InputDevice, wheel = false): string {
  return wheel && wheelHints[device] || hints[device];
}

export function menuHintMarkup(device: InputDevice = 'keyboard', wheel = false): string {
  return `<p class="menu-hint" id="menu-hint">${menuHintText(device, wheel)}</p>`;
}
