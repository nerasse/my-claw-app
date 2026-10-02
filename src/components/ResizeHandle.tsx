/**
 * The drag strip on the edge of a desktop column. A pointer thing: on Android (a tablet in
 * landscape included) the columns keep their default widths, and there is nothing to grab.
 * The web one is `ResizeHandle.web.tsx`.
 */
export interface ResizeHandleProps {
  /** Which edge of its column it sits on. Dragging away from the column widens it. */
  edge: 'left' | 'right';
  width: number;
  onResize: (width: number) => void;
  /** A double click: back to the default width. */
  onReset: () => void;
  label: string;
}

export function ResizeHandle(_props: ResizeHandleProps): null {
  return null;
}
