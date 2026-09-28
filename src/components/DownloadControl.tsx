import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import { CheckIcon, DownloadIcon } from './icons';
import { useTransferProgress } from '../core/nativeBridge';
import { newTransferId, type DownloadTarget } from '../core/download';
import { requestDownload, type DownloadState } from '../core/downloadFlow';
import { radius, useTheme, useThemedStyles, type Palette } from '../theme';

const DONE_MS = 2200;

/**
 * The one download control: a small arrow, the same everywhere. What a press does is
 * `core/downloadFlow.ts`: a sheet of destinations on a phone, a download straight away in a
 * browser. The control draws no menu itself -- one drawn here opened inside the row, the chip or
 * the bar that holds the arrow (2026-09-28); the overlay host draws it over the whole screen.
 *
 * `targets` is what this control acts on right now (the row's file, or the gallery's current
 * picture); `all` is the whole series, offered as a second scope rather than as a second button.
 */
export function DownloadControl({
  targets,
  all,
  gallery = false,
  variant = 'bar',
  tone = 'default',
  title,
}: {
  targets: readonly DownloadTarget[];
  all?: readonly DownloadTarget[];
  gallery?: boolean;
  variant?: 'bar' | 'row';
  /** A full-screen picture or film sits on black, where the themed ink would disappear. */
  tone?: 'default' | 'light';
  /** What the sheet's header names: the file, or "8 items". */
  title?: string;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const ink = tone === 'light' ? '#fff' : palette.text;
  const [state, setState] = useState<DownloadState>({ phase: 'idle' });
  const transferId = useRef(newTransferId()).current;
  const busy = state.phase === 'busy';
  const progress = useTransferProgress(busy ? transferId : null);
  const self = useRef<View>(null);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  useEffect(() => {
    if (state.phase !== 'done') return;
    const timer = setTimeout(() => setState({ phase: 'idle' }), DONE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const onState = useCallback((next: DownloadState) => {
    // The viewer may be closed before the file lands: the notice still says it, the arrow is gone.
    if (mounted.current) setState(next);
  }, []);

  const onPress = useCallback(() => {
    const request = { targets, all, gallery, title, transferId, onState };
    const node = self.current;
    if (Platform.OS === 'web' && node) {
      node.measureInWindow((x, y, width, height) => requestDownload({ ...request, anchor: { x, y, width, height } }));
      return;
    }
    requestDownload(request);
  }, [all, gallery, onState, targets, title, transferId]);

  const label =
    state.phase === 'done'
      ? state.ok
        ? 'Saved'
        : 'Save failed'
      : state.phase === 'busy' && state.series
        ? `Saving ${state.series.done} of ${state.series.total}`
        : busy && progress && progress.total > 0
          ? `Downloading ${Math.round((progress.bytes / progress.total) * 100)} percent`
          : 'Download';

  // A pointer asks what a button does by resting on it; the browser answers with `title`.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    (self.current as unknown as { setAttribute?: (k: string, v: string) => void } | null)?.setAttribute?.('title', label);
  }, [label]);

  const size = variant === 'bar' ? 18 : 16;
  return (
    <Pressable
      ref={self}
      onPress={busy ? undefined : onPress}
      disabled={busy}
      hitSlop={8}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
        variant === 'bar' ? styles.bar : styles.row,
        (hovered || pressed) && !busy && (tone === 'light' ? styles.activeLight : styles.active),
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}>
      {busy ? (
        <ActivityIndicator size="small" color={ink} />
      ) : state.phase === 'done' ? (
        state.ok ? (
          <CheckIcon size={size} color={tone === 'light' ? '#fff' : palette.accent} />
        ) : (
          <DownloadIcon size={size} color={palette.danger} />
        )
      ) : (
        <DownloadIcon size={size} color={ink} />
      )}
    </Pressable>
  );
}

const createStyles = (palette: Palette) => ({
  bar: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  row: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  active: { backgroundColor: palette.surfaceAlt },
  activeLight: { backgroundColor: 'rgba(255,255,255,0.16)' },
});
