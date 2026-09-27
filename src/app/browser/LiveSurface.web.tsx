/**
 * A tab's live picture, driven with a mouse and a keyboard -- docs/browser-live.md in the server
 * repo. The mouse goes through as it is (press, move, release: a drag selects, a hover opens a
 * menu), the wheel scrolls, and the keyboard types into the page once the picture has the focus.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { font, radius, space, useThemedStyles, type Palette } from '../../theme';
import type { LiveFrame } from '../../core/browserLive';
import type { BrowserInput } from '../../core/protocol';
import { LiveImage } from './LiveImage';
import { keyInput } from './surfaceMath';

/** Moves and wheel turns are gathered and sent at this pace. */
const POINTER_EVERY_MS = 50;
const BUTTONS = ['left', 'middle', 'right'] as const;

export function LiveSurface({
  frame,
  interactive,
  onInput,
  maxHeight,
}: {
  frame: LiveFrame | undefined;
  interactive: boolean;
  onInput: (input: BrowserInput) => void;
  /** The picture is fitted in this height too, keeping its proportions. */
  maxHeight?: number;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [measured, setMeasured] = useState(0);
  const [focused, setFocused] = useState(false);
  const ref = useRef<View>(null);
  const sendRef = useRef(onInput);
  sendRef.current = onInput;
  const liveRef = useRef(interactive);
  liveRef.current = interactive;

  const aspect = frame ? frame.height / Math.max(1, frame.width) : 9 / 16;
  const onLayout = useCallback((e: LayoutChangeEvent) => setMeasured(e.nativeEvent.layout.width), []);

  useEffect(() => {
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;
    el.tabIndex = 0;
    const at = (e: MouseEvent, clamp = false): { x: number; y: number } | undefined => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      if (clamp) return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
      return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : undefined;
    };
    // A button pressed on the picture is released on the page even when the mouse left it: a page
    // that never hears the release keeps its button held.
    let pressed = false;
    const send = (input: BrowserInput) => {
      if (liveRef.current) sendRef.current(input);
    };
    let pendingMove: { x: number; y: number } | null = null;
    let moveTimer: ReturnType<typeof setTimeout> | null = null;
    const wheel = { dx: 0, dy: 0, at: { x: 0.5, y: 0.5 }, timer: null as ReturnType<typeof setTimeout> | null };
    const flushMove = () => {
      moveTimer = null;
      if (pendingMove) send({ kind: 'move', ...pendingMove });
      pendingMove = null;
    };
    const flushWheel = () => {
      wheel.timer = null;
      if (wheel.dx || wheel.dy) send({ kind: 'wheel', ...wheel.at, dx: Math.round(wheel.dx), dy: Math.round(wheel.dy) });
      wheel.dx = 0;
      wheel.dy = 0;
    };
    const down = (e: MouseEvent) => {
      const p = at(e);
      if (!p) return;
      e.preventDefault();
      el.focus();
      flushMove();
      pressed = true;
      send({ kind: 'down', ...p, button: BUTTONS[e.button] ?? 'left' });
    };
    const up = (e: MouseEvent) => {
      if (!pressed) return;
      pressed = false;
      const p = at(e, true)!;
      flushMove();
      send({ kind: 'up', ...p, button: BUTTONS[e.button] ?? 'left' });
    };
    const move = (e: MouseEvent) => {
      const p = at(e);
      if (!p) return;
      pendingMove = p;
      moveTimer ??= setTimeout(flushMove, POINTER_EVERY_MS);
    };
    const onWheel = (e: WheelEvent) => {
      const p = at(e);
      if (!p) return;
      e.preventDefault();
      // Lines and pages are what a mouse with notches reports; the page wants pixels.
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
      wheel.at = p;
      wheel.dx += e.deltaX * unit;
      wheel.dy += e.deltaY * unit;
      wheel.timer ??= setTimeout(flushWheel, POINTER_EVERY_MS);
    };
    const key = (e: KeyboardEvent) => {
      // Paste is the browser's own event: the text arrives there, not as keys.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) return;
      const input = keyInput(e);
      if (!input) return;
      e.preventDefault();
      send(input);
    };
    const paste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      send({ kind: 'text', text });
    };
    const menu = (e: MouseEvent) => e.preventDefault();
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    el.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    el.addEventListener('mousemove', move);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('keydown', key);
    el.addEventListener('paste', paste);
    el.addEventListener('contextmenu', menu);
    el.addEventListener('focus', onFocus);
    el.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('mousedown', down);
      window.removeEventListener('mouseup', up);
      el.removeEventListener('mousemove', move);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('keydown', key);
      el.removeEventListener('paste', paste);
      el.removeEventListener('contextmenu', menu);
      el.removeEventListener('focus', onFocus);
      el.removeEventListener('blur', onBlur);
      if (moveTimer) clearTimeout(moveTimer);
      if (wheel.timer) clearTimeout(wheel.timer);
    };
  }, []);

  const width = maxHeight && maxHeight > 0 ? Math.min(measured, maxHeight / aspect) : measured;
  const height = width * aspect;
  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View ref={ref} style={[styles.box, { width, height }, focused && styles.focused]} accessibilityLabel="Live page">
        <LiveImage frame={frame} style={{ width, height }} />
        {frame ? null : <Text style={styles.waiting}>waiting for a picture…</Text>}
      </View>
      {interactive ? (
        <Text style={styles.hint}>{focused ? 'typing goes to the page' : 'click the page to type into it'}</Text>
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  wrap: { width: '100%' as const, gap: space.xs, alignItems: 'center' as const },
  box: {
    overflow: 'hidden' as const,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    outlineWidth: 0,
  },
  focused: { borderColor: palette.accent },
  waiting: { position: 'absolute' as const, top: space.md, left: space.md, color: palette.textFaint, fontSize: font.small },
  hint: { fontSize: font.small, color: palette.textFaint },
});
