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
 * Runs one transfer. Answers the message to show, or `''` when the owner dismissed the system
 * dialog -- a cancellation is not a failure and must not be reported as one.
 */
export async function saveOne(target: DownloadTarget, mode: DownloadMode, transferId: string): Promise<string> {
  // A browser has one destination and its own dialog: the anchor does it, and asking for the
  // gallery or for a folder picker there is a promise the platform cannot keep.
  if (Platform.OS === 'web') {
    try {
      const anchor = document.createElement('a');
      anchor.href = target.url;
      anchor.download = target.filename;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return 'Saved';
    } catch {
      return 'Save failed';
    }
  }
  try {
    if (mode === 'saveAs') {
      const saved = await deviceBridge.saveFile(target.url, target.filename, transferId);
      return saved ? 'Saved' : '';
    }
    await deviceBridge.downloadFile(target.url, target.filename, mode === 'gallery', transferId);
    return mode === 'gallery' ? 'Saved to the gallery' : 'Saved to Downloads';
  } catch {
    return 'Save failed';
  }
}

/**
 * The whole series, one file at a time. `onProgress` says where it is, because a gallery of twelve
 * deserves a count and not a spinner that never ends; a failure half-way stops the run and says
 * how far it got, rather than pretending the rest arrived.
 */
export async function saveMany(
  targets: readonly DownloadTarget[],
  mode: DownloadMode,
  onProgress: (done: number, total: number) => void,
): Promise<string> {
  let saved = 0;
  for (const target of targets) {
    const message = await saveOne(target, mode, newTransferId('series'));
    if (message === 'Save failed') {
      return saved === 0 ? 'Save failed' : `Saved ${saved} of ${targets.length}, then it failed`;
    }
    saved += 1;
    onProgress(saved, targets.length);
  }
  return saved === targets.length
    ? `${saved} file${saved > 1 ? 's' : ''} saved`
    : `Saved ${saved} of ${targets.length}`;
}

/** Past this many, a gallery download asks first: it is a lot of files and a lot of choosing. */
export const SERIES_CONFIRM_ABOVE = 10;
