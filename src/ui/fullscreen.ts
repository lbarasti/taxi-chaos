type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => void | Promise<void>;
};
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void | Promise<void> };

export function bindFullscreen(button: HTMLElement, notify: (message: string) => void, doc: FullscreenDocument = document) {
  const root = doc.documentElement as FullscreenElement;
  const supported = Boolean(doc.fullscreenEnabled && root.requestFullscreen || doc.webkitFullscreenEnabled && root.webkitRequestFullscreen);
  const refresh = () => {
    const active = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
    button.setAttribute('aria-pressed', String(active));
    const label = supported ? active ? 'Exit fullscreen' : 'Enter fullscreen' : 'Fullscreen unavailable in this browser';
    button.setAttribute('aria-label', label); button.title = label;
  };
  button.addEventListener('click', async () => {
    if (!supported) { notify('This browser does not support game fullscreen.'); return; }
    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (doc.fullscreenElement && doc.exitFullscreen) await doc.exitFullscreen(); else await doc.webkitExitFullscreen?.();
      } else if (doc.fullscreenEnabled && root.requestFullscreen) await root.requestFullscreen();
      else await root.webkitRequestFullscreen?.();
    } catch { notify('Fullscreen could not open. Try again from the game button.'); }
    refresh();
  });
  doc.addEventListener('fullscreenchange', refresh);
  doc.addEventListener('webkitfullscreenchange', refresh);
  refresh();
}
