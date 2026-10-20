import type { Vec } from '../physics/physics';

// Circular travel, with a small centre dead zone and proportional output.
export function joystickVector(x: number, y: number, radius: number): Vec {
  const distance = Math.hypot(x, y), dead = radius * 0.12;
  if (distance <= dead || radius <= 0) return { x: 0, y: 0 };
  const strength = Math.min(1, (distance - dead) / (radius - dead));
  return { x: x / distance * strength, y: y / distance * strength };
}

// Driving gets its own horizontal dead zone, even with the throttle held up
// or down. Keep the raw vector for the knob and directional walking.
export function touchSteering(x: number): number {
  const dead = 0.2, magnitude = Math.abs(x);
  if (magnitude <= dead) return 0;
  const strength = Math.min(1, (magnitude - dead) / (1 - dead));
  return Math.sign(x) * strength * strength;
}

export function bindTouchControls(stick: HTMLElement, buttons: NodeListOf<HTMLButtonElement>, input: {
  active(): boolean;
  move(value: Vec | null): void;
  action(key: string, pressed: boolean): void;
  begin(): void;
}) {
  let pointer: number | null = null;
  const held = new Map<HTMLButtonElement, number>();
  const update = (event: PointerEvent) => {
    const box = stick.getBoundingClientRect(), radius = box.width * 0.32;
    const value = joystickVector(event.clientX - box.left - box.width / 2, event.clientY - box.top - box.height / 2, radius);
    input.move(value);
    stick.style.setProperty('--stick-x', `${value.x * radius}px`);
    stick.style.setProperty('--stick-y', `${value.y * radius}px`);
  };
  const releaseStick = () => {
    const old = pointer; pointer = null;
    input.move(null); stick.classList.remove('pressed');
    stick.style.setProperty('--stick-x', '0px'); stick.style.setProperty('--stick-y', '0px');
    if (old !== null && stick.hasPointerCapture(old)) stick.releasePointerCapture(old);
  };
  stick.addEventListener('pointerdown', event => {
    if (!input.active() || pointer !== null) return;
    event.preventDefault(); input.begin(); pointer = event.pointerId;
    stick.setPointerCapture(pointer); stick.classList.add('pressed'); update(event);
  });
  stick.addEventListener('pointermove', event => { if (event.pointerId === pointer) { event.preventDefault(); update(event); } });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    stick.addEventListener(name, event => { if (event.pointerId === pointer) releaseStick(); });
  }
  const releaseButton = (button: HTMLButtonElement) => {
    const old = held.get(button); held.delete(button);
    input.action(button.dataset.key!, false); button.classList.remove('pressed');
    if (old !== undefined && button.hasPointerCapture(old)) button.releasePointerCapture(old);
  };
  buttons.forEach(button => {
    button.addEventListener('pointerdown', event => {
      if (!input.active() || button.disabled || held.has(button)) return;
      event.preventDefault(); input.begin(); held.set(button, event.pointerId);
      button.setPointerCapture(event.pointerId); input.action(button.dataset.key!, true); button.classList.add('pressed');
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      button.addEventListener(name, event => { if (held.get(button) === event.pointerId) releaseButton(button); });
    }
  });
  return () => { releaseStick(); for (const button of held.keys()) releaseButton(button); };
}
