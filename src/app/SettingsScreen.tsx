import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import type { DeviceInfo } from '../core/device';
import type { WsStatusPayload } from '../core/types';
import type { ThemeMode } from '../core/prefs';
import type { VoiceMode, VoiceModeResultFrame } from '../core/protocol';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';

const THEME_OPTIONS: Array<{ mode: ThemeMode; label: string }> = [
  { mode: 'system', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
];

const VOICE_OPTIONS: Array<{ mode: VoiceMode; label: string }> = [
  { mode: 'auto', label: 'Auto' },
  { mode: 'cloud', label: 'Cloud' },
  { mode: 'local', label: 'Local' },
];

/**
 * Says where the voice goes, not just which switch is on. "Local" is about the server's machine,
 * not the phone: the recording leaves the device either way, and that is the part worth stating.
 */
function voiceHint(voice: VoiceModeResultFrame | null): string {
  if (!voice) return 'asking the server…';
  if (!voice.cloudAvailable && voice.mode !== 'local') {
    return 'no cloud key on the server · transcribing locally';
  }
  const where =
    voice.resolved === 'cloud'
      ? 'sent to Groq for transcription'
      : 'transcribed on the server, nothing leaves it';
  return voice.mode === 'auto' ? `auto · ${where}` : where;
}

/** Keeps the last four characters visible so the pair can be recognized, nothing more. */
function maskToken(token: string): string {
  return `${'•'.repeat(Math.max(token.length - 4, 0))}${token.slice(-4)}`;
}

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
  onOpenDiagnostics,
  onOpenSkills,
  voice,
  onVoiceModeChange,
  modelLabel,
  onOpenModel,
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
  onOpenDiagnostics: () => void;
  onOpenSkills: () => void;
  /** Null until the server has answered voice.mode.get. */
  voice: VoiceModeResultFrame | null;
  onVoiceModeChange: (mode: VoiceMode) => void;
  /** Label of the model on the current thread, null while unknown. */
  modelLabel: string | null;
  onOpenModel: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette, dark } = useTheme();
  const connected = status.state === 'connected';
  const busy = connected || status.state === 'connecting';
  /**
   * The socket keeps running on the address it was started with, so editing the field alone
   * would leave the screen showing one server while the app talks to another.
   */
  const elsewhere = busy && Boolean(status.url) && status.url !== url.trim();
  const [showToken, setShowToken] = useState(false);

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
          <Text style={styles.section}>model</Text>
          <View style={styles.card}>
            <Pressable
              style={[styles.row, styles.link]}
              onPress={onOpenModel}
              accessibilityRole="button"
              accessibilityLabel="Choose model">
              <View style={styles.linkMain}>
                <Text style={styles.linkTitle}>{modelLabel ?? '…'}</Text>
                <Text style={styles.hint}>the model this conversation runs on</Text>
              </View>
              <Text style={styles.linkGlyph}>›</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>skills</Text>
          <View style={styles.card}>
            <Pressable
              style={[styles.row, styles.link]}
              onPress={onOpenSkills}
              accessibilityRole="button"
              accessibilityLabel="Open skills">
              <View style={styles.linkMain}>
                <Text style={styles.linkTitle}>Skills</Text>
                <Text style={styles.hint}>built-in, custom and workspace skills</Text>
              </View>
              <Text style={styles.linkGlyph}>›</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>voice</Text>
          <View style={styles.card}>
            <View style={styles.segment}>
              {VOICE_OPTIONS.map(option => {
                const selected = voice ? option.mode === voice.mode : false;
                // Offering cloud without credentials would be a choice that fails on the next
                // recording, with the failure surfacing far from here.
                const usable = option.mode === 'local' || (voice?.cloudAvailable ?? true);
                return (
                  <Pressable
                    key={option.mode}
                    style={[
                      styles.segmentItem,
                      selected && styles.segmentItemActive,
                      !usable && styles.segmentItemOff,
                    ]}
                    disabled={!voice || !usable}
                    onPress={() => onVoiceModeChange(option.mode)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: !usable }}
                    accessibilityLabel={`Transcription ${option.label}`}>
                    <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>{voiceHint(voice)}</Text>
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
              placeholder="wss://server/my-claw-app"
              placeholderTextColor={palette.textFaint}
              accessibilityLabel="Server address"
            />
            {elsewhere ? (
              <Text style={styles.hint} accessibilityLabel="Live server differs">
                {`still talking to ${status.url} · reconnect to apply`}
              </Text>
            ) : null}
            <View style={styles.row}>
              <Pressable
                style={[styles.button, busy && !elsewhere && styles.buttonOff]}
                onPress={onConnect}
                disabled={busy && !elsewhere}
                accessibilityRole="button"
                accessibilityLabel={elsewhere ? 'Reconnect to the new server' : 'Connect'}>
                <Text style={styles.buttonText}>{elsewhere ? 'Reconnect' : 'Connect'}</Text>
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
                  <Text style={[styles.value, styles.mono]} selectable={showToken}>
                    {showToken ? deviceInfo.token : maskToken(deviceInfo.token)}
                  </Text>
                  <Pressable
                    onPress={() => setShowToken(value => !value)}
                    hitSlop={8}
                    style={styles.toggle}
                    accessibilityRole="button"
                    accessibilityLabel={showToken ? 'Hide token' : 'Show token'}>
                    <Text style={styles.toggleText}>{showToken ? 'hide' : 'show'}</Text>
                  </Pressable>
                </View>
                <Pressable
                  style={[styles.button, styles.buttonGhost]}
                  onPress={() =>
                    Clipboard.setString(`device: ${deviceInfo.deviceId}\ntoken: ${deviceInfo.token}`)
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Copy device and token">
                  <Text style={[styles.buttonText, styles.buttonGhostText]}>Copy device & token</Text>
                </Pressable>
                <Text style={styles.hint}>paste into channels["my-claw-app"].devices on the server</Text>
              </>
            ) : (
              <Text style={styles.hint}>device not initialized</Text>
            )}
          </View>
        </View>

        <View style={styles.category}>
          <Text style={styles.section}>troubleshooting</Text>
          <View style={styles.card}>
            <Pressable
              style={[styles.button, styles.buttonGhost]}
              onPress={onOpenDiagnostics}
              accessibilityRole="button"
              accessibilityLabel="Open diagnostics">
              <Text style={[styles.buttonText, styles.buttonGhostText]}>Diagnostics</Text>
            </Pressable>
            <Text style={styles.hint}>server snapshot and logs, ready to copy</Text>
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
  segmentItemOff: { opacity: 0.4 },
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
  link: { alignItems: 'center' as const },
  linkMain: { flex: 1, gap: 1 },
  linkTitle: { fontSize: font.body, color: palette.text, fontWeight: '600' as const },
  linkGlyph: { fontSize: font.screen, color: palette.textFaint },
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
  toggle: { paddingVertical: 2, paddingHorizontal: space.xs },
  toggleText: {
    fontSize: font.small,
    color: palette.accent,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
});
