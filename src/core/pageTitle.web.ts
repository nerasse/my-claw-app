/// <reference lib="dom" />

/**
 * The window title, and the closest thing to a notification a plain-HTTP page has.
 *
 * Web Push needs a secure context, so behind a bare `http://host:8080` nothing can tell the owner
 * that a run finished while the tab sat in the background. A count in the title can, and it costs
 * one assignment: it is visible in the tab strip, in the task switcher and in the window list.
 */
export function setPageTitle(title: string, unread: number): void {
  const name = title.trim() || 'MyClaw';
  document.title = unread > 0 ? `(${unread}) ${name} · MyClaw` : `${name} · MyClaw`;
}
