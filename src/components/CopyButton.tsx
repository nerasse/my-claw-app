import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { font, useThemedStyles, type Palette } from '../theme';

/** How long the button says "copied" before going back to its label. */
const ACK_MS = 1400;

/**
 * Takes a whole block out of the app in one tap.
 *
 * Selection cannot do this job. React Native selects inside a single Text node and no further,
 * and rendered markdown is one node per block: dragging over a reasoning trace or a compaction
 * summary can only ever grab the paragraph the gesture started in. So anything long enough to be
 * worth copying gets this instead of a selection the platform will not let the reader finish.
 *
 * It acknowledges: the clipboard is invisible, and a tap with no feedback reads as a dead button.
 */
export function CopyButton({
  value,
  label = 'copy',
  accessibilityLabel,
}: {
  value: string;
  label?: string;
  accessibilityLabel?: string;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The acknowledgement outlives nothing: a bubble scrolled out of the window while its timer
  // is pending would otherwise set state on an unmounted component.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <Pressable
      // Four uppercase micro-characters are a small target; the row around them is not.
      hitSlop={10}
      onPress={() => {
        Clipboard.setString(value);
        setDone(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), ACK_MS);
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? 'Copy'}>
      <Text style={[styles.copy, done ? styles.done : null]}>{done ? 'copied' : label}</Text>
    </Pressable>
  );
}

const createStyles = (palette: Palette) => ({
  copy: { fontSize: font.micro, color: palette.accent, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  done: { color: palette.textFaint },
});
