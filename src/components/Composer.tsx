import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';

export function Composer({
  value,
  onChange,
  onSend,
  hint,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  /** Shown above the field when something is worth knowing (offline, queued frames). */
  hint?: string;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const empty = value.trim().length === 0;
  return (
    <View style={styles.wrap}>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          onSubmitEditing={onSend}
          placeholder="message"
          placeholderTextColor={palette.textFaint}
          multiline
          blurOnSubmit={false}
          accessibilityLabel="Message to send"
        />
        <Pressable
          style={[styles.send, empty && styles.sendIdle]}
          onPress={onSend}
          disabled={empty}
          accessibilityRole="button"
          accessibilityLabel="Send message">
          <Text style={[styles.sendGlyph, empty && styles.sendGlyphIdle]}>↑</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  wrap: { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: space.sm, gap: space.xs },
  hint: { fontSize: font.small, color: palette.textMuted, paddingHorizontal: space.xs },
  row: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: space.sm },
  input: {
    flex: 1,
    maxHeight: 112,
    minHeight: 36,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.pill,
    fontSize: font.body,
    color: palette.text,
    backgroundColor: palette.surfaceAlt,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sendIdle: { backgroundColor: palette.surfaceAlt, borderWidth: 1, borderColor: palette.border },
  sendGlyph: { color: palette.accentText, fontSize: font.screen, fontWeight: '700' as const, lineHeight: 20 },
  sendGlyphIdle: { color: palette.textFaint },
});
