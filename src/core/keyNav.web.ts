/// <reference lib="dom" />
import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { TextInput, ViewProps } from 'react-native';
import { letterJump, nextIndex } from './keyNavMath';

/**
 * Menus and pages walked with the keyboard -- docs/keyboard.md.
 *
 * One listener for the whole app rather than a hook per list: every menu is already a column of
 * buttons in DOM order, so "next" and "previous" are the DOM's own and no screen has to know about
 * keys. What a surface declares is only what kind of layer it is:
 *
 * - `menu`: a sheet or a dropdown. It takes the focus when it opens from the keyboard, gives it
 *   back to what opened it when it closes, keeps Tab inside, wraps around, and a letter jumps to
 *   the row it starts.
 * - `page`: settings, files, a page beside the conversation. Arrows walk it, no wrap.
 * - `list`: the conversation list. Same as a page.
 * - `off`: a subtree that owns its keys (the live browser picture types into a web page).
 */
export type KeyLayer = 'menu' | 'page' | 'list' | 'off';

const ATTR = 'data-claw-keys';

export function keyLayerProps(layer: KeyLayer): Partial<ViewProps> {
  return { dataSet: { clawKeys: layer } } as Partial<ViewProps>;
}

const FOCUSABLE = '[role="button"],button,a[href],input,textarea,select,[role="link"],[role="switch"],[role="checkbox"],[role="radio"],[role="tab"],[tabindex]:not([tabindex="-1"])';

function visible(el: HTMLElement): boolean {
  if (el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled) return false;
  if (el.closest('[aria-hidden="true"]')) return false;
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

function editable(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return type !== 'checkbox' && type !== 'radio' && type !== 'button';
  }
  return (el as HTMLElement).isContentEditable;
}

