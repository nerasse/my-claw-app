import React from 'react';
import { Text, View } from 'react-native';
import { CopyButton } from './CopyButton';
import { blockActionsSupported } from '../core/platform';
import { font, scaleFont, space, useThemedStyles, type Palette } from '../theme';

/**
 * The strip over a fenced block: what it is on the left, how to take it on the right.
 *
 * A code block is the one thing in a message that is meant to leave the app verbatim, and it is
 * also the one thing a selection cannot lift out of the chat list (docs/text-selection.md). The
 * button sits in a strip of its own rather than floating over the first line, which on a block
 * whose first line is long would cover the code it is offering to copy.
 *
 * On the web the button is gone and the strip keeps the language alone: the browser selects
 * across nodes and copies with a keystroke, so this was a control repeating a shortcut.
 */
export function CodeBlockBar({ value, language }: { value: string; language?: string }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.bar}>
      <Text style={styles.language} numberOfLines={1}>
        {language ?? ''}
      </Text>
      {blockActionsSupported ? (
        <CopyButton value={value} accessibilityLabel={language ? `Copy ${language} block` : 'Copy code block'} />
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  bar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: space.sm, marginBottom: space.xs },
  // Shrinks so a long language tag never pushes the button off the block.
  language: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint, textTransform: 'uppercase' as const, letterSpacing: 0.4, flexShrink: 1 },
});
