import { expect, it, vi } from 'vitest';
import { bindFullscreen } from './fullscreen';

class Button extends EventTarget {
  attributes = new Map<string, string>(); title = '';
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
}
const click = async (button: Button) => { button.dispatchEvent(new Event('click')); await Promise.resolve(); await Promise.resolve(); };

it('enters and exits fullscreen, including browser-driven Escape exits', async () => {
  const button = new Button(), notify = vi.fn();
  const doc = Object.assign(new EventTarget(), { fullscreenEnabled: true, fullscreenElement: null as object | null,
    documentElement: { requestFullscreen: vi.fn(async () => { doc.fullscreenElement = {}; }) },
    exitFullscreen: vi.fn(async () => { doc.fullscreenElement = null; }),
  });
  bindFullscreen(button as unknown as HTMLElement, notify, doc as unknown as Document);
  await click(button); expect(doc.documentElement.requestFullscreen).toHaveBeenCalledOnce();
  expect(button.attributes.get('aria-pressed')).toBe('true');
  await click(button); expect(doc.exitFullscreen).toHaveBeenCalledOnce();
  await click(button); doc.fullscreenElement = null; doc.dispatchEvent(new Event('fullscreenchange'));
  expect(button.attributes.get('aria-label')).toBe('Enter fullscreen'); expect(notify).not.toHaveBeenCalled();
});

it('supports prefixed WebKit fullscreen', async () => {
  const button = new Button();
  const doc = Object.assign(new EventTarget(), { webkitFullscreenEnabled: true, webkitFullscreenElement: null as object | null,
    documentElement: { webkitRequestFullscreen: vi.fn(() => { doc.webkitFullscreenElement = {}; }) },
    webkitExitFullscreen: vi.fn(() => { doc.webkitFullscreenElement = null; }),
  });
  bindFullscreen(button as unknown as HTMLElement, vi.fn(), doc as unknown as Document);
  await click(button); expect(doc.documentElement.webkitRequestFullscreen).toHaveBeenCalledOnce();
  await click(button); expect(doc.webkitExitFullscreen).toHaveBeenCalledOnce();
});

it('handles unsupported and rejected fullscreen requests without throwing', async () => {
  const button = new Button(), notify = vi.fn();
  const doc = Object.assign(new EventTarget(), { documentElement: {} });
  bindFullscreen(button as unknown as HTMLElement, notify, doc as unknown as Document);
  await click(button); expect(notify).toHaveBeenCalledWith('This browser does not support game fullscreen.');
  const rejected = new Button();
  const denied = Object.assign(new EventTarget(), { fullscreenEnabled: true, documentElement: { requestFullscreen: vi.fn(async () => { throw new Error('denied'); }) } });
  bindFullscreen(rejected as unknown as HTMLElement, notify, denied as unknown as Document);
  await click(rejected); expect(notify).toHaveBeenLastCalledWith('Fullscreen could not open. Try again from the game button.');
});
