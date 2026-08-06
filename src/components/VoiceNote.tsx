import React from 'react';
import { Text, View } from 'react-native';
import { VoicePlayer } from './VoicePlayer';
import type { AttachmentMeta } from '../core/protocol';
import { font, space, useThemedStyles, type Palette } from '../theme';

/** A sent voice note: the shared player, plus what the server heard in it. */
export function VoiceNote({
  att,
  uri,
  transcript,
  onAccent,
}: {
  att: AttachmentMeta;
  /** Local file while the note is still on this device, else the authenticated media url. */
  uri: string;
  /** Filled in once the server reports what it heard. */
  transcript?: string;
  /** Sitting on an accent-filled bubble, where the page colours have no contrast left. */
  onAccent?: boolean;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.wrap}>
      <VoicePlayer id={att.id} uri={uri} durationMs={att.durationMs} onAccent={onAccent} />
      {transcript ? (
        <Text style={[styles.transcript, onAccent && styles.transcriptOnAccent]}>
          {transcript}
        </Text>
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  wrap: { marginBottom: space.xs, gap: 3, minWidth: 210 },
  /**
   * The transcript sits inside the bubble instead of arriving as its own message: what was said
   * and the recording of it are one thing, and a separate echo pushed the conversation apart.
   */
  transcript: {
    fontSize: font.small,
    color: palette.textMuted,
    fontStyle: 'italic' as const,
    maxWidth: 260,
  },
  transcriptOnAccent: { color: palette.onAccentMuted },
});
