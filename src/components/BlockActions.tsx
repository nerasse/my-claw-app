import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { CopyButton } from './CopyButton';
import { useOpenSelection } from '../core/textSelection';
import { blockActionsSupported } from '../core/platform';
import { font, space, useThemedStyles, type Palette } from '../theme';

/**
 * What a block of text inside the thread offers: take all of it, or go and pick a piece.
 *
 * Both are buttons because neither can be a gesture here. A selection cannot cross a Text node
 * and cannot be started inside the chat list without throwing it to the other end, so `select`
 * opens the viewer where it can (docs/text-selection.md), and `copy` covers the common case
 * without leaving the conversation at all.
 *
 * Nothing at all where the platform can do both itself: on web this renders null, because a
 * browser selects across nodes and copies with a keystroke, and the pair would sit twice on
 * every tool card for no gain.
 */
export function BlockActions({ title, value }: { title: string; value: string }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  const openSelection = useOpenSelection();

  if (!blockActionsSupported) return null;

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
