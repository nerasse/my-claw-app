import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppUpdatePhase } from '../core/appUpdate';
import { useTransferProgress } from '../core/nativeBridge';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

/**
 * The update dialog: one card in the middle of the screen, not a coloured strip glued over the
 * conversation. It only shows up when there is a decision to make (an update is available, or one
 * is downloaded and waiting to install, or the last attempt failed and says why). A download in
 * flight keeps it open with its progress; everything else has no dialog at all.
 *
 * Dismissing is always allowed: the same update stays one tap away in Settings, and a modal that
 * cannot be closed is a modal that gets force-quit.
 */
export function AppUpdateModal({
  phase,
  currentVersion,
  onPrimary,
  onDismiss,
}: {
  phase: AppUpdatePhase;
  currentVersion: string | null;
  /** Download, install, or retry: what the phase makes the obvious next step. */
  onPrimary: () => void;
  onDismiss: () => void;
}): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  // The download emits transfer progress on the native channel; the modal reads it straight,
  // same as the media viewers, instead of the reducer remembering a percentage it never saw.
  // Read unconditionally: a hook after an early return would make the call count change.
  const transferId = phase.kind === 'downloading' ? `app-update-${phase.version}` : null;
  const transfer = useTransferProgress(transferId);
  // The relay streams the APK, so the response is chunked and the transfer may report a total
  // of -1. The size the check reported is then the only one there is; without this fallback the
  // bar sits at 0% for the whole download and the dialog claims 0 MB.
  const expected = phase.kind === 'downloading' ? phase.apkSize : 0;
  const total = transfer && transfer.total > 0 ? transfer.total : expected;
  const progress =
    transfer && total > 0
      ? Math.min(1, transfer.bytes / total)
      : phase.kind === 'downloading'
        ? phase.progress
        : 0;
  if (
    phase.kind !== 'available' &&
    phase.kind !== 'ready' &&
    phase.kind !== 'downloading' &&
    phase.kind !== 'error'
  ) {
    return null;
  }

  const busy = phase.kind === 'downloading';
  const title =
    phase.kind === 'ready'
      ? 'Update ready'
      : phase.kind === 'downloading'
        ? 'Downloading update'
        : phase.kind === 'error'
          ? 'Update failed'
          : 'Update available';

  const body =
    phase.kind === 'available'
      ? `Version ${phase.version} is available (${formatMb(phase.apkSize)}).`
      : phase.kind === 'downloading'
        ? `Version ${phase.version} · ${Math.round(progress * 100)}% of ${formatMb(total)}`
        : phase.kind === 'ready'
          ? `Version ${phase.version} is downloaded. Android will ask you to confirm.`
          : phase.message;

  // A failure that still has the APK on disk installs; anything else downloads again.
  const action =
    phase.kind === 'ready' || (phase.kind === 'error' && phase.staged)
      ? 'Install'
      : phase.kind === 'error'
        ? 'Try again'
        : 'Download';

  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Close update dialog" />
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        {currentVersion ? <Text style={styles.meta}>You are on {currentVersion}</Text> : null}
        {busy ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            style={styles.ghost}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss update">
            <Text style={styles.ghostText}>{busy ? 'Hide' : 'Later'}</Text>
          </Pressable>
          {busy ? null : (
            <Pressable
              style={styles.primary}
              onPress={onPrimary}
              accessibilityRole="button"
              accessibilityLabel={`${action} app update`}>
              <Text style={styles.primaryText}>{action}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

function formatMb(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

const createStyles = (palette: Palette) => ({
  backdrop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.overlay,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: space.lg,
  },
  card: {
    width: '100%' as const,
    maxWidth: 420,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: space.lg,
    gap: space.sm,
  },
  title: { fontSize: font.screen, fontWeight: '700' as const, color: palette.text },
  body: { fontSize: font.body, color: palette.text },
  meta: { fontSize: font.small, color: palette.textFaint },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.surfaceAlt,
    overflow: 'hidden' as const,
    marginTop: space.xs,
  },
  fill: { height: 4, backgroundColor: palette.accent },
  actions: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginTop: space.sm,
  },
  ghost: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  ghostText: { fontSize: font.body, color: palette.textMuted },
  primary: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.accent,
  },
  primaryText: { fontSize: font.body, fontWeight: '700' as const, color: palette.accentText },
});
