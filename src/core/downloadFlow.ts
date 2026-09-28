/**
 * What a download control does when it is pressed, the same from every surface: the arrow on a
 * row, a chip, a viewer's bar, the carousel -- and the explorer's "Download" action, which used to
 * take a second road of its own straight into Downloads.
 *
 * - On a phone: the bottom sheet, over the whole screen, with the destinations the phone has
 *   (Downloads, the gallery for pictures and films, "Save as…") and, in a series, "all of them".
 *   The outcome is said in the overlay's notice, since the control is too small to say it.
 * - In a browser: there is one destination, so a press downloads. A series hangs a short menu
 *   under the arrow ("this file" / "all N"). The browser's own bar shows the progress; the notice
 *   only speaks for a series or a failure.
 *
 * The menus go through `overlayStore`, never rendered by the control: that is what kept opening
 * them inside the element that held the arrow (2026-09-28).
 */

import { Platform } from 'react-native';
import type { SheetEntry } from '../components/ActionSheet';
import {
  SERIES_CONFIRM_ABOVE,
  downloadHint,
  downloadLabel,
  newTransferId,
  saveMany,
  saveOne,
  type DownloadMode,
  type DownloadTarget,
} from './download';
import { overlayStore, type AnchorRect } from './overlay';

export type DownloadState =
  | { phase: 'idle' }
  | { phase: 'busy'; series: { done: number; total: number } | null }
  | { phase: 'done'; ok: boolean };

export interface DownloadRequest {
  /** What the control acts on right now: the row's file, the picture on screen. */
  targets: readonly DownloadTarget[];
  /** The whole series, when the surface holds one. Offered only when longer than one. */
  all?: readonly DownloadTarget[];
  /** Pictures and films can join the camera roll; nothing else can. */
  gallery?: boolean;
  /** What the sheet's header names; the file's name otherwise. */
  title?: string;
  /** Where the control is, in the window: a browser's series menu hangs under it. */
  anchor?: AnchorRect;
  /** The id the control follows the progress of. */
  transferId?: string;
  onState?: (state: DownloadState) => void;
}

export function requestDownload(request: DownloadRequest): void {
  if (request.targets.length === 0) return;
  const series = request.all !== undefined && request.all.length > 1 ? request.all : null;
  if (Platform.OS === 'web') {
    if (!series) {
      run(request, 'downloads', request.targets).catch(() => {});
      return;
    }
    const options: SheetEntry[] = [
      {
        label: 'This file',
        hint: request.targets[0]!.filename,
        onPress: () => run(request, 'downloads', request.targets).catch(() => {}),
      },
      {
        label: `All ${series.length} files`,
        hint: 'The browser may ask once to allow several',
        onPress: () => run(request, 'downloads', series).catch(() => {}),
      },
    ];
    overlayStore.open(
      request.anchor ? { kind: 'menu', anchor: request.anchor, options } : { kind: 'sheet', preview: request.title, options },
    );
    return;
  }
  openDestinations(request, series, 'one');
}

function openDestinations(
  request: DownloadRequest,
  series: readonly DownloadTarget[] | null,
  scope: 'one' | 'all',
): void {
  const chosen = scope === 'all' && series ? series : request.targets;
  const pick = (mode: DownloadMode): SheetEntry => ({
    label: downloadLabel(mode),
    hint: downloadHint(mode),
    onPress: () => choose(request, mode, chosen),
  });
  const options: SheetEntry[] = [pick('downloads'), ...(request.gallery ? [pick('gallery')] : []), pick('saveAs')];
  if (series && scope === 'one') {
    options.push(
      { type: 'separator', key: 'series' },
      {
        label: `Save all ${series.length}…`,
        hint: 'One file at a time, from the first',
        onPress: () => openDestinations(request, series, 'all'),
      },
    );
  }
  if (series && scope === 'all') {
    options.push(
      { type: 'separator', key: 'back' },
      { label: 'Just this one', hint: 'Back to the file you are looking at', onPress: () => openDestinations(request, series, 'one') },
    );
  }
  overlayStore.open({
    kind: 'sheet',
    preview: scope === 'all' ? `${chosen.length} files` : (request.title ?? chosen[0]?.filename),
    options,
  });
}

function choose(request: DownloadRequest, mode: DownloadMode, chosen: readonly DownloadTarget[]): void {
  // A gallery of twelve is a lot of files: ask once, up front. "Save as" asks for each anyway.
  if (chosen.length > SERIES_CONFIRM_ABOVE && mode !== 'saveAs') {
    overlayStore.open({
      kind: 'sheet',
      preview: `${chosen.length} files`,
      options: [
        { label: `Save ${chosen.length} files`, hint: downloadLabel(mode), onPress: () => run(request, mode, chosen).catch(() => {}) },
        { label: 'Cancel', onPress: () => {} },
      ],
    });
    return;
  }
  run(request, mode, chosen).catch(() => {});
}

async function run(request: DownloadRequest, mode: DownloadMode, chosen: readonly DownloadTarget[]): Promise<void> {
  const report = request.onState ?? (() => {});
  const many = chosen.length > 1;
  report({ phase: 'busy', series: many ? { done: 0, total: chosen.length } : null });
  const result = many
    ? await saveMany(chosen, mode, (done, total) => report({ phase: 'busy', series: { done, total } }))
    : await saveOne(chosen[0]!, mode, request.transferId ?? newTransferId());
  if (result === null) {
    report({ phase: 'idle' });
    return;
  }
  report({ phase: 'done', ok: result.ok });
  if (Platform.OS !== 'web' || many || !result.ok) overlayStore.notify(result.message, !result.ok);
}
