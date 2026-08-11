import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useTheme } from '../theme';

/**
 * The system scrollbar is an overlay Android draws over the right edge of a scrolling view,
 * and it covers the items it passes. Rather than fight it per platform, every list hides it
 * (`showsVerticalScrollIndicator={false}`) and gets a thin themed bar of its own, driven by
 * the same scroll events, that fades in while scrolling and out again a second after.
 *
 * Spread `scrollProps` on the scrollable, render `indicator` as a sibling inside the
 * (relatively positioned) container that bounds it, and hand the screen's own onScroll to the
 * hook: the two run in the same handler. `onLayout` is forwarded the same way, so a screen can
 * react to its own viewport resizing (the keyboard opening, for instance).
 */
const THUMB_MIN = 24;
const HIDE_DELAY_MS = 1000;

export function useScrollIndicator(
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void,
  onContentSizeChange?: (width: number, height: number) => void,
  onLayout?: (event: LayoutChangeEvent) => void,
): {
  scrollProps: {
    showsVerticalScrollIndicator: boolean;
    scrollEventThrottle: number;
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    onLayout: (event: LayoutChangeEvent) => void;
    onContentSizeChange: (width: number, height: number) => void;
    onScrollBeginDrag: () => void;
    onScrollEndDrag: () => void;
    onMomentumScrollEnd: () => void;
  };
  indicator: React.JSX.Element | null;
} {
  const { palette } = useTheme();
  const scrollY = useRef(new Animated.Value(0)).current;
  const visible = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const show = useCallback(() => {
    visible.setValue(1);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => visible.setValue(0), HIDE_DELAY_MS);
  }, [visible]);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => visible.setValue(0), HIDE_DELAY_MS);
  }, [visible]);

  const onScrollEvent = useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        {
          // Native events on a bare FlatList require an Animated-wrapped component; the JS
          // driver updates this one 3px thumb per frame without the swap, at no visible cost.
          useNativeDriver: false,
          listener: (event: NativeSyntheticEvent<unknown>) => {
            show();
            onScroll?.(event as NativeSyntheticEvent<NativeScrollEvent>);
          },
        },
      ),
    [onScroll, scrollY, show],
  );

  const overflows = viewport > 0 && content > viewport + 1;
  const thumbHeight = overflows ? Math.max(THUMB_MIN, (viewport * viewport) / content) : 0;
  const translateY = scrollY.interpolate({
    inputRange: [0, Math.max(content - viewport, 1)],
    outputRange: [0, Math.max(viewport - thumbHeight, 0)],
    extrapolate: 'clamp',
  });

  return {
    scrollProps: {
      showsVerticalScrollIndicator: false,
      scrollEventThrottle: 16,
      onScroll: onScrollEvent,
      onLayout: (event: LayoutChangeEvent) => {
        setViewport(event.nativeEvent.layout.height);
        onLayout?.(event);
      },
      onContentSizeChange: (width: number, height: number) => {
        setContent(height);
        onContentSizeChange?.(width, height);
      },
      onScrollBeginDrag: show,
      onScrollEndDrag: scheduleHide,
      onMomentumScrollEnd: scheduleHide,
    },
    indicator: overflows ? (
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="scroll-indicator"
        style={[styles.track, { opacity: visible }]}>
        <Animated.View
          testID="scroll-indicator-thumb"
          style={[
            styles.thumb,
            { height: thumbHeight, backgroundColor: palette.textFaint, transform: [{ translateY }] },
          ]}
        />
      </Animated.View>
    ) : null,
  };
}

const styles = {
  track: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    right: 1,
    width: 3,
  },
  thumb: {
    width: 3,
    borderRadius: 2,
    opacity: 0.55,
  },
};
