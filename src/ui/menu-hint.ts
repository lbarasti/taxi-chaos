export type InputDevice = 'keyboard' | 'touch' | 'xbox' | 'playstation';

const hints: Record<InputDevice, string> = {
  keyboard: '↑ ↓ Select · Enter Confirm',
  touch: 'Tap to select · Tap again to confirm',
  xbox: 'D-pad Select · A Confirm',
  playstation: 'D-pad Select · × Confirm',
};

export function menuHintText(device: InputDevice): string {
  return hints[device];
}

export function menuHintMarkup(device: InputDevice = 'keyboard'): string {
  return `<p class="menu-hint" id="menu-hint">${menuHintText(device)}</p>`;
}
