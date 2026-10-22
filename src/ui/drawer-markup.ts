// These are the actual pages in the title/pause drawer, not an extensible router.
export type DrawerPage = 'home' | 'load-game' | 'new-game' | 'settings' | 'shift' | 'credits' | 'newsroom' | 'notebook' | 'notebook-guide' | 'publications' | 'finale';
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export function menuItem(label: string, { id, page, disabled = false }: { id: string; page?: DrawerPage; disabled?: boolean }) {
  return `<button class="menu-item" id="${escape(id)}"${page ? ` data-page="${page}"` : ''}${disabled ? ' disabled' : ''}><span>${escape(label)}</span></button>`;
}
export function drawerHeading(title: string, back: DrawerPage) {
  return `<div class="intro-eyebrow">TAXI CHAOS / MENU</div><h2 id="modal-title">${title}</h2>${menuItem('Back', { id: 'drawer-back', page: back })}`;
}
