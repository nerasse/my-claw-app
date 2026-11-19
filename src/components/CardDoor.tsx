import React from 'react';
import { Pressable } from 'react-native';
import { OpenInNewIcon } from './icons';

/**
 * The way into what a card names, drawn right after the name it opens.
 *
 * One control for the three cards that lead somewhere (a launch, a report, a scheduled job's
 * delivery), because they are read as one family and drifted apart when each drew its own: the icon
 * came out grey on two of them (owner, 2026-11-17: "l'icône pour cliquer et rentrer dans la
 * conversation, il n'est pas bleu"). It sits outside the row's own toggle, so a screen reader
 * announces it as the one control it is and it cannot steal the toggle's touch.
 */
export function CardDoor({ label, onPress }: { label: string; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable style={styles.door} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}>
      <OpenInNewIcon size={13} tone="link" />
    </Pressable>
  );
}

const styles = {
  door: { paddingHorizontal: 2, alignItems: 'center' as const, justifyContent: 'center' as const },
};
