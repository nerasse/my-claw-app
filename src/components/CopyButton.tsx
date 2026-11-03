import { CheckIcon, CopyIcon } from './icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { radius, useThemedStyles, type Palette } from '../theme';

/** How long the button says "copied" before going back to its label. */
const ACK_MS = 1400;

/**
 * Takes a whole block out of the app in one tap.
 *
 * Selection cannot do this job in place. React Native selects inside a single Text node and no
 * further, and rendered markdown is one node per block; worse, a selectable view inside the
 * inverted chat list throws the thread to the other end when it takes focus. So a block worth
 * copying gets this, and a block worth picking through gets the selection viewer next to it.
 * See docs/text-selection.md.
 *
 * It acknowledges: the clipboard is invisible, and a tap with no feedback reads as a dead button.
 *
 * Two shapes, one behaviour: `label` is the micro-word beside a block, `bar` is the tile that sits
 * in a viewer's top bar next to the zoom and the download -- the same 32px box, so a reader's row
 * of controls stays on one line and one baseline.
 */
export function CopyButton({
  value,
  label = 'copy',
  accessibilityLabel,
  variant = 'label',
}: {
  value: string;
  label?: string;
  accessibilityLabel?: string;
  variant?: 'label' | 'bar';
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The acknowledgement outlives nothing: a bubble scrolled out of the window while its timer
  // is pending would otherwise set state on an unmounted component.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = (): void => {
    Clipboard.setString(value);
    setDone(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), ACK_MS);
  };

  if (variant === 'bar') {
    return (
      <Pressable
        onPress={copy}
        hitSlop={8}
        style={styles.bar}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? 'Copy the whole file'}>
        {done ? (
          <CheckIcon size={17} tone="faint" />
        ) : (
          <CopyIcon size={17} tone="text" />
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      // Four uppercase micro-characters are a small target; the row around them is not.
      hitSlop={10}
      onPress={copy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? 'Copy'}>
      <Text style={[styles.copy, done ? styles.done : null]}>{done ? 'copied' : label}</Text>
    </Pressable>
  );
}

const createStyles = (palette: Palette) => ({
  // In the ink of the block's label, not in the accent: six copy buttons down one open card in
  // the accent read as six primary actions, and the block's own text is what the eye should find.
  copy: { fontSize: 10, color: palette.textMeta, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  done: { color: palette.textFaint },
  bar: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
