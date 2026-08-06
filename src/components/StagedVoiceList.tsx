import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { VoicePlayer } from './VoicePlayer';
import type { PendingAttachment } from '../core/upload';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

/**
 * Roughly two and a half rows. The half is deliberate: a list cut clean at a row boundary looks
 * complete, and a third recording would be invisible until someone thought to drag it.
 */
const MAX_HEIGHT = 124;

/**
 * Takes waiting to be sent, each with the same player the bubbles use.
 *
 * They were compact pills showing only a length. Reviewing a recording before sending it is the
 * whole reason releasing the mic no longer sends, so the composer offers the same seek and
 * playback the conversation does, rather than asking for a decision on a file you can only
 * measure.
 */
export function StagedVoiceList({
  attachments,
  onRemove,
}: {
  attachments: PendingAttachment[];
  onRemove?: (id: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      // Only takes over the gesture once the list is taller than the window it sits in.
      scrollEnabled={attachments.length > 2}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled>
      {attachments.map(attachment => (
        <View key={attachment.id} style={styles.row}>
          <VoicePlayer
            id={attachment.id}
            uri={attachment.uri}
            durationMs={attachment.durationMs}
            trailing={
              onRemove ? (
                <Pressable
                  onPress={() => onRemove(attachment.id)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove voice message">
                  <Text style={styles.remove}>✕</Text>
                </Pressable>
              ) : undefined
            }
          />
        </View>
      ))}
    </ScrollView>
  );
}

const createStyles = (palette: Palette) => ({
  scroll: { maxHeight: MAX_HEIGHT, flexGrow: 0 },
  content: { gap: space.xs },
  row: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: space.md,
    paddingVertical: 4,
  },
  remove: { fontSize: font.meta, lineHeight: 15, color: palette.textMuted },
});
