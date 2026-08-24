import React, { useCallback, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { blockScrollSupported } from '../core/platform';
import { attachBlockWheel, blockScrollProps } from '../core/webProps';
import { useOpenSelection } from '../core/textSelection';
import { font, space, useThemedStyles, type Palette } from '../theme';

/**
 * How tall a block inside a tool card is allowed to grow. Roughly fourteen monospace lines: long
 * enough that most outputs never hit it, short enough that one of them cannot bury the answer
 * that follows.
 */
export const BLOCK_MAX_HEIGHT = 260;

/**
 * A block of tool text that refuses to take over the thread.
 *
 * Two honest behaviours rather than one broken one. On the web the block gets a real overflow:
 * the wheel scrolls what is under the cursor and the browser draws the scrollbar. On a
 * touchscreen it is capped and clipped, with a bar that opens the full-screen selection viewer,
 * because a ScrollView nested in an inverted chat list disputes every drag with the list and
 * loses in both directions (docs/text-selection.md).
 *
 * Either way nothing is thrown away: `value` is the whole text, and the viewer shows it whole.
 */
export function ScrollableBlock({
  title,
  value,
  style,
  children,
}: {
  /** What the viewer's bar says when the block is opened full-screen. */
  title: string;
  /** The full text, whatever is being clipped on screen. */
  value: string;
  style?: ViewStyle | ViewStyle[];
  children: React.ReactNode;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const openSelection = useOpenSelection();
  // Measured, not guessed from the character count: a wrapped line and a font size are the
  // renderer's business, and a block that fits must not offer to be opened.
  const [clipped, setClipped] = useState(false);
  // A ref callback rather than an effect: the node is what the listener needs, and this way it is
  // attached the moment the block mounts and released when it unmounts, with nothing to sync.
  const bindWheel = useCallback((node: View | null) => {
    detachWheel.current?.();
    detachWheel.current = node ? attachBlockWheel(node) : undefined;
  }, []);
  const detachWheel = React.useRef<(() => void) | undefined>(undefined);

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
      <View style={[style, styles.clip]}>
        <View onLayout={onLayout}>{children}</View>
      </View>
      {clipped ? (
        <Pressable
          style={styles.more}
          onPress={() => openSelection({ title, body: value })}
          accessibilityRole="button"
          accessibilityLabel={`Open ${title.toLowerCase()} in full`}>
          <Text style={styles.moreLabel}>see all</Text>
          <Text style={styles.moreChevron}>›</Text>
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
    gap: 2,
    paddingVertical: space.xs,
  },
  moreLabel: { fontSize: font.micro, color: palette.accent, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  moreChevron: { fontSize: font.meta, color: palette.accent },
});
