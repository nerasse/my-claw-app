import type { PickedFile } from './nativeBridge';

/**
 * Files dropped on the window, or pasted into it. Android has neither: a file gets in through
 * the picker or the share sheet.
 */
export function watchFileDrop(_onFiles: (files: PickedFile[]) => void): () => void {
  return () => {};
}
