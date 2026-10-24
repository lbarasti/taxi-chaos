// These are the actual pages in the title/pause drawer, not an extensible router.
export type DrawerPage = 'home' | 'load-game' | 'new-game' | 'settings' | 'shift' | 'credits' | 'newsroom' | 'publications' | 'finale';
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export function menuItem(label: string, { id, page, disabled = false }: { id: string; page?: DrawerPage; disabled?: boolean }) {
  return `<button class="menu-item" id="${escape(id)}"${page ? ` data-page="${page}"` : ''}${disabled ? ' disabled' : ''}><span>${escape(label)}</span></button>`;
}
export function drawerHeading(title: string, back: DrawerPage) {
  return `<div class="intro-eyebrow">TAXI CHAOS / MENU</div><h2 id="modal-title">${title}</h2>${menuItem('Back', { id: 'drawer-back', page: back })}`;
}

/** The next panel on the wheel, shown beside the current title. */
export type PanelSibling = { page: DrawerPage; label: string };

/**
 * A wheel step shows both titles side by side: the current page in full, and
 * the next one dimmed and clipped by the drawer edge, exactly where the arrow
 * key takes you. The neighbour doubles as the pointer/touch target.
 */
export function panelWheelMarkup(eyebrow: string, title: string, sibling: PanelSibling | null) {
  const current = `<h2 id="modal-title">${escape(title)}</h2>`;
  const spoken = sibling ? escape(sibling.label.replace(/\.$/, '')) : '';
  const neighbour = sibling
    ? `<button class="drawer-wheel-next" data-wheel data-page="${sibling.page}" aria-label="${spoken} panel" aria-keyshortcuts="ArrowRight" title="${spoken} · ArrowRight">${escape(sibling.label)}</button>`
    : '';
  return `<div class="drawer-head"><div class="intro-eyebrow">${escape(eyebrow)}</div><div class="drawer-wheel">${current}${neighbour}</div></div>`;
}
