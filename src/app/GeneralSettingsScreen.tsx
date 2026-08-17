import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import type { DeviceInfo } from '../core/device';
import type { WsStatusPayload } from '../core/types';
import type { UpdateResultFrame, VoiceMode, VoiceModeResultFrame } from '../core/protocol';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

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

/**
 * What the update button has to say, in the order the states actually happen.
 *
 * The server answers before its own service goes down, so `started` is a promise that the socket
 * is about to drop, never a report that something was installed. The verdict is the version of the
 * `hello` after reconnecting: a different one means the swap happened, the same one means the
 * registry had nothing newer, and saying "updated" in that case would be a lie the screen tells
 * every 15 minutes anyway.
 */
function updateHint(
  update: UpdateResultFrame | null,
  asked: boolean,
  serverVersion: string | null,
  connected: boolean,
): string {
  if (asked) return 'asking the server…';
  if (!update) {
    return connected
      ? 'runs the same check the server does every 15 minutes, now'
      : 'connect to the server to run an update';
  }
  if (!update.started) {
    if (update.reason === 'busy') return 'a run is in flight · an update would interrupt it, try again after';
    if (update.reason === 'denied') return 'the server may not start the update unit (sudoers drop-in missing)';
    return 'the server could not start the update';
  }
  if (!connected) return `update started from ${update.version} · the server is restarting`;
  if (serverVersion && serverVersion !== update.version) {
    return `updated ${update.version} → ${serverVersion}`;
  }
  return `still on ${update.version} · nothing newer in the registry, or the swap is not done`;
}

/** Keeps the last four characters visible so the pair can be recognized, nothing more. */
function maskToken(token: string): string {
  return `${'•'.repeat(Math.max(token.length - 4, 0))}${token.slice(-4)}`;
}

export function GeneralSettingsScreen({
  url,
  onUrlChange,
  status,
  serverVersion,
  appVersion,
  pending,
  deviceInfo,
  onConnect,
  onDisconnect,
  onClearOutbox,
  onBack,
  voice,
  onVoiceModeChange,
  update,
  updateAsked,
  onUpdateServer,
}: {
  url: string;
  onUrlChange: (url: string) => void;
  status: WsStatusPayload;
  /** The version the connected server announced (`hello` frame); null until it speaks. */
  serverVersion: string | null;
  /** The running build's version name; null until the native side answers. */
  appVersion: string | null;
  pending: number;
  deviceInfo: DeviceInfo | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onClearOutbox: () => void;
  onBack: () => void;
  /** Null until the server has answered voice.mode.get. */
  voice: VoiceModeResultFrame | null;
  onVoiceModeChange: (mode: VoiceMode) => void;
  /** The server's last word on a manual update; null when none was asked this session. */
  update: UpdateResultFrame | null;
  /** An update was asked and the server has not answered yet. */
  updateAsked: boolean;
  onUpdateServer: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  // the server field is never focused on the way in.
  useDismissKeyboard();
  const { palette } = useTheme();
  const connected = status.state === 'connected';
  const busy = connected || status.state === 'connecting';
  /**
   * The socket keeps running on the address it was started with, so editing the field alone
   * would leave the screen showing one server while the app talks to another.
   */
  const elsewhere = busy && Boolean(status.url) && status.url !== url.trim();
  /**
   * An update was started and the server has not come back with a different version yet. The
   * button stays out of reach for that window: the service is stopping, and a second request
   * would only queue a systemd job behind the one already swapping.
   */
  const waiting = update?.started === true && (!connected || serverVersion === update.version);
  const [showToken, setShowToken] = useState(false);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to settings">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.title}>General</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.categoryItem}>
          <Text style={styles.section}>device</Text>
          <View style={styles.card}>
            {deviceInfo ? (
              <>
                <View style={styles.kv}>
                  <Text style={styles.key}>app</Text>
                  <Text style={styles.value}>{appVersion ?? '…'}</Text>
                </View>
                {deviceInfo.deviceId ? (
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
                  // A browser has no credential to show: the session cookie is HttpOnly, which
                  // is the point. Blank device and token rows would read as a broken pairing.
                  <Text style={styles.hint}>browser session · paired device managed server side</Text>
                )}
              </>
            ) : (
              <Text style={styles.hint}>device not initialized</Text>
            )}
          </View>
        </View>

        <View style={styles.categoryItem}>
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
                {`${status.state}${serverVersion ? ` · v${serverVersion}` : ''}${
                  status.attempts ? ` · attempt ${status.attempts}` : ''
                }`}
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

        <View style={styles.categoryItem}>
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

        <View style={styles.categoryItem}>
          <Text style={styles.section}>maintenance</Text>
          <View style={styles.card}>
            <Pressable
              style={[styles.button, (!connected || updateAsked || waiting) && styles.buttonOff]}
              disabled={!connected || updateAsked || waiting}
              onPress={onUpdateServer}
              accessibilityRole="button"
              accessibilityLabel="Update the server now">
              <Text style={styles.buttonText}>{updateAsked ? 'Asking…' : 'Update server'}</Text>
            </Pressable>
            <Text style={styles.hint}>{updateHint(update, updateAsked, serverVersion, connected)}</Text>
            {update?.detail && !update.started ? (
              <Text style={styles.hint} numberOfLines={3}>
                {update.detail}
              </Text>
            ) : null}
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
  categoryItem: { marginTop: space.lg },
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
