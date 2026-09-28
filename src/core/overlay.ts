/**
 * The one layer over everything: a menu opened from a small control, and the line that says what
 * it did.
 *
 * `ActionSheet` fills its parent. Rendered where the control is -- a row of the explorer, an
 * attachment chip in a bubble, the bar of a viewer -- it opened inside that element (2026-09-28).
 * A control deep in the tree asks this store instead, and `OverlayHost`, mounted last in the
 * shell, draws it over the whole screen, viewers included. The back cascade reads it first.
 *
 * - `sheet`: the bottom sheet of a phone (a centred dialog on a desktop, as every sheet);
 * - `menu`: a short list hung under the control that opened it, where a pointer is;
 * - `notice`: one line near the bottom, gone after a few seconds, because a control 32 points wide
 *   has no room to say "Saved to Downloads".
 */

import type { SheetEntry } from '../components/ActionSheet';

export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type OverlayMenu =
  | { kind: 'sheet'; preview?: string; options: SheetEntry[] }
  | { kind: 'menu'; anchor: AnchorRect; options: SheetEntry[] };

export interface OverlayState {
  menu: OverlayMenu | null;
  notice: { id: number; text: string; failed: boolean } | null;
}

export const NOTICE_MS = 3500;

class OverlayStore {
  private state: OverlayState = { menu: null, notice: null };
  private listeners = new Set<() => void>();
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private noticeSeq = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): OverlayState => this.state;

  /** Replaces whatever menu was up: one menu at a time, the latest asked. */
  open(menu: OverlayMenu): void {
    this.set({ ...this.state, menu });
  }

  /** True when a menu was up: the back cascade reads that as "the press was mine". */
  close(): boolean {
    if (!this.state.menu) return false;
    this.set({ ...this.state, menu: null });
    return true;
  }

  notify(text: string, failed = false): void {
    clearTimeout(this.noticeTimer);
    this.noticeSeq += 1;
    const id = this.noticeSeq;
    this.set({ ...this.state, notice: { id, text, failed } });
    this.noticeTimer = setTimeout(() => {
      if (this.state.notice?.id === id) this.set({ ...this.state, notice: null });
    }, NOTICE_MS);
  }

  reset(): void {
    clearTimeout(this.noticeTimer);
    this.state = { menu: null, notice: null };
    this.emit();
  }

  private set(next: OverlayState): void {
    this.state = next;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const overlayStore = new OverlayStore();
