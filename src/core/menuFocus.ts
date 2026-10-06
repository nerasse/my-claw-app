import { useCallback, useEffect, useRef, useState } from 'react';
import { findNodeHandle, type TextInput, type View } from 'react-native';
import { deviceBridge } from './nativeBridge';

/**
 * A menu walked with a physical keyboard on Android -- docs/keyboard.md, the web's `menu` layer.
 *
 * Opened from the keyboard it takes the focus (its search field, else the option in effect, else
 * the first row) and gives it back to what opened it when it closes; the arrows and Tab go round
 * its ends instead of leaving for the page under it. Opened by a tap, nothing moves: Android is in
 * touch mode and HardwareKeys leaves the focus alone.
 */
/** A row, or the search field above them. */
export type Focusable = View | TextInput;

/** Android's own focus order, by react tag. */
export interface FocusProps {
  nextFocusUp?: number;
  nextFocusDown?: number;
  nextFocusLeft?: number;
  nextFocusRight?: number;
  nextFocusForward?: number;
}

export function useMenuFocus(rows: number[], initial: number | undefined): {
  refFor: (index: number) => (node: Focusable | null) => void;
  propsFor: (index: number) => FocusProps;
} {
  const nodes = useRef(new Map<number, Focusable>());
  const [tags, setTags] = useState<Map<number, number>>(new Map());
  const key = rows.join(',');

  useEffect(() => {
    const next = new Map<number, number>();
    for (const [index, node] of nodes.current) {
      const tag = findNodeHandle(node);
      if (tag != null) next.set(index, tag);
    }
    setTags(next);
  }, [key]);

  useEffect(() => {
    const target = initial !== undefined ? nodes.current.get(initial) : undefined;
    const tag = target ? findNodeHandle(target) : null;
    if (tag != null) deviceBridge.focusIfKeyboard(tag);
    return () => deviceBridge.restoreKeyboardFocus();
    // Once per opening: a menu whose rows change under the reader keeps the focus where it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refFor = useCallback(
    (index: number) => (node: Focusable | null) => {
      if (node) nodes.current.set(index, node);
      else nodes.current.delete(index);
    },
    [],
  );

  const first = rows[0];
  const last = rows[rows.length - 1];
  const propsFor = useCallback(
    (index: number): FocusProps => {
      const own = tags.get(index);
      const firstTag = first !== undefined ? tags.get(first) : undefined;
      const lastTag = last !== undefined ? tags.get(last) : undefined;
      return {
        // A row has nothing beside it: left and right stay on it rather than leave the menu.
        ...(own !== undefined ? { nextFocusLeft: own, nextFocusRight: own } : {}),
        ...(index === first && lastTag !== undefined ? { nextFocusUp: lastTag } : {}),
        ...(index === last && firstTag !== undefined ? { nextFocusDown: firstTag, nextFocusForward: firstTag } : {}),
      };
    },
    [tags, first, last],
  );

  return { refFor, propsFor };
}
