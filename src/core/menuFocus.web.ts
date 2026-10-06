import type { FocusProps, Focusable } from './menuFocus';

/** The web walks menus with the DOM (`keyNav.web.ts`, the `menu` layer): nothing to do per row. */
export function useMenuFocus(
  _rows: number[],
  _initial: number | undefined,
): {
  refFor: (index: number) => (node: Focusable | null) => void;
  propsFor: (index: number) => FocusProps;
} {
  return { refFor: noRef, propsFor: noProps };
}

const noRef = () => () => {};
const noProps = (): FocusProps => ({});
