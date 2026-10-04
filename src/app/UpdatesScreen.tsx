import React from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { updateBusy, updateHint, updateLabel, type UpdatePhase } from '../core/serverUpdate';
import { appUpdateHint, appUpdateLabel, type AppUpdatePhase } from '../core/appUpdate';
import { appUpdateSupported } from '../core/appUpdateRuntime';
import { Section, SettingsPageFrame, useSettingsStyles } from './settingsParts';

/**
 * The server and the app brought up to date, on one page: they were on General, and the mobile
 * data switch on Other (owner, 2026-10-04).
 */
export function UpdatesScreen({
  connected,
  serverVersion,
  appVersion,
  updatePhase,
  appUpdatePhase,
  now,
  updateOnMobileData,
  onUpdateOnMobileDataChange,
  onUpdateServer,
  onAppUpdate,
  onAppUpdateInstallSettings,
  onBack,
}: {
  connected: boolean;
  serverVersion: string | null;
  appVersion: string | null;
  /** Everything the update button knows, decided in core/serverUpdate.ts. */
  updatePhase: UpdatePhase;
  /** Everything the app update card knows, decided in core/appUpdate.ts. */
  appUpdatePhase: AppUpdatePhase;
  /** Ticks once a second while an update runs, and only then: the clock has one owner. */
  now: number;
  /** Auto-download the app update on mobile data (off = wifi only). */
  updateOnMobileData: boolean;
  onUpdateOnMobileDataChange: (value: boolean) => void;
  onUpdateServer: () => void;
  /** Starts the app update: download if needed, then install. */
  onAppUpdate: () => void;
  /** Opens Android's "install unknown apps" settings screen. */
  onAppUpdateInstallSettings: () => void;
  onBack: () => void;
}): React.JSX.Element {
  const styles = useSettingsStyles();
  const busyUpdating = updateBusy(updatePhase);
  const appUpdating =
    appUpdatePhase.kind === 'downloading' || appUpdatePhase.kind === 'installing' || appUpdatePhase.kind === 'checking';
  return (
    <SettingsPageFrame title="Updates" onBack={onBack}>
      <Section title={serverVersion ? `server · my-claw ${serverVersion}` : 'server'}>
        <Pressable
          style={[styles.button, (!connected || busyUpdating) && styles.buttonOff]}
          disabled={!connected || busyUpdating}
          onPress={onUpdateServer}
          accessibilityRole="button"
          accessibilityState={{ disabled: !connected || busyUpdating, busy: busyUpdating }}
          accessibilityLabel="Update the server now">
          {/* The label carries the running clock: a swap plus a health check is a minute of nothing
              on the wire, and a button frozen on one word reads as an app that ignored the press. */}
          <Text style={styles.buttonText}>{updateLabel(updatePhase, now)}</Text>
        </Pressable>
        <Text style={styles.hint}>{updateHint(updatePhase, connected)}</Text>
        {updatePhase.kind === 'refused' && updatePhase.detail ? (
          <Text style={styles.hint} numberOfLines={3}>
            {updatePhase.detail}
          </Text>
        ) : null}
      </Section>

      {/* A browser cannot install an APK over itself: the web updates with the server. */}
      {appUpdateSupported ? (
        <Section title={appVersion ? `app · ${appVersion}` : 'app'}>
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
            <Text style={styles.hint} numberOfLines={3}>
              {appUpdatePhase.message}
            </Text>
          ) : null}
          {appUpdatePhase.kind === 'available' ? (
            <Text style={styles.hint} numberOfLines={3}>
              tap Install, the system asks for confirmation
            </Text>
          ) : null}
          {appUpdatePhase.kind === 'error' && appUpdatePhase.staged ? (
            <Text style={styles.hint} numberOfLines={3}>
              {appUpdatePhase.staged} is downloaded · tap Install to try again
            </Text>
          ) : null}
          {appUpdatePhase.kind === 'error' && (appUpdatePhase.staged || appUpdatePhase.message.includes('install')) ? (
            <Pressable
              style={[styles.button, styles.buttonGhost]}
              onPress={onAppUpdateInstallSettings}
              accessibilityRole="button"
              accessibilityLabel="Allow unknown apps">
              <Text style={[styles.buttonText, styles.buttonGhostText]}>Allow installs from this app</Text>
            </Pressable>
          ) : null}
          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <Text style={styles.switchTitle}>Download on mobile data</Text>
              <Text style={styles.hint}>off: wifi only · a newer app downloads on its own</Text>
            </View>
            <Switch
              value={updateOnMobileData}
              onValueChange={onUpdateOnMobileDataChange}
              accessibilityLabel="Download app update on mobile data"
              accessibilityRole="switch"
            />
          </View>
        </Section>
      ) : null}
    </SettingsPageFrame>
  );
}
