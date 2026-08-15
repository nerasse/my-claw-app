import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { CopyButton } from './CopyButton';
import { useOpenSelection } from '../core/textSelection';
import { font, space, useThemedStyles, type Palette } from '../theme';

/**
 * What a block of text inside the thread offers: take all of it, or go and pick a piece.
 *
 * Both are buttons because neither can be a gesture here. A selection cannot cross a Text node
 * and cannot be started inside the chat list without throwing it to the other end, so `select`
 * opens the viewer where it can (docs/text-selection.md), and `copy` covers the common case
 * without leaving the conversation at all.
 */
export function BlockActions({ title, value }: { title: string; value: string }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const openSelection = useOpenSelection();

  return (
    <View style={styles.row}>
      <CopyButton value={value} accessibilityLabel={`Copy ${title.toLowerCase()}`} />
      <Pressable
        hitSlop={10}
        onPress={() => openSelection({ title, body: value })}
        accessibilityRole="button"
        accessibilityLabel={`Select text in ${title.toLowerCase()}`}>
        <Text style={styles.select}>select</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  select: { fontSize: font.micro, color: palette.accent, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
});
