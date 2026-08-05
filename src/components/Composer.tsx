import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';

export function Composer({
  value,
  onChange,
  onSend,
  hint,
  hero,
  autoFocus,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  /** Shown above the field when something is worth knowing (offline, queued frames). */
  hint?: string;
  /** Large centered variant for empty conversations: the empty state is an invitation to type. */
  hero?: boolean;
  /** Auto-focus only when the user just created the thread, never at boot. */
  autoFocus?: boolean;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const empty = value.trim().length === 0;
  return (
    <View style={[styles.wrap, hero && styles.wrapHero]}>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.row}>
        <TextInput
          style={[styles.input, hero && styles.inputHero]}
          value={value}
          onChangeText={onChange}
          onSubmitEditing={onSend}
          placeholder={hero ? 'Ask anything' : 'message'}
          placeholderTextColor={palette.textFaint}
          autoFocus={autoFocus}
          multiline
          blurOnSubmit={false}
          accessibilityLabel="Message to send"
        />
        <Pressable
          style={[styles.send, hero && styles.sendHero, empty && styles.sendIdle]}
          onPress={onSend}
          disabled={empty}
          accessibilityRole="button"
          accessibilityLabel="Send message">
          <Svg width={hero ? 22 : 20} height={hero ? 22 : 20} viewBox="0 0 24 24">
            <Path fill={empty ? palette.textFaint : palette.accentText} d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
          </Svg>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  wrap: { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: space.sm, gap: space.xs },
  wrapHero: { borderTopWidth: 0, paddingTop: 0 },
  hint: { fontSize: font.small, color: palette.textMuted, paddingHorizontal: space.xs },
  row: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: space.sm },
  input: {
    flex: 1,
    maxHeight: 112,
    minHeight: 42,
    paddingHorizontal: space.md,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.pill,
    fontSize: font.body,
    color: palette.text,
    backgroundColor: palette.surfaceAlt,
  },
  inputHero: {
    minHeight: 62,
    paddingHorizontal: space.lg,
    paddingVertical: 13,
    borderRadius: radius.lg,
    fontSize: 16,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sendHero: { width: 50, height: 50 },
  sendIdle: { backgroundColor: palette.surfaceAlt, borderWidth: 1, borderColor: palette.border },
});
