import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { ActionSheet, type SheetEntry } from './ActionSheet';
import { DownloadIcon } from './icons';
import { useTransferProgress } from '../core/nativeBridge';
import {
  SERIES_CONFIRM_ABOVE,
  downloadHint,
  downloadLabel,
  newTransferId,
  saveMany,
  saveOne,
  type DownloadMode,
  type DownloadTarget,
} from '../core/download';
import { radius, useTheme, useThemedStyles, type Palette } from '../theme';

/**
 * The one download control: a small arrow, the same everywhere, and a sheet that says where the
 * file goes -- and, in a gallery, whether it is this one or all of them.
 *
 * It replaces a picture's two buttons side by side, a video's lone icon, the text reader's wide
 * "Download" at the bottom, and the three viewers that had nothing at all. One arrow, one tap,
 * three destinations spelled out -- the owner asked for a clean UI, not for more buttons
 * (2026-09-26). The "all of them" row only exists where there is more than one file to mean it.
 *
 * `targets` is what this control acts on right now (the row's file, or the gallery's current
 * picture); `all` is the whole series, offered as a second scope in the same sheet rather than as
 * a second button nobody would understand.
 */
export function DownloadControl({
  targets,
  all,
  gallery = false,
  variant = 'bar',
  tone = 'default',
  title,
  onMessage,
}: {
  targets: readonly DownloadTarget[];
  /** The whole series, when the surface holds one (a carousel). Longer than one to be offered. */
  all?: readonly DownloadTarget[];
  /** Pictures and films can join the camera roll; nothing else can. */
  gallery?: boolean;
  variant?: 'bar' | 'row';
  /** A full-screen picture or film sits on black, where the themed ink would disappear. */
  tone?: 'default' | 'light';
  /** What the sheet's header names: the file, or "8 items". */
  title?: string;
  onMessage?: (message: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const ink = tone === 'light' ? '#fff' : palette.text;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scope, setScope] = useState<'one' | 'all'>('one');
  const [confirming, setConfirming] = useState<DownloadMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'ok' | 'fail' | null>(null);
  const [series, setSeries] = useState<{ done: number; total: number } | null>(null);
  const transferId = useRef(newTransferId()).current;
  const progress = useTransferProgress(busy ? transferId : null);
  const many = all !== undefined && all.length > 1;
  const active = scope === 'all' && all !== undefined ? all : targets;

  useEffect(() => {
    if (done === null) return;
    const timer = setTimeout(() => setDone(null), 2200);
    return () => clearTimeout(timer);
  }, [done]);

  const run = useCallback(
    async (mode: DownloadMode, chosen: readonly DownloadTarget[]) => {
      if (chosen.length === 0) return;
      setBusy(true);
      setSeries(chosen.length > 1 ? { done: 0, total: chosen.length } : null);
      const message =
        chosen.length > 1
          ? await saveMany(chosen, mode, (count, total) => setSeries({ done: count, total }))
          : await saveOne(chosen[0]!, mode, transferId);
      setBusy(false);
      setSeries(null);
      // Dismissing the system dialog is not a failure, and must not be reported as one.
      if (message === '') return;
      setDone(message.includes('failed') || message.startsWith('Saved ') ? 'fail' : 'ok');
      onMessage?.(message);
    },
    [onMessage, transferId],
  );

  const choose = useCallback(
    (mode: DownloadMode) => {
      const chosen = active;
      setSheetOpen(false);
      // A gallery of twelve is a lot of files and a lot of folder choices: ask once, up front.
      if (chosen.length > SERIES_CONFIRM_ABOVE && mode !== 'saveAs') {
        setConfirming(mode);
        return;
      }
      setScope('one');
      run(mode, chosen).catch(() => {});
    },
    [active, run],
  );

  const options: SheetEntry[] = [
    { label: downloadLabel('downloads'), hint: downloadHint('downloads'), onPress: () => choose('downloads') },
    ...(gallery
      ? ([{ label: downloadLabel('gallery'), hint: downloadHint('gallery'), onPress: () => choose('gallery') }] as SheetEntry[])
      : []),
    { label: downloadLabel('saveAs'), hint: downloadHint('saveAs'), onPress: () => choose('saveAs') },
    ...(many && scope === 'one'
      ? ([
          { type: 'separator', key: 'series' },
          { label: `Save all ${all!.length}…`, hint: 'One file at a time, from the first', onPress: () => setScope('all') },
        ] as SheetEntry[])
      : []),
    ...(many && scope === 'all'
      ? ([
          { type: 'separator', key: 'back' },
          { label: 'Just this one', hint: 'Back to the file you are looking at', onPress: () => setScope('one') },
        ] as SheetEntry[])
      : []),
  ];

  const confirmOptions: SheetEntry[] = [
    {
      label: `Save ${active.length} files`,
      hint: downloadLabel(confirming ?? 'downloads'),
      onPress: () => {
        const mode = confirming;
        setConfirming(null);
        if (mode) run(mode, active).catch(() => {});
      },
    },
  ];

  const label =
    done === 'fail'
      ? 'Save failed'
      : done === 'ok'
        ? 'Saved'
        : series
          ? `Saving ${series.done} of ${series.total}`
          : progress && progress.total > 0
            ? `Downloading ${Math.round((progress.bytes / progress.total) * 100)} percent`
            : 'Download';

  return (
    <>
      <Pressable
        onPress={() => (busy ? undefined : setSheetOpen(true))}
        disabled={busy}
        hitSlop={8}
        style={[variant === 'bar' ? styles.bar : styles.row, busy && styles.off]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {busy ? (
          <ActivityIndicator size="small" color={ink} />
        ) : (
          <DownloadIcon size={variant === 'bar' ? 18 : 16} color={ink} />
        )}
      </Pressable>

      {sheetOpen ? (
        <ActionSheet
          preview={scope === 'all' ? `${active.length} files` : (title ?? active[0]?.filename)}
          options={options}
          onClose={() => {
            setSheetOpen(false);
            setScope('one');
          }}
        />
      ) : null}

      {confirming ? (
        <ActionSheet preview={`${active.length} files`} options={confirmOptions} onClose={() => setConfirming(null)} />
      ) : null}
    </>
  );
}

const createStyles = (_palette: Palette) => ({
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
  off: { opacity: 0.5 },
});
