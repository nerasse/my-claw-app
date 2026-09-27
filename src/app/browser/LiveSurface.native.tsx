/**
 * A tab's live picture, and the owner's fingers on it -- docs/browser-live.md in the server repo.
 *
 * A VNC client on a phone is a desktop and a mouse pointer to push around with a finger. Here the
 * picture is the page, and the page is touched: a tap clicks exactly where the finger lands, one
 * finger scrolls the page, a pinch zooms the picture (the page stays a desktop page; the finger
 * just reaches a smaller button), two fingers move the zoomed picture.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { font, radius, space, useThemedStyles, type Palette } from '../../theme';
import type { LiveFrame } from '../../core/browserLive';
import type { BrowserInput } from '../../core/protocol';
import { LiveImage } from './LiveImage';
import { clampView, contentPoint, type View2D, wheelDelta } from './surfaceMath';

/** Scroll deltas are gathered and sent at this pace: one input per finger move would flood the link. */
const WHEEL_EVERY_MS = 60;
const MAX_ZOOM = 5;

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
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View2D>({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const pinchBase = useRef<View2D>(view);
  const panBase = useRef<View2D>(view);
  const wheel = useRef({ dx: 0, dy: 0, at: { x: 0.5, y: 0.5 }, lastX: 0, lastY: 0, timer: null as ReturnType<typeof setTimeout> | null });

  const aspect = frame ? frame.height / Math.max(1, frame.width) : 9 / 16;
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const measured = e.nativeEvent.layout.width;
    setBox(current => (current.width === measured ? current : { width: measured, height: 0 }));
  }, []);
  const width = maxHeight && maxHeight > 0 ? Math.min(box.width, maxHeight / aspect) : box.width;
  const height = width * aspect;

  // The gestures are built once and read what they need here: rebuilt at every picture, they would
  // be torn down under a finger that is still on the glass.
  const live = useRef({ size: { width: 0, height: 0 }, page: { width: 0, height: 0 }, interactive, onInput });
  live.current = { size: { width, height }, page: { width: frame?.width ?? 0, height: frame?.height ?? 0 }, interactive, onInput };

  const flushWheel = useCallback(() => {
    const w = wheel.current;
    if (w.timer) clearTimeout(w.timer);
    w.timer = null;
    if (w.dx === 0 && w.dy === 0) return;
    live.current.onInput({ kind: 'wheel', x: w.at.x, y: w.at.y, dx: Math.round(w.dx), dy: Math.round(w.dy) });
    w.dx = 0;
    w.dy = 0;
  }, []);

  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .runOnJS(true)
      .withTestId('liveTap')
      .maxDuration(500)
      .onEnd((e, success) => {
        const { size, interactive: on, onInput: send } = live.current;
        if (!success || !on) return;
        const p = contentPoint({ x: e.x, y: e.y }, viewRef.current, size);
        if (p) send({ kind: 'tap', x: p.x, y: p.y });
      });
    const scroll = Gesture.Pan()
      .runOnJS(true)
      .withTestId('liveScroll')
      .maxPointers(1)
      .minDistance(8)
      .onStart(e => {
        const w = wheel.current;
        w.lastX = e.translationX;
        w.lastY = e.translationY;
        w.at = contentPoint({ x: e.x, y: e.y }, viewRef.current, live.current.size) ?? { x: 0.5, y: 0.5 };
      })
      .onUpdate(e => {
        const { size, page, interactive: on } = live.current;
        if (!on) return;
        const w = wheel.current;
        const d = wheelDelta(e.translationX - w.lastX, e.translationY - w.lastY, viewRef.current.scale, size, page);
        w.lastX = e.translationX;
        w.lastY = e.translationY;
        w.dx += d.dx;
        w.dy += d.dy;
        w.timer ??= setTimeout(flushWheel, WHEEL_EVERY_MS);
      })
      .onFinalize(() => flushWheel());
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .withTestId('livePinch')
      .onStart(() => {
        pinchBase.current = viewRef.current;
      })
      .onUpdate(e => {
        const base = pinchBase.current;
        const scale = Math.min(MAX_ZOOM, Math.max(1, base.scale * e.scale));
        // The point under the fingers stays under them.
        const k = scale / base.scale;
        setView(clampView({ scale, tx: e.focalX - (e.focalX - base.tx) * k, ty: e.focalY - (e.focalY - base.ty) * k }, live.current.size));
      });
    const move = Gesture.Pan()
      .runOnJS(true)
      .minPointers(2)
      .onStart(() => {
        panBase.current = viewRef.current;
      })
      .onUpdate(e => {
        const base = panBase.current;
        setView(clampView({ scale: base.scale, tx: base.tx + e.translationX, ty: base.ty + e.translationY }, live.current.size));
      });
    return Gesture.Simultaneous(Gesture.Simultaneous(pinch, move), Gesture.Race(scroll, tap));
  }, [flushWheel]);

  const zoomed = view.scale > 1.01;
  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <View style={[styles.box, { width, height }]} accessibilityLabel="Live page" collapsable={false}>
          <View
            style={[
              styles.zoom,
              { width, height, transform: [{ translateX: view.tx }, { translateY: view.ty }, { scale: view.scale }] },
            ]}>
            <LiveImage frame={frame} style={{ width, height }} />
          </View>
          {frame ? null : <Text style={styles.waiting}>waiting for a picture…</Text>}
        </View>
      </GestureDetector>
      {zoomed ? (
        <Pressable
          onPress={() => setView({ scale: 1, tx: 0, ty: 0 })}
          style={styles.unzoom}
          accessibilityRole="button"
          accessibilityLabel="Reset zoom">
          <Text style={styles.unzoomText}>1:1</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  wrap: { width: '100%' as const, alignItems: 'center' as const },
  // The zoom is computed around the top left corner: contentPoint inverts exactly this.
  zoom: { transformOrigin: 'top left' },
  box: { overflow: 'hidden' as const, backgroundColor: palette.surfaceAlt, borderRadius: radius.sm },
  waiting: { position: 'absolute' as const, top: space.md, left: space.md, color: palette.textFaint, fontSize: font.small },
  unzoom: {
    position: 'absolute' as const,
    right: space.sm,
    top: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  unzoomText: { fontSize: font.small, color: palette.text },
});
