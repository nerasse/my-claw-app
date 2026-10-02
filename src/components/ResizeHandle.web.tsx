/// <reference lib="dom" />
import React, { useMemo, useRef, useState } from 'react';
import { useTheme } from '../theme';
import type { ResizeHandleProps } from './ResizeHandle';

export type { ResizeHandleProps } from './ResizeHandle';

/** Wide enough to be found with a mouse, centred on the border it moves. */
const GRAB = 10;

const STRIP: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: GRAB,
  cursor: 'col-resize',
  zIndex: 20,
  touchAction: 'none',
  display: 'flex',
  justifyContent: 'center',
};
const STRIP_AT = { left: { ...STRIP, left: -GRAB / 2 }, right: { ...STRIP, right: -GRAB / 2 } };
const LINE: React.CSSProperties = { width: 2, height: '100%', transition: 'background 120ms' };

/**
 * A plain element rather than a View: the cursor it needs (`col-resize`) is not one React
 * Native's style types know, and pointer capture is what keeps a drag alive over the iframe of a
 * PDF or an HTML preview in the pane, which would otherwise swallow every move.
 */
export function ResizeHandle({ edge, width, onResize, onReset, label }: ResizeHandleProps): React.JSX.Element {
  const { palette } = useTheme();
  const start = useRef<{ x: number; width: number } | null>(null);
  const [active, setActive] = useState(false);
  const [hover, setHover] = useState(false);
  const direction = edge === 'right' ? 1 : -1;
  const lit = useMemo(() => ({ ...LINE, background: palette.accent }), [palette.accent]);

  const end = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!start.current) return;
    start.current = null;
    setActive(false);
    document.body.style.userSelect = '';
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title="Drag to resize, double-click to reset"
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault();
        start.current = { x: event.clientX, width };
        setActive(true);
        // A drag that crosses text would select it all the way.
        document.body.style.userSelect = 'none';
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        if (start.current) onResize(start.current.width + (event.clientX - start.current.x) * direction);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={STRIP_AT[edge]}>
      {/* The border itself lights up under the pointer: what moves is what is shown. */}
      <div style={active || hover ? lit : LINE} />
    </div>
  );
}
