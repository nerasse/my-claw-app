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
  const [natural, setNatural] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const clipped = natural > BLOCK_MAX_HEIGHT;

  const onLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    setNatural(current => (current === height ? current : height));
  };

  return (
    <View>
      <View style={[style, clipped && !expanded ? styles.clip : null]}>{children}</View>
      {/* The height that decides the bar is measured here and nowhere else, because a node cannot
          be measured inside the box that caps it: under a `maxHeight` ancestor the layout pass
          reports the capped height, never the natural one, so the block was cut and the bar that
          undoes it never appeared -- the reader was left with text no gesture could reach. This
          copy hangs outside the cap (absolute, so it adds no height of its own) and is the only
          thing that sees the content at full size. It carries `style` so its padding, border and
          width match the real block and both wrap identically.

          It is unmounted once the answer is in. The probe renders the children a second time, in
          full, and the blocks that pay for it are exactly the long ones -- a four-thousand-line
          tool output was laid out twice, forever, to keep answering a question already settled.
          Growth past the cap is one-way here (output is appended, never rewritten), so once
          `clipped` is true nothing it could measure would change the bar. */}
      {clipped ? null : (
        <View
          style={[style, styles.probe]}
          pointerEvents="none"
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onLayout={onLayout}>
          {children}
        </View>
      )}
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
  // Invisible, untouchable, and out of the flow: it exists to be measured. `userSelect` keeps a
  // drag on the web from picking up its text and copying the block twice.
  probe: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    opacity: 0,
    zIndex: -1,
    userSelect: 'none' as const,
  },
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
