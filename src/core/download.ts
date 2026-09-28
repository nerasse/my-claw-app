/**
 * Where a file goes when it comes down from the server.
 *
 * Three destinations, and the phone already knows all three: `downloadFile` stores quietly in
 * Downloads or, with the gallery flag, in Pictures where the camera roll sees it; `saveFile`
 * opens the system "Save as" dialog and lets the owner pick the folder and the name. What was
 * missing is one place that offers all three, the same way, for every kind of file -- a picture
 * had two buttons, a video had one, a PDF had none (2026-09-26).
 *
 * The label and the hint live here rather than in the sheet, because the same three rows are
 * drawn by every surface: a bubble, a session file, the explorer, every viewer, the carousel.
 *
 * A browser has none of the three: it has one destination and its own download bar. There the
 * anchor and its `download` attribute do it, streamed by the browser rather than held in memory,
 * and no destination is offered -- `components/downloadFlow.ts`.
 */

import { Platform } from 'react-native';
import { deviceBridge } from './nativeBridge';

export type DownloadMode = 'downloads' | 'gallery' | 'saveAs';

export interface DownloadTarget {
  url: string;
  filename: string;
}

export const DOWNLOAD_MODES: readonly DownloadMode[] = ['downloads', 'gallery', 'saveAs'];

export function downloadLabel(mode: DownloadMode): string {
  if (mode === 'downloads') return 'Save to Downloads';
  if (mode === 'gallery') return 'Save to the gallery';
  return 'Save as…';
}

/** What the destination means, in one line: the labels alone do not tell Downloads from Pictures. */
export function downloadHint(mode: DownloadMode): string {
  if (mode === 'downloads') return 'Into your phone\'s Downloads folder';
  if (mode === 'gallery') return 'Into Photos, beside your own captures';
  return 'Pick the folder and the name';
}

/** A progress id has to be unique per transfer: the carousel sends many at once. */
export function newTransferId(prefix = 'download'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * What a transfer ended as. `null` is the owner dismissing the system dialog: a cancellation is
 * not a failure, and is not reported at all.
 */
export type SaveResult = { ok: boolean; message: string } | null;

/** The browser takes it from here: its own bar shows the progress, and the failure if any. */
function browserDownload(target: DownloadTarget): SaveResult {
  try {
    const anchor = document.createElement('a');
    anchor.href = target.url;
    anchor.download = target.filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return { ok: true, message: `Downloading ${target.filename}` };
  } catch {
    return { ok: false, message: 'Download failed' };
  }
}

export async function saveOne(target: DownloadTarget, mode: DownloadMode, transferId: string): Promise<SaveResult> {
  if (Platform.OS === 'web') return browserDownload(target);
  try {
    if (mode === 'saveAs') {
      const saved = await deviceBridge.saveFile(target.url, target.filename, transferId);
      return saved ? { ok: true, message: `Saved ${target.filename}` } : null;
    }
    await deviceBridge.downloadFile(target.url, target.filename, mode === 'gallery', transferId);
    return { ok: true, message: mode === 'gallery' ? 'Saved to the gallery' : 'Saved to Downloads' };
  } catch {
    return { ok: false, message: 'Save failed' };
  }
}

/**
 * A browser drops anchors clicked back to back (Chrome keeps the first and asks about the rest
 * only if they are spaced out), so a series leaves it a moment between two.
 */
export const BROWSER_SERIES_GAP_MS = 400;

const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * The whole series, one file at a time. `onProgress` says where it is, because a gallery of twelve
 * deserves a count and not a spinner that never ends; a failure half-way stops the run and says
 * how far it got, rather than pretending the rest arrived. A dismissed "Save as" ends the series
 * there, quietly: the owner said no.
 */
export async function saveMany(
  targets: readonly DownloadTarget[],
  mode: DownloadMode,
  onProgress: (done: number, total: number) => void,
): Promise<SaveResult> {
  const total = targets.length;
  let saved = 0;
  for (const target of targets) {
    if (saved > 0 && Platform.OS === 'web') await pause(BROWSER_SERIES_GAP_MS);
    const result = await saveOne(target, mode, newTransferId('series'));
    if (result === null) return saved === 0 ? null : { ok: true, message: `Saved ${saved} of ${total}` };
    if (!result.ok) {
      return { ok: false, message: saved === 0 ? result.message : `Saved ${saved} of ${total}, then it failed` };
    }
    saved += 1;
    onProgress(saved, total);
  }
  if (Platform.OS === 'web') return { ok: true, message: `Downloading ${total} files` };
  return { ok: true, message: `${total} file${total > 1 ? 's' : ''} saved` };
}

/** Past this many, a gallery download asks first: it is a lot of files and a lot of choosing. */
export const SERIES_CONFIRM_ABOVE = 10;
