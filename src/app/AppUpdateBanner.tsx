import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { AppUpdatePhase } from '../core/appUpdate';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

/**
 * The thin strip that tells the owner an app update exists, wherever they are: over the home
 * list when no conversation is open, over the chat when one is. The card in Settings goes into
 * more detail; this one just has to be seen without navigating anywhere.
 */
export function AppUpdateBanner({
  phase,
  onPress,
}: {
  phase: AppUpdatePhase;
  onPress: () => void;
}): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  if (phase.kind !== 'available' && phase.kind !== 'ready' && phase.kind !== 'downloading' && phase.kind !== 'error') {
    return null;
  }
  const label =
    phase.kind === 'downloading'
      ? `app update ${phase.version} · ${Math.round(phase.progress * 100)}%`
      : phase.kind === 'ready'
        ? `app update ${phase.version} ready · tap to install`
        : phase.kind === 'error'
          ? `app update failed · ${phase.message}`
          : `app update ${phase.version} available`;
  // A `ready` installs; an `error` with the APK still staged installs too (it failed while
  // installing, or the permission check said no). All other errors just offer a re-download.
  const action =
    phase.kind === 'downloading'
      ? null
      : phase.kind === 'ready' || (phase.kind === 'error' && phase.staged)
        ? 'Install'
        : phase.kind === 'error'
          ? 'Retry'
          : 'Get it';
  return (
    <View style={styles.banner}>
      <Text style={styles.text} numberOfLines={2}>
        {label}
      </Text>
      {action ? (
        <Pressable
          onPress={onPress}
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel="Install app update">
          <Text style={styles.buttonText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  banner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
    backgroundColor: palette.accent,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  text: { flex: 1, color: palette.accentText, fontSize: font.meta, fontWeight: '600' as const },
  button: {
    backgroundColor: palette.accentText,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  buttonText: { color: palette.accent, fontSize: font.meta, fontWeight: '700' as const },
});