/** The menus on screen, the topmost last: a menu opened from a menu is drawn after it. */
function openMenus(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${ATTR}="menu"]`)).filter(m => m.getClientRects().length > 0);
}

export function menuOpen(): boolean {
  return openMenus().length > 0;
}

/** The live browser page has the keyboard: every key is the page's, Escape and shortcuts included. */
export function keysOwnedByPage(): boolean {
  return document.activeElement?.closest(`[${ATTR}="off"]`) != null;
}

/** A text field has the keyboard: shortcuts made of a bare letter would type instead. */
export function typingInField(): boolean {
  return editable(document.activeElement);
}

/** Escape leaves a field before it leaves a page: the second press goes back. */
export function leaveField(): boolean {
  const el = document.activeElement;
  if (!editable(el) || menuOpen()) return false;
  el.blur();
  return true;
}

function itemsOf(scope: HTMLElement): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => {
    if (!visible(el)) return false;
    const owner = el.closest(`[${ATTR}]`);
    // A menu inside the scope is its own layer, and an `off` subtree keeps its keys.
    return owner === scope || (owner !== null && scope.contains(owner) && owner.getAttribute(ATTR) !== 'menu' && owner.getAttribute(ATTR) !== 'off');
  });
}

/** Where the keys act: the topmost menu while one is open, else the layer the focus is in. */
function scopeOf(active: Element | null): HTMLElement | null {
  const menus = openMenus();
  if (menus.length > 0) return menus[menus.length - 1]!;
  const layer = active?.closest<HTMLElement>(`[${ATTR}]`) ?? null;
  if (layer?.getAttribute(ATTR) === 'off') return null;
  if (layer) return layer;
  // Nothing focused yet: the page on screen, the topmost if pages are stacked (a key on a bare
  // conversation scrolls it, nothing here takes it).
  if (!active || active === document.body) {
    const pages = Array.from(document.querySelectorAll<HTMLElement>(`[${ATTR}="page"]`)).filter(p => p.getClientRects().length > 0);
    return pages[pages.length - 1] ?? null;
  }
  return null;
}

function focus(el: HTMLElement | undefined): void {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** The item beside this one in its row: a header's buttons, a grid of tiles. */
function sideways(items: HTMLElement[], from: HTMLElement, dir: 1 | -1): HTMLElement | undefined {
  const a = from.getBoundingClientRect();
  const midY = a.top + a.height / 2;
  let best: { el: HTMLElement; d: number } | undefined;
  for (const el of items) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    if (b.top > midY || b.bottom < midY) continue;
    const d = dir === 1 ? b.left - a.right : a.left - b.right;
    if (d < -1) continue;
    if (!best || d < best.d) best = { el, d };
  }
  return best?.el;
}

function rowText(el: HTMLElement): string {
  return (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().toLowerCase();
}

/** Handles one key; true when it was ours. Exported for the tests, which drive it directly. */
export function navigate(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  const active = document.activeElement as HTMLElement | null;
  const scope = scopeOf(active);
  if (!scope) return false;
  const kind = scope.getAttribute(ATTR) as KeyLayer;
  const items = itemsOf(scope);
  if (items.length === 0) return false;
  const inside = active !== null && scope.contains(active) && active !== scope;
  const index = inside ? items.indexOf(active) : -1;
  const wrap = kind === 'menu';
  const typing = editable(active) && inside;
  const multiline = typing && (active!.tagName === 'TEXTAREA' || active!.isContentEditable);
  const { key } = event;

  if (event.ctrlKey || event.metaKey || event.altKey) return false;

  if (key === 'ArrowDown' || key === 'ArrowUp') {
    // A field keeps its caret, except a one-line field going down into the list under it.
    if (multiline || (typing && key === 'ArrowUp')) return false;
    focus(items[nextIndex(key, { count: items.length, index, wrap })]);
    return true;
  }
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    if (typing || index < 0) return false;
    const next = sideways(items, items[index]!, key === 'ArrowRight' ? 1 : -1);
    if (!next) return false;
    focus(next);
    return true;
  }
  if (key === 'Home' || key === 'End') {
    if (typing) return false;
    focus(items[nextIndex(key, { count: items.length, index, wrap })]);
    return true;
  }
  if (key === 'Tab' && kind === 'menu') {
    // Tab stays in an open menu: the page under it is not reachable until it closes.
    focus(items[nextIndex('Tab', { count: items.length, index, wrap, shift: event.shiftKey })]);
    return true;
  }
  if (kind === 'menu' && !typing && key.length === 1 && /\S/.test(key) && !event.shiftKey) {
    const hit = letterJump(items.map(rowText), index, key);
    if (hit < 0) return false;
    focus(items[hit]);
    return true;
  }
  return false;
}

/** Was the last thing the owner did a key? A menu opened by a click does not steal the focus. */
let keyboardLast = false;

/**
 * Installed once, by the shell. Capture phase, like the hotkeys: react-native-web's TextInput stops
 * every key event it sees, and a search field's ArrowDown into its list is one of ours. What owns
 * its own keys is excluded by layer (`off`) or by being a multi-line field, not by event order.
 */
export function useKeyNav(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      keyboardLast = true;
      if (event.defaultPrevented || event.isComposing) return;
      if (navigate(event)) event.preventDefault();
    };
    const onPointer = (): void => {
      keyboardLast = false;
    };

    // A menu that opens takes the focus (from the keyboard only), and gives it back on closing.
    const returnTo = new Map<HTMLElement, HTMLElement>();
    // Coalesced to one look per frame: a streaming answer mutates the page many times a second.
    let pending = 0;
    const check = (): void => {
      pending = 0;
      const menus = openMenus();
      for (const [menu, opener] of returnTo) {
        if (menus.includes(menu) && menu.isConnected) continue;
        returnTo.delete(menu);
        const active = document.activeElement;
        if ((!active || active === document.body || !active.isConnected) && opener.isConnected) opener.focus({ preventScroll: true });
      }
      const top = menus[menus.length - 1];
      if (!top || returnTo.has(top)) return;
      const active = document.activeElement as HTMLElement | null;
      returnTo.set(top, active && active !== document.body ? active : document.body);
      if (keyboardLast && !(active && top.contains(active))) {
        // A menu opened from the keyboard takes the focus, so its rows are immediately walkable.
        // A field that already has it keeps it: a prompt can land while the owner is typing -- an
        // approval raised by a run -- and taking the caret away mid-sentence was worse than a
        // menu one Tab away (owner, 2026-11-15: "il faut nous laisser le focus sur le chat").
        if (!editable(active)) {
          // A search row first (typing filters at once), else the option in effect, else the first.
          const items = itemsOf(top);
          const first = items[0];
          const selected = items.find(el => el.getAttribute('aria-selected') === 'true');
          focus(first && editable(first) ? first : selected ?? first);
        }
      }
    };
    const observer = new MutationObserver(() => {
      if (!pending) pending = requestAnimationFrame(check);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      observer.disconnect();
      if (pending) cancelAnimationFrame(pending);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, []);
}

/** The web finds a field by its label in the DOM (`focusField`): nothing to register. */
export function keyField(_label: string, _ref: RefObject<TextInput | null>): () => void {
  return () => {};
}

/** Puts the caret in the field with that label (the composer), when one is on screen. */
export function focusField(label: string): boolean {
  const field = Array.from(document.querySelectorAll<HTMLElement>(`[aria-label="${label}"]`)).find(visible);
  if (!field) return false;
  field.focus();
  return true;
}
