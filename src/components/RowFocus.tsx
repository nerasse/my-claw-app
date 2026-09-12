import React, { createContext, useContext, useMemo } from 'react';

/**
 * How a row of the thread asks the list to move.
 *
 * The two contexts are separate, and it is the whole point: the request handler lives at the
 * screen and the key at the row, so a row only has to know its own name. `VirtualizedList` is a
 * `PureComponent` keyed on the identity of `data`/`renderItem`, and the row renderer must stay
 * stable -- but a row needs a per-row value, and a fresh object identity per render would defeat
 * that purity for every cell on screen. A plain string in one context and a `useCallback` in the
 * other both compare by value, so nothing re-renders when an unrelated row changes.
 *
 * A row with no host is not an error: the same asides are drawn on screens that do not scroll.
 */
const RequestFocusContext = createContext<((key: string) => void) | null>(null);
const RowKeyContext = createContext<string | null>(null);

export function FocusRequestHost({
  onRequestFocus,
  children,
}: {
  /** Must be stable: it is placed in a context, and a new identity re-renders every reader. */
  onRequestFocus: (key: string) => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return <RequestFocusContext.Provider value={onRequestFocus}>{children}</RequestFocusContext.Provider>;
}

export function RowKey({ id, children }: { id: string; children: React.ReactNode }): React.JSX.Element {
  return <RowKeyContext.Provider value={id}>{children}</RowKeyContext.Provider>;
}

/**
 * What an expandable block calls the moment it opens or closes. `undefined` when the row is not in
 * a focusable list, which is a fact about the screen and never an error.
 *
 * Both directions matter, and for different reasons: opening brings the top of the row to the top
 * of the screen so the revealed content is read from its first line rather than by scrolling up to
 * it, and closing keeps the row where it already is, so the thread does not jump away from the
 * reader who just put it back.
 */
export function useRowFocus(): (() => void) | undefined {
  const key = useContext(RowKeyContext);
  const request = useContext(RequestFocusContext);
  return useMemo(
    () => (key === null || request === null ? undefined : () => request(key)),
    [key, request],
  );
}
