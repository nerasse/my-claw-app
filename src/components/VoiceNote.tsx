import React from 'react';
import { Text, View } from 'react-native';
import { VoicePlayer } from './VoicePlayer';
import type { DownloadTarget } from '../core/download';
import type { AttachmentMeta } from '../core/protocol';
import { font, scaleFont, space, useThemedStyles, type Palette } from '../theme';

/** A sent voice note: the shared player, plus what the server heard in it. */
export function VoiceNote({
  att,
  uri,
  transcript,
  onAccent,
  download,
}: {
  att: AttachmentMeta;
  /** The server copy, saved by the arrow under the waveform. */
  download?: DownloadTarget;
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
      <VoicePlayer id={att.id} uri={uri} durationMs={att.durationMs} onAccent={onAccent} download={download} />
      {transcript ? (
        <Text style={[styles.transcript, onAccent && styles.transcriptOnAccent]}>
          {transcript}
        </Text>
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  wrap: { marginBottom: space.xs, gap: 3, minWidth: 210 },
  /**
   * The transcript sits inside the bubble instead of arriving as its own message: what was said
   * and the recording of it are one thing, and a separate echo pushed the conversation apart.
   *
   * It takes the bubble's width, like every other text. A `maxWidth: 260` used to sit here, from
   * when a bubble was sized by its content -- 260 *was* the width of a voice bubble then. Bubbles
   * became full width on 2026-08-31 and the cap stayed, so the words filled 30% of a desktop
   * bubble and stopped 110pt short of the edge on a phone; being a fixed pt, it also bit harder
   * the larger the message-size setting (owner, 2026-09-20).
   */
  transcript: {
    fontSize: scaleFont(font.small, scale),
    color: palette.textMuted,
    fontStyle: 'italic' as const,
  },
  transcriptOnAccent: { color: palette.onAccentMuted },
});
