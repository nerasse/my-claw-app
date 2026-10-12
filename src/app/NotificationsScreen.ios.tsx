import React, { useEffect, useState } from 'react';
import { AppState, Linking, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { refreshAPNsState, useAPNsState } from '../core/apns.ios';
import { Section, SettingsPageFrame, useSettingsStyles } from './settingsParts';
import { space, useTheme } from '../theme';

export function NotificationsScreen({ onBack, onEnableNotifications }: {
  onBack: () => void;
  onEnableNotifications: () => Promise<void>;
  onChannelsChange: (channels: { ordinary: string; ring: string }) => void;
}): React.JSX.Element {
  const styles = useSettingsStyles(); const state = useAPNsState();
  const { palette } = useTheme();
  const largeText = useWindowDimensions().fontScale > 1.3;
  const rowStyle = [styles.kv, largeText && { flexDirection: 'column' as const, gap: space.xxs }];
  const keyStyle = [styles.key, largeText && { width: 'auto' as const }];
  const valueStyle = [styles.value, largeText && { flex: 0 }];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    const refresh = (): void => {
      refreshAPNsState().catch(() => {
        if (mounted) setError('Could not check notification settings. Try again.');
      });
    };
    refresh();
    const subscription = AppState.addEventListener('change', value => {
      if (value === 'active') refresh();
    });
    return () => { mounted = false; subscription.remove(); };
  }, []);
  const enable = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try { await onEnableNotifications(); await refreshAPNsState(); }
    catch { setError('Could not enable notifications. Try again.'); }
    finally { setBusy(false); }
  };
  return (
    <SettingsPageFrame title="Notifications" onBack={onBack}>
      <Section title="notifications">
        <View style={rowStyle}><Text style={keyStyle}>permission</Text><Text style={valueStyle}>
          {state.permission === 'granted' ? 'allowed' : state.permission === 'denied' ? 'blocked in iOS settings' : state.permission === 'unavailable' ? 'not available' : 'not allowed yet'}
        </Text></View>
        <View style={rowStyle}><Text style={keyStyle}>connection</Text><Text style={valueStyle}>
          {state.status === 'registered' && state.serverStatus === 'ready' ? 'ready' : state.status === 'registered' && state.serverStatus === 'pending' ? 'waiting for the instance' : state.status === 'registering' ? 'registering' : state.status === 'waitingForToken' ? 'waiting for Apple' : state.status === 'notConfigured' ? 'unavailable' : 'not ready'}
        </Text></View>
        <Text style={styles.hint}>{state.reason ?? 'Questions and finished runs show a message preview. Chat and media remain available when notifications are unavailable.'}</Text>
        {error ? <Text style={[styles.hint, { color: palette.danger }]} accessibilityRole="alert">{error}</Text> : null}
        {state.status !== 'notConfigured' && state.permission !== 'denied' && (
          <Pressable style={[styles.button, busy && styles.buttonOff]} disabled={busy} accessibilityRole="button"
            onPress={() => { enable(); }} accessibilityLabel="Allow notifications">
            <Text style={styles.buttonText}>{busy ? 'Connecting...' : state.permission === 'granted' ? 'Retry connection' : 'Allow notifications'}</Text>
          </Pressable>
        )}
        <Pressable style={styles.button} accessibilityRole="button" onPress={() => {
          setError(null);
          Linking.openSettings().catch(() => setError('Could not open iOS settings. Open them from the Home Screen.'));
        }}>
          <Text style={styles.buttonText}>Open iOS notification settings</Text>
        </Pressable>
      </Section>
    </SettingsPageFrame>
  );
}
