import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ActionSheet, type SheetEntry } from '../components/ActionSheet';
import {
  deviceBridge,
  type ImportedSoundNative,
  type NotificationSoundChoice,
  type NotificationSoundsNative,
  type NotificationUsage,
} from '../core/nativeBridge';
import { useDismissKeyboard } from '../core/keyboard';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { CloseButton } from '../components/CloseButton';
import { notificationPermission } from '../core/notifications';
import { Section, useSettingsStyles } from './settingsParts';

/**
 * Whether this browser may show a notification at all. A phone grants it at install; a browser
 * asks, and only from a tap: the grant needs a user gesture, which a connect-time attempt lacks.
 */
function PermissionSection({ onEnable }: { onEnable: () => Promise<void> }): React.JSX.Element | null {
  const styles = useSettingsStyles();
  const [permission, setPermission] = useState(() => notificationPermission());
  const [enabling, setEnabling] = useState(false);
  if (permission === 'unavailable') return null;
  const enable = async (): Promise<void> => {
    setEnabling(true);
    try {
      await onEnable();
    } finally {
      // The browser's verdict is the only truth worth showing, "denied" included.
      setPermission(notificationPermission());
      setEnabling(false);
    }
  };
  return (
    <Section title="permission">
      <View style={styles.kv}>
        <Text style={styles.key}>tray</Text>
        <Text style={styles.value}>
          {permission === 'granted' ? 'allowed' : permission === 'denied' ? 'blocked by the browser' : 'not allowed yet'}
        </Text>
      </View>
      {permission === 'granted' ? (
        <Text style={styles.hint}>questions and finished runs reach this browser</Text>
      ) : permission === 'denied' ? (
        <Text style={styles.hint}>reset it in the site settings of the browser, then reload</Text>
      ) : (
        <>
          <Pressable
            style={[styles.button, enabling && styles.buttonOff]}
            onPress={() => {
              enable().catch(() => {});
            }}
            disabled={enabling}
            accessibilityRole="button"
            accessibilityLabel="Allow notifications in this browser">
            <Text style={styles.buttonText}>{enabling ? 'Asking...' : 'Allow notifications'}</Text>
          </Pressable>
          <Text style={styles.hint}>a question waiting on you is worth an interruption</Text>
        </>
      )}
    </Section>
  );
}

/** One row per usage, with the labels the tests and the screen reader read. */
const ROWS: ReadonlyArray<{
  usage: NotificationUsage;
  title: string;
  open: string;
  listen: string;
  reset: string;
}> = [
  {
    usage: 'ordinary',
    title: 'Notification',
    open: 'Sound for notifications',
    listen: 'Listen to the notification sound',
    reset: 'Reset the notification sound to default',
  },
  {
    usage: 'ring',
    title: 'Ring',
    open: 'Sound for the ring',
    listen: 'Listen to the ring sound',
    reset: 'Reset the ring sound to default',
  },
];

/** What the settings row shows for one choice: the system's own, silent, or the sound's name. */
function soundLabel(choice: NotificationSoundChoice): string {
  if (choice.kind === 'default') return 'System default';
  if (choice.kind === 'silent') return 'Silent';
  return choice.name;
}

/**
 * The sounds the two notification usages play, chosen here and applied natively: the screen is a
 * view of DeviceBridge's notification-sound state, which reads and writes the preferences the
 * boot path applies (NotificationSounds.kt). Every change resolves the new state -- channel
 * names included -- and that state goes out to the server through `onChannelsChange`, because a
 * channel freezes its sound at creation and the name is the only handle the server has on it.
 */
