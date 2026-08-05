import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { commandQuery, filterCommands, type CommandDef } from '../core/commands';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';

export function Composer({
  value,
  onChange,
  onSend,
  hint,
  hero,
  autoFocus,
  commands,
  onCommandEntered,
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
  /** Server-provided catalog for the slash-menu. */
  commands?: CommandDef[];
  /** The user picked a command from the slash-menu. */
  onCommandEntered?: (command: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const empty = value.trim().length === 0;

  const query = commandQuery(value);
  const menu = query !== null && commands ? filterCommands(query, commands) : null;
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    setSelected(0);
  }, [query]);

  const insert = useCallback(
    (name: string) => {
      onChange(`/${name} `);
      onCommandEntered?.(name);
    },
    [onChange, onCommandEntered],
  );

  const submitOrSelect = useCallback(() => {
    if (menu && menu.length > 0) {
      insert(menu[Math.min(selected, menu.length - 1)]!.name);
      return;
    }
    onSend();
  }, [insert, menu, onSend, selected]);

  const onKeyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (!menu || menu.length === 0) return;
      if (event.nativeEvent.key === 'ArrowDown') {
        setSelected(index => (index + 1) % menu.length);
      } else if (event.nativeEvent.key === 'ArrowUp') {
        setSelected(index => (index - 1 + menu.length) % menu.length);
      }
    },
    [menu],
  );

  return (
    <View style={[styles.wrap, hero && styles.wrapHero]}>
      {menu && menu.length > 0 ? (
        <View style={styles.menu}>
          {menu.map((command, index) => (
            <Pressable
              key={command.name}
              style={[styles.menuItem, index === selected && styles.menuItemSelected]}
              onPress={() => insert(command.name)}
              accessibilityRole="button"
              accessibilityState={{ selected: index === selected }}
              accessibilityLabel={`Command ${command.name}: ${command.description}`}>
              <Text style={styles.menuName}>/{command.name}</Text>
              <Text style={styles.menuDesc} numberOfLines={2}>
                {command.description}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.row}>
        <TextInput
          style={[styles.input, hero && styles.inputHero]}
          value={value}
          onChangeText={onChange}
          onSubmitEditing={submitOrSelect}
          onKeyPress={onKeyPress}
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
  // Inverted dropdown: sits above the field, never over the keyboard.
  menu: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: '100%' as const,
    marginBottom: space.sm,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingVertical: space.xs,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  menuItem: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: 1 },
  menuItemSelected: { backgroundColor: palette.accentSoft },
  menuName: { fontSize: font.meta, fontFamily: 'monospace', color: palette.accent, fontWeight: '600' as const },
  menuDesc: { fontSize: font.small, color: palette.textMuted, lineHeight: 15 },
  row: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: space.sm },
  input: {
    flex: 1,
    maxHeight: 112,
    // Same height as the send button so the two pills align exactly.
    minHeight: 44,
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
    minHeight: 50,
    paddingHorizontal: space.lg,
    paddingVertical: 11,
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
