import React from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { DeviceInfo } from '../core/device';
import type { WsStatusPayload } from '../core/types';
import type { ThemeMode } from '../core/prefs';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';

const THEME_OPTIONS: Array<{ mode: ThemeMode; label: string }> = [
  { mode: 'system', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
];

export function SettingsScreen({
  url,
  onUrlChange,
  themeMode,
  onThemeModeChange,
  status,
  pending,
  deviceInfo,
  onConnect,
  onDisconnect,
  onClearOutbox,
  onBack,
}: {
  url: string;
  onUrlChange: (url: string) => void;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  status: WsStatusPayload;
  pending: number;
  deviceInfo: DeviceInfo | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onClearOutbox: () => void;
  onBack: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette, dark } = useTheme();
  const connected = status.state === 'connected';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to chat">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.category}>
          <Text style={styles.section}>appearance</Text>
          <View style={styles.card}>
            <View style={styles.segment}>
              {THEME_OPTIONS.map(option => {
                const selected = option.mode === themeMode;
                return (
                  <Pressable
                    key={option.mode}
                    style={[styles.segmentItem, selected && styles.segmentItemActive]}
                    onPress={() => onThemeModeChange(option.mode)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Theme ${option.label}`}>
                    <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>
              {themeMode === 'system' ? `follows the phone · currently ${dark ? 'dark' : 'light'}` : 'forced choice'}
            </Text>
          </View>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>server</Text>
          <View style={styles.card}>
            <TextInput
              style={styles.input}
              value={url}
              onChangeText={onUrlChange}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="wss://server/mobile"
              placeholderTextColor={palette.textFaint}
              accessibilityLabel="Server address"
            />
            <View style={styles.row}>
              <Pressable
                style={[styles.button, (connected || status.state === 'connecting') && styles.buttonOff]}
                onPress={onConnect}
                disabled={connected || status.state === 'connecting'}
                accessibilityRole="button">
                <Text style={styles.buttonText}>Connect</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.buttonGhost, !connected && status.state !== 'connecting' && styles.buttonOff]}
                onPress={onDisconnect}
                disabled={!connected && status.state !== 'connecting'}
                accessibilityRole="button">
                <Text style={[styles.buttonText, styles.buttonGhostText]}>Disconnect</Text>
              </Pressable>
            </View>
            <View style={styles.kv}>
              <Text style={styles.key}>state</Text>
              <Text style={styles.value}>
                {status.state}
                {status.attempts ? ` · attempt ${status.attempts}` : ''}
              </Text>
            </View>
            {status.reason ? (
              <View style={styles.kv}>
                <Text style={styles.key}>reason</Text>
                <Text style={styles.value} numberOfLines={2}>
                  {status.reason}
                </Text>
              </View>
            ) : null}
            <View style={styles.kv}>
              <Text style={styles.key}>send queue</Text>
              <Text style={styles.value}>{pending === 0 ? 'empty' : `${pending} pending`}</Text>
            </View>
            {pending > 0 ? (
              <Pressable style={[styles.button, styles.buttonGhost]} onPress={onClearOutbox} accessibilityRole="button">
                <Text style={[styles.buttonText, styles.buttonGhostText]}>Clear queue</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>device</Text>
          <View style={styles.card}>
            {deviceInfo ? (
              <>
                <View style={styles.kv}>
                  <Text style={styles.key}>device</Text>
                  <Text style={[styles.value, styles.mono]} selectable>
                    {deviceInfo.deviceId}
                  </Text>
                </View>
                <View style={styles.kv}>
                  <Text style={styles.key}>token</Text>
                  <Text style={[styles.value, styles.mono]} selectable>
                    {deviceInfo.token}
                  </Text>
                </View>
                <Text style={styles.hint}>paste into channels.mobile.devices on the server</Text>
              </>
            ) : (
              <Text style={styles.hint}>device not initialized</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  backGlyph: { fontSize: 26, lineHeight: 28, color: palette.text },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  body: { paddingBottom: space.xl },
  category: { marginTop: space.lg },
  section: {
    marginBottom: space.xs,
    paddingHorizontal: space.xs,
    fontSize: font.micro,
    color: palette.textFaint,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  segment: {
    flexDirection: 'row' as const,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    padding: 2,
    gap: 2,
  },
  segmentItem: { flex: 1, alignItems: 'center' as const, paddingVertical: 10, borderRadius: radius.sm - 1 },
  segmentItemActive: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  segmentText: { fontSize: font.meta, color: palette.textMuted },
  segmentTextActive: { color: palette.text, fontWeight: '600' as const },
  hint: { fontSize: font.small, color: palette.textFaint },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: font.body,
    color: palette.text,
    backgroundColor: palette.surfaceAlt,
  },
  row: { flexDirection: 'row' as const, gap: space.sm },
  button: {
    flex: 1,
    backgroundColor: palette.accent,
    borderRadius: radius.sm,
    paddingVertical: 11,
    alignItems: 'center' as const,
  },
  buttonGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: palette.border },
  buttonOff: { opacity: 0.4 },
  buttonText: { color: palette.accentText, fontSize: font.meta, fontWeight: '600' as const },
  buttonGhostText: { color: palette.text },
  kv: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: space.md },
  key: { width: 90, fontSize: font.meta, color: palette.textFaint },
  value: { flex: 1, fontSize: font.meta, color: palette.text },
  mono: { fontFamily: 'monospace', fontSize: font.small },
});
