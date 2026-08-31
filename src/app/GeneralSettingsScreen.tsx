import React, { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import type { UiPrefsResultFrame, VoiceMode, VoiceModeResultFrame } from '../core/protocol';
import type { WsStatusPayload } from '../core/types';
import type { DeviceInfo } from '../core/device';
import {
  updateBusy,
  updateHint,
  updateLabel,
  type UpdatePhase,
} from '../core/serverUpdate';
import {
  appUpdateHint,
  appUpdateLabel,
  type AppUpdatePhase,
} from '../core/appUpdate';
import { font, radius, scaleFont, space, useTheme, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

const VOICE_OPTIONS: Array<{ mode: VoiceMode; label: string }> = [
  { mode: 'auto', label: 'Auto' },
  { mode: 'cloud', label: 'Cloud' },
  { mode: 'local', label: 'Local' },
];

/** The scales offered as a picker, and the label each one shows. 1 = the design size. */
const SCALE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0.85, label: '85%' },
  { value: 1, label: '100%' },
  { value: 1.15, label: '115%' },
  { value: 1.3, label: '130%' },
];

function scaleLabel(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

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
  onOpenPairing,
  onBack,
  voice,
  onVoiceModeChange,
  uiPrefs,
  onUiPrefsChange,
  chatFontScale,
  onChatFontScaleChange,
  updatePhase,
  appUpdatePhase,
  now,
  onUpdateServer,
  onAppUpdate,
  onAppUpdateInstallSettings,
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
  /** Opens the native pairing screen (claim a server-minted device). */
  onOpenPairing: () => void;
  onBack: () => void;
  /** Null until the server has answered voice.mode.get. */
  voice: VoiceModeResultFrame | null;
  onVoiceModeChange: (mode: VoiceMode) => void;
  /** Server-owned display prefs; null until uiPrefs.get is answered. */
  uiPrefs: UiPrefsResultFrame | null;
  onUiPrefsChange: (prefs: { expandTools?: boolean; expandReasoning?: boolean }) => void;
  /** Thread typography scale: 1 = the design sizes. Live, so the picker shows the current one. */
  chatFontScale: number;
  onChatFontScaleChange: (scale: number) => void;
  /** Everything the update button knows, decided in core/serverUpdate.ts. */
  updatePhase: UpdatePhase;
  /** Everything the app update card knows, decided in core/appUpdate.ts. */
  appUpdatePhase: AppUpdatePhase;
  /** Ticks once a second while an update runs, and only then: the clock has one owner. */
  now: number;
  onUpdateServer: () => void;
  /** Starts the app update: download if needed, then install. */
  onAppUpdate: () => void;
  /** Opens Android's "install unknown apps" settings screen. */
  onAppUpdateInstallSettings: () => void;
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
  const busyUpdating = updateBusy(updatePhase);
  const appUpdating = appUpdatePhase.kind === 'downloading' || appUpdatePhase.kind === 'installing' || appUpdatePhase.kind === 'checking';
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
                style={[styles.button, styles.buttonGhost]}
                onPress={onOpenPairing}
                accessibilityRole="button"
                accessibilityLabel="Pair this device with a server-minted code">
                <Text style={[styles.buttonText, styles.buttonGhostText]}>Pair</Text>
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
          <Text style={styles.section}>appearance</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text style={styles.switchTitle}>Always expand tool cards</Text>
                <Text style={styles.hint}>Keep the full tool output visible once a call settles; off (default) folds it back to one line.</Text>
              </View>
              <Switch
                value={uiPrefs?.expandTools ?? false}
                onValueChange={value => onUiPrefsChange({ expandTools: value })}
                disabled={!uiPrefs}
                accessibilityLabel="Always expand tool cards"
                accessibilityRole="switch"
              />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text style={styles.switchTitle}>Always expand reasoning</Text>
                <Text style={styles.hint}>Show the model's thinking block open by default; off (default) leaves it folded.</Text>
              </View>
              <Switch
                value={uiPrefs?.expandReasoning ?? false}
                onValueChange={value => onUiPrefsChange({ expandReasoning: value })}
                disabled={!uiPrefs}
                accessibilityLabel="Always expand reasoning"
                accessibilityRole="switch"
              />
            </View>
          </View>
        </View>

        <View style={styles.categoryItem}>
          <Text style={styles.section}>chat</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text style={styles.switchTitle}>Message size</Text>
                <Text style={styles.hint}>Messages, tools and reasoning (read: everything a conversation draws). 100% is the design size; the reasoning stays one step under the answer whatever this is.</Text>
              </View>
            </View>
            <View style={styles.segment}>
              {SCALE_OPTIONS.map(option => {
                const selected = Math.abs(chatFontScale - option.value) < 0.001;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.segmentItem, selected && styles.segmentItemActive]}
                    onPress={() => onChatFontScaleChange(option.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Message size ${option.label}`}>
                    <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>
              {`current ${scaleLabel(chatFontScale)} · ${Math.round(scaleFont(font.body, chatFontScale))}pt body`}
            </Text>
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
              style={[styles.button, (!connected || busyUpdating) && styles.buttonOff]}
              disabled={!connected || busyUpdating}
              onPress={onUpdateServer}
              accessibilityRole="button"
              accessibilityState={{ disabled: !connected || busyUpdating, busy: busyUpdating }}
              accessibilityLabel="Update the server now">
              {/* The label carries the running clock: a swap plus a health check is a minute of
                  nothing on the wire, and a button frozen on one word reads as an app that
                  ignored the press. That is what got pressed five times in three seconds. */}
              <Text style={styles.buttonText}>{updateLabel(updatePhase, now)}</Text>
            </Pressable>
            <Text style={styles.hint}>{updateHint(updatePhase, connected)}</Text>
            {updatePhase.kind === 'refused' && updatePhase.detail ? (
              <Text style={styles.hint} numberOfLines={3}>
                {updatePhase.detail}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.categoryItem}>
          <Text style={styles.section}>app update</Text>
          <View style={styles.card}>
            <Pressable
              style={[styles.button, (!connected || appUpdating) && styles.buttonOff]}
              disabled={!connected || appUpdating}
              onPress={onAppUpdate}
              accessibilityRole="button"
              accessibilityState={{ disabled: !connected || appUpdating, busy: appUpdating }}
              accessibilityLabel="Update the app">
              <Text style={styles.buttonText}>{appUpdateLabel(appUpdatePhase)}</Text>
            </Pressable>
            <Text style={styles.hint}>{appUpdateHint(appUpdatePhase, connected)}</Text>
            {appUpdatePhase.kind === 'error' ? (
              <Text style={styles.hint} numberOfLines={3}>{appUpdatePhase.message}</Text>
            ) : null}
            {appUpdatePhase.kind === 'available' ? (
              <Text style={styles.hint} numberOfLines={3}>
                {appVersion ? `current ${appVersion}` : ''} · tap Install, the system asks for confirmation
              </Text>
            ) : null}
            {appUpdatePhase.kind === 'error' && appUpdatePhase.staged ? (
              <Text style={styles.hint} numberOfLines={3}>
                the update file is still stored · tap Install to try again
              </Text>
            ) : null}
            {(appUpdatePhase.kind === 'error' && (appUpdatePhase.staged || appUpdatePhase.message.includes('unknown'))) ? (
              <Pressable
                style={[styles.button, styles.buttonGhost]}
                onPress={onAppUpdateInstallSettings}
                accessibilityRole="button"
                accessibilityLabel="Allow unknown apps">
                <Text style={[styles.buttonText, styles.buttonGhostText]}>Allow installs from this app</Text>
              </Pressable>
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
  switchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: 4,
  },
  switchLabel: {
    flex: 1,
  },
  switchTitle: {
    color: palette.text,
    fontSize: font.body,
    fontWeight: '600' as const,
  },
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
