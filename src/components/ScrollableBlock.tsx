import React, { useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { font, scaleFont, space, useThemedStyles, type Palette } from '../theme';

/**
 * How tall a block inside a tool card is allowed to grow before it is folded. Roughly fourteen
 * monospace lines: long enough that most outputs never reach it, short enough that one of them
 * cannot bury the answer that follows.
 */
export const BLOCK_MAX_HEIGHT = 260;

/**
 * A block of tool text that refuses to take over the thread: capped, with a bar that unfolds it
 * in place. Arguments, outputs, diffs, a sub-agent's task and result, a fenced block in an
 * answer -- every long block in a conversation, on every platform.
 *
 * One behaviour, deliberately. A nested scroll area was tried on the web, where the platform
 * allows it (the wheel and a scrollbar), and it was the wrong call twice over. It disagreed with
 * the phone, where a ScrollView inside the inverted chat list disputes every drag with the list
 * and loses (docs/text-selection.md), so the same card answered the same gesture in two ways. And
 * a scrollbar inside a card inside a scrolling thread is a trap in its own right: three nested
 * scroll areas, and the reader finds out which one moved after the fact.
 *
 * The thread is the scroll area. A block is either short enough to read where it is, or unfolded
 * into the thread and read by scrolling it. Taking the text out is a different intent and has its
 * own control (`BlockActions`: copy, and select, which opens the full-screen viewer).
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

  const onLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    setClipped(current => (current === height >= BLOCK_MAX_HEIGHT ? current : height >= BLOCK_MAX_HEIGHT));
  };

  return (
    <View>
      {/* The measured child stays mounted whether it is clipped or not: its natural height is
          what decides the bar, so it has to be measured at that height either way. */}
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

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  clip: { maxHeight: BLOCK_MAX_HEIGHT, overflow: 'hidden' as const },
  more: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
    paddingVertical: space.xs,
  },
  moreLabel: { fontSize: scaleFont(font.micro, scale), color: palette.accent, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  moreChevron: { fontSize: scaleFont(font.micro, scale), color: palette.accent },
});
