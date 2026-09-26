import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageZoom } from '@likashefqet/react-native-image-zoom';
import { deviceBridge, useTransferProgress } from '../core/nativeBridge';
import { pointerActivityProps, pointerHoverProps } from '../core/webProps';
import { DownloadControl } from '../components/DownloadControl';
import type { MediaItem } from '../components/MediaCarousel';
import { font, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { viewerControlsVisible, VIEWER_TICK_MS } from './viewerControls';

/** Images at or above this size are downloaded to the cache with a progress overlay first. */
const CACHE_THRESHOLD = 2 * 1024 * 1024;

/**
 * Full-screen gallery: pinch to zoom, double-tap to toggle, swipe or arrow to the next picture of
 * the run, and a tap that pops the controls (name, counter and close cross on top, save at the
 * bottom). A lone picture is a gallery of one, so nothing has two behaviours.
 *
 * Deliberately not a Modal. On Android a Modal is its own window, which sits outside the
 * app's GestureHandlerRootView, and gestures there are simply never recognised: no zoom, no
 * tap, so the controls could not even be brought back once hidden. Rendered instead as an
 * absolute layer of the shell, above the padded container, so it covers the screen while
 * living inside the gesture root.
 *
 * The bars follow one rule on both platforms, from `viewerControls`: activity reveals, idleness
 * hides. A tap is activity on a phone; on web a mouse move is too, which is the gesture a desktop
 * expects and the one it did not have -- the bars vanished five seconds in and the only thing
 * that brought them back was a click, which on a zoomable picture is also a zoom (owner,
 * 2026-09-17). A pointer resting on the bars themselves holds them up.
 */
export function ImageViewer({
  images,
  index,
  onClose,
}: {
  /** The run of pictures this visit belongs to, in the order the thread showed them. */
  images: MediaItem[];
  /** Which one was tapped: the gallery opens there, not on the first. */
  index: number;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  // opened from a bubble, with the composer's keyboard still up behind it.
  useDismissKeyboard();
  // An absolutely positioned child is laid out against the shell's outer box, so the layer
  // already spans the status bar: the photo owns the screen at top 0, and only the bars have
  // to keep clear of it. Offsetting the stage instead pushed them under the status bar.
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [at, setAt] = useState(Math.max(0, Math.min(index, images.length - 1)));
  const [controlsVisible, setControlsVisible] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  // null = not cached yet (or not needed); a string = local copy to render.
  const [cacheUri, setCacheUri] = useState<string | null>(null);
  // Dense on web -- a mouse crossing the screen -- so it is a ref: no render per event.
  const lastActivityAt = useRef(Date.now());
  const pager = useRef<ScrollView>(null);

  const current = images[at];
  const url = current?.url ?? '';
  const filename = current?.filename ?? '';
  const sizeBytes = current?.sizeBytes;

  const needsCache = !!sizeBytes && sizeBytes >= CACHE_THRESHOLD;
  const cacheId = needsCache ? `image-cache-${filename}` : null;
  const cacheProgress = useTransferProgress(cacheId);

  useEffect(() => {
    if (!needsCache) return;
    let cancelled = false;
    setCacheUri(null);
    deviceBridge
      .cacheFile(url, filename, cacheId!)
      .then(res => {
        if (!cancelled) setCacheUri(res.uri);
      })
      .catch(() => {
        // Fall back to the direct network fetch; the image just appears without progress.
        if (!cancelled) setCacheUri('');
      });
    return () => {
      cancelled = true;
    };
  }, [cacheId, filename, needsCache, url]);

  const activity = useCallback((): void => {
    lastActivityAt.current = Date.now();
    setControlsVisible(true);
  }, []);

  const hover = useCallback(
    (on: boolean): void => {
      if (on) activity();
      else lastActivityAt.current = Date.now();
      setHovering(on);
    },
    [activity],
  );

  // One tick, not one timeout per event: the bars fall only when the clock says so, and a pointer
  // resting on them suspends the count. Nothing to tick once they are down -- only an activity
  // brings them back, and that sets the state directly.
  useEffect(() => {
    if (!controlsVisible) return;
    const timer = setInterval(() => {
      setControlsVisible(viewerControlsVisible({ visible: true, hovering, lastActivityAt: lastActivityAt.current }, Date.now()));
    }, VIEWER_TICK_MS);
    return () => clearInterval(timer);
  }, [controlsVisible, hovering]);

  useEffect(() => {
    if (!savedTo) return;
    const timer = setTimeout(() => setSavedTo(null), 4000);
    return () => clearTimeout(timer);
  }, [savedTo]);

  const goTo = useCallback(
    (next: number): void => {
      const clamped = Math.max(0, Math.min(images.length - 1, next));
      setAt(clamped);
      pager.current?.scrollTo({ x: clamped * width, animated: true });
    },
    [images.length, width],
  );

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    if (width <= 0) return;
    const landed = Math.round(event.nativeEvent.contentOffset.x / width);
    setAt(Math.max(0, Math.min(images.length - 1, landed)));
  };

  const percent = cacheProgress && cacheProgress.total > 0
    ? Math.round((cacheProgress.bytes / cacheProgress.total) * 100)
    : null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.stage]} {...pointerActivityProps(activity)}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: at * width, y: 0 }}
        onMomentumScrollEnd={onScrollEnd}
        style={StyleSheet.absoluteFill}
      >
        {images.map((item, i) => (
          <View key={`${item.url}-${i}`} style={[styles.page, { width }]}>
            {i === at && needsCache && cacheUri === null ? (
              <View style={styles.image}>
                {percent !== null ? (
                  <View style={styles.cacheBox}>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.cacheText}>loading {percent}%</Text>
                  </View>
                ) : (
                  <ActivityIndicator color="#fff" />
                )}
              </View>
            ) : (
              <ImageZoom
                // Only the page on screen carries the cached copy; the others hold their network
                // url, which is what they will be fetched from when they arrive.
                uri={i === at ? cacheUri || item.url : item.url}
                minScale={1}
                maxScale={6}
                doubleTapScale={3}
                isSingleTapEnabled
                isDoubleTapEnabled
                onSingleTap={() => {
                  // Hiding them by hand is a decision, not idleness: the clock must not undo it one
                  // tick later, so the countdown is reset instead of restarted.
                  if (controlsVisible) {
                    lastActivityAt.current = 0;
                    setControlsVisible(false);
                  } else {
                    activity();
                  }
                }}
                style={styles.image}
                resizeMode="contain"
              />
            )}
          </View>
        ))}
      </ScrollView>

      {images.length > 1 && controlsVisible ? (
        <>
          <Pressable
            style={[styles.nav, styles.navLeft, at === 0 ? styles.navOff : null]}
            onPress={() => {
              activity();
              goTo(at - 1);
            }}
            disabled={at === 0}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Previous image"
          >
            <Text style={styles.navGlyph}>‹</Text>
          </Pressable>
          <Pressable
            style={[styles.nav, styles.navRight, at === images.length - 1 ? styles.navOff : null]}
            onPress={() => {
              activity();
              goTo(at + 1);
            }}
            disabled={at === images.length - 1}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Next image"
          >
            <Text style={styles.navGlyph}>›</Text>
          </Pressable>
        </>
      ) : null}

      {controlsVisible ? (
        <>
          <View
            style={[styles.topBar, { paddingTop: insets.top + space.md }]}
            {...pointerHoverProps(hover)}
          >
            <Text style={styles.title} numberOfLines={1}>
              {filename}
            </Text>
            {savedTo ? <Text style={styles.savedInBar}>{savedTo}</Text> : null}
            {images.length > 1 ? (
              <Text style={styles.counter}>{`${at + 1}/${images.length}`}</Text>
            ) : null}
            <DownloadControl
              targets={[{ url, filename }]}
              all={images.map(item => ({ url: item.url, filename: item.filename }))}
              gallery
              tone="light"
              onMessage={setSavedTo}
            />
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Close image"
            >
              <Text style={styles.closeGlyph}>✕</Text>
            </Pressable>
          </View>

        </>
      ) : null}
    </View>
  );
}

const createStyles = (_palette: Palette) => ({
  stage: { backgroundColor: '#000' },
  page: { height: '100%' as const },
  image: { width: '100%' as const, height: '100%' as const },
  nav: {
    position: 'absolute' as const,
    top: '50%' as const,
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  navLeft: { left: space.md },
  navRight: { right: space.md },
  navOff: { opacity: 0.25 },
  navGlyph: { color: '#fff', fontSize: 24, lineHeight: 28 },
  counter: { color: '#fff', fontSize: font.small, opacity: 0.8 },
  topBar: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: font.body,
    fontWeight: '600' as const,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  closeGlyph: { fontSize: 17, lineHeight: 20, color: '#fff' },
  cacheBox: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.md,
  },
  cacheText: { color: '#cfd6e4', fontSize: font.body },
  savedInBar: { color: '#cfd6e4', fontSize: font.small },
});
