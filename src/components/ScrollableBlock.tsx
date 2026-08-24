import React, { useCallback, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { blockScrollSupported } from '../core/platform';
import { attachBlockWheel, blockScrollProps } from '../core/webProps';
import { font, space, useThemedStyles, type Palette } from '../theme';

/**
 * How tall a block inside a tool card is allowed to grow before it is either scrolled or folded.
 * Roughly fourteen monospace lines: long enough that most outputs never reach it, short enough
 * that one of them cannot bury the answer that follows.
 */
export const BLOCK_MAX_HEIGHT = 260;

/**
 * A block of tool text that refuses to take over the thread.
 *
 * Two behaviours, one per platform, and the platform decides which because of one hard
 * constraint: a ScrollView nested in the inverted chat list disputes every vertical drag with the
 * list and loses in both directions (docs/text-selection.md). So the block scrolls where that is
 * free and grows where it is not.
 *
 * - Web: a real overflow. The wheel scrolls whatever is under the cursor.
 * - Touchscreen: capped, and a bar unfolds it **in place** to its full height. The thread is
 *   already a scroll view, and it is the one gesture that works here -- reading a long output is
 *   then scrolling the conversation, which is what a reader does anyway. It used to open a
 *   full-screen raw-text viewer instead, which answered "let me read the rest of this" by leaving
 *   the conversation and showing something that looked nothing like the card.
 *
 * Taking the text out is a different intent and has its own control: `BlockActions` (copy, and
 * select, which is what opens the viewer).
 */
export function ScrollableBlock({
  title,
  style,
  children,
}: {
  /** What the fold bar announces, e.g. "bash output". */
  title: string;
  style?: ViewStyle | ViewStyle[];
  children: React.ReactNode;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  // Measured, not guessed from the character count: a wrapped line and a font size are the
  // renderer's business, and a block that fits must not offer to be unfolded.
  const [clipped, setClipped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // A ref callback rather than an effect: the node is what the listener needs, and this way it is
  // attached the moment the block mounts and released when it unmounts, with nothing to sync.
  const detachWheel = React.useRef<(() => void) | undefined>(undefined);
  const bindWheel = useCallback((node: View | null) => {
    detachWheel.current?.();
    detachWheel.current = node ? attachBlockWheel(node) : undefined;
  }, []);

  if (blockScrollSupported) {
    return (
      <View ref={bindWheel} style={[style, styles.scroller]} {...blockScrollProps()}>
        {children}
      </View>
    );
  }

  const onLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    setClipped(current => (current === height >= BLOCK_MAX_HEIGHT ? current : height >= BLOCK_MAX_HEIGHT));
  };

  return (
    <View>
      {/* The measured child stays mounted whether it is clipped or not: the height is what
          decides the bar, so it has to be measured at its natural size either way. */}
      <View style={[style, expanded ? null : styles.clip]}>
        <View onLayout={onLayout}>{children}</View>
      </View>
      {clipped ? (
        <Pressable
          style={styles.more}
          onPress={() => setExpanded(value => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${expanded ? 'Fold' : 'Unfold'} ${title.toLowerCase()}`}>
          <Text style={styles.moreChevron}>{expanded ? '▴' : '▾'}</Text>
          <Text style={styles.moreLabel}>{expanded ? 'show less' : 'show all'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  // The height only. Which axis actually scrolls is settled in CSS (webTheme.web.ts,
  // `[data-claw-scroll]`): a React Native `overflow: scroll` means both axes and two permanent
  // bars, which is how a horizontal scrollbar ended up over and under every tool output.
  scroller: { maxHeight: BLOCK_MAX_HEIGHT },
  clip: { maxHeight: BLOCK_MAX_HEIGHT, overflow: 'hidden' as const },
  more: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
    paddingVertical: space.xs,
  },
  moreLabel: { fontSize: font.micro, color: palette.accent, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  moreChevron: { fontSize: font.micro, color: palette.accent },
});