export function NotificationsScreen({
  onBack,
  onChannelsChange,
  onEnableNotifications,
}: {
  onBack: () => void;
  /** Asks the browser for the permission and subscribes (see PermissionSection). */
  onEnableNotifications: () => Promise<void>;
  /** The new channel names, after any change: the server must follow the sound through them. */
  onChannelsChange: (channels: { ordinary: string; ring: string }) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();
  // undefined while the bridge is answering, null when the platform has no per-app sounds.
  const [sounds, setSounds] = useState<NotificationSoundsNative | null | undefined>(undefined);
  const [imports, setImports] = useState<ImportedSoundNative[]>([]);
  const [sheet, setSheet] = useState<NotificationUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([deviceBridge.getNotificationSounds(), deviceBridge.listImportedSounds()])
      .then(([state, files]) => {
        if (cancelled) return;
        setSounds(state);
        setImports(files);
      })
      .catch(() => {
        if (!cancelled) setSounds(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Every native mutation answers the whole new state, and the frame leaves from here: a channel
   * name is a wire contract, so the moment the choice changes the server has to hear about it.
   */
  const apply = useCallback(
    (next: NotificationSoundsNative | null) => {
      if (!next) return;
      setSounds(next);
      onChannelsChange(next.channels);
    },
    [onChannelsChange],
  );

  const pick = useCallback(
    (usage: NotificationUsage, source: 'system' | 'file' | 'silent') => {
      setSheet(null);
      setError(null);
      setBusy(true);
      deviceBridge
        .pickNotificationSound(usage, source)
        .then(apply)
        .catch(() => setError('could not apply that sound'))
        .finally(() => setBusy(false));
    },
    [apply],
  );

  const reset = useCallback(
    (usage: NotificationUsage) => {
      setError(null);
      setBusy(true);
      deviceBridge
        .resetNotificationSound(usage)
        .then(apply)
        .catch(() => setError('could not reset that sound'))
        .finally(() => setBusy(false));
    },
    [apply],
  );

  const removeImported = useCallback(
    (uri: string) => {
      setError(null);
      setBusy(true);
      deviceBridge
        .deleteImportedSound(uri)
        .then(next => {
          apply(next);
          return deviceBridge.listImportedSounds();
        })
        .then(setImports)
        .catch(() => setError('could not delete that sound'))
        .finally(() => setBusy(false));
    },
    [apply],
  );

  const optionsFor = (usage: NotificationUsage): SheetEntry[] => {
    const entries: SheetEntry[] = [
      { label: 'System sound', hint: "pick one of the phone's sounds", onPress: () => pick(usage, 'system') },
      { label: 'Import a file', hint: 'copy an audio file into the app', onPress: () => pick(usage, 'file') },
    ];
    if (usage === 'ordinary') {
      entries.push({ label: 'Silent', hint: 'no sound; the notification still arrives', onPress: () => pick(usage, 'silent') });
    }
    return entries;
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to settings">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <CloseButton />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <PermissionSection onEnable={onEnableNotifications} />
        {sounds === undefined ? (
          <View style={styles.categoryItem}>
            <Text style={styles.section}>sounds</Text>
            <View style={styles.card}>
              <Text style={styles.hint}>loading…</Text>
            </View>
          </View>
        ) : sounds === null ? (
          <View style={styles.categoryItem}>
            <Text style={styles.section}>sounds</Text>
            <View style={styles.card}>
              <Text style={styles.hint}>
                notification sounds are a phone setting; this browser keeps the sound the system gives it
              </Text>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.categoryItem}>
              <Text style={styles.section}>sounds</Text>
              <View style={styles.card}>
                {ROWS.map(row => {
                  const choice = sounds[row.usage];
                  const silent = choice.kind === 'silent';
                  const isDefault = choice.kind === 'default';
                  return (
                    <View key={row.usage} style={styles.soundBlock}>
                      {/* The row opens the sources; the two buttons act on the sound set now. */}
                      <Pressable
                        style={styles.soundRow}
                        onPress={() => setSheet(row.usage)}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: busy }}
                        accessibilityLabel={row.open}>
                        <View style={styles.rowMain}>
                          <Text style={styles.rowTitle}>{row.title}</Text>
                          <Text style={styles.rowHint} numberOfLines={1}>
                            {soundLabel(choice)}
                          </Text>
                        </View>
                        <Text style={styles.linkGlyph}>›</Text>
                      </Pressable>
                      <View style={styles.buttonRow}>
                        <Pressable
                          style={[styles.button, styles.buttonGhost, (busy || silent) && styles.buttonOff]}
                          onPress={() => {
                            deviceBridge.previewNotificationSound(row.usage).catch(() => {});
                          }}
                          disabled={busy || silent}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: busy || silent }}
                          accessibilityLabel={row.listen}>
                          <Text style={[styles.buttonText, styles.buttonGhostText]}>Listen</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.button, styles.buttonGhost, (busy || isDefault) && styles.buttonOff]}
                          onPress={() => reset(row.usage)}
                          disabled={busy || isDefault}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: busy || isDefault }}
                          accessibilityLabel={row.reset}>
                          <Text style={[styles.buttonText, styles.buttonGhostText]}>Back to default</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.hint}>
                the notification sound plays for finished runs and questions; the ring is the louder one
              </Text>
            </View>

            <View style={styles.categoryItem}>
              <Text style={styles.section}>imported sounds</Text>
              <View style={styles.card}>
                {imports.length === 0 ? (
                  <Text style={styles.hint}>
                    files you import are copied here and keep playing when the app is closed
                  </Text>
                ) : (
                  imports.map(sound => (
                    <View key={sound.uri} style={styles.importRow}>
                      <Text style={styles.importName} numberOfLines={1}>
                        {sound.name}
                      </Text>
                      <Pressable
                        onPress={() => removeImported(sound.uri)}
                        disabled={busy}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: busy }}
                        accessibilityLabel={`Delete ${sound.name}`}>
                        <Text style={[styles.deleteText, busy && styles.buttonOff]}>Delete</Text>
                      </Pressable>
                    </View>
                  ))
                )}
              </View>
            </View>

            {error ? (
              <View style={styles.categoryItem}>
                <Text style={styles.hint}>{error}</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {sheet && sounds ? (
        <ActionSheet
          preview={`${sheet === 'ordinary' ? 'Notification' : 'Ring'} · ${soundLabel(sounds[sheet])}`}
          options={optionsFor(sheet)}
          onClose={() => setSheet(null)}
        />
      ) : null}
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
  soundBlock: { paddingVertical: space.xs, gap: space.sm },
  soundRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingVertical: space.sm,
  },
  rowMain: { flex: 1, gap: 1 },
  rowTitle: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  rowHint: { fontSize: font.small, color: palette.textFaint },
  linkGlyph: { fontSize: font.screen, color: palette.textFaint },
  buttonRow: { flexDirection: 'row' as const, gap: space.sm },
  hint: { fontSize: font.small, color: palette.textFaint },
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
  importRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.sm,
  },
  importName: { flex: 1, fontSize: font.meta, color: palette.text },
  deleteText: { fontSize: font.meta, color: palette.danger, fontWeight: '600' as const },
});
