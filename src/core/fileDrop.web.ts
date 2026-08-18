/// <reference lib="dom" />
import { COMPOSER_INPUT_ID } from './domIds';
import type { PickedFile } from './nativeBridge';

/**
 * Drag a file onto the window, or paste a screenshot into it.
 *
 * Both are how a file reaches a chat on a desktop, and the app already knows what to do with the
 * result: `pickFile()` hands back exactly this shape, so a drop is the picker without the dialog.
 * The listeners are on the window rather than on a drop zone, because aiming at a rectangle is
 * the thing this replaces.
 */

/**
 * A pasted screenshot often arrives as a `File` with an empty name, and a name without an
 * extension reaches the agent as an opaque blob: the server stores what it is told. The mime
 * type is the only thing the clipboard is sure about, so the extension is derived from it.
 */
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
};

export function pastedName(type: string, at: number): string {
  const known = EXTENSIONS[type];
  const guessed = known ?? type.split('/')[1]?.replace(/[^a-z0-9]+/gi, '') ?? '';
  return guessed ? `pasted-${at}.${guessed}` : `pasted-${at}`;
}

function toPicked(files: File[]): PickedFile[] {
  return files.map(file => ({
    uri: URL.createObjectURL(file),
    name: file.name || pastedName(file.type, Date.now()),
    type: file.type || 'application/octet-stream',
    size: file.size,
  }));
}

/**
 * Whether a paste belongs to the chat. The listener is on the window, so without this a file
 * pasted into a settings field or a search box would be staged as an attachment on a thread the
 * user is not even looking at.
 */
function pasteIsForChat(target: EventTarget | null): boolean {
  const active = (document.activeElement as HTMLElement | null) ?? (target as HTMLElement | null);
  if (!active) return true;
  if (active.id === COMPOSER_INPUT_ID) return true;
  const tag = active.tagName;
  return !(tag === 'INPUT' || tag === 'TEXTAREA' || active.isContentEditable);
}

export function watchFileDrop(onFiles: (files: PickedFile[]) => void): () => void {
  // Nested enter/leave events fire for every child element the pointer crosses, so the outline
  // is driven by a counter rather than by the last event seen.
  let depth = 0;
  const mark = (on: boolean): void => {
    if (on) document.body.setAttribute('data-claw-drop', '1');
    else document.body.removeAttribute('data-claw-drop');
  };

  const hasFiles = (event: DragEvent): boolean =>
    Array.from(event.dataTransfer?.types ?? []).includes('Files');

  const onDragEnter = (event: DragEvent): void => {
    if (!hasFiles(event)) return;
    depth += 1;
    mark(true);
  };
  const onDragOver = (event: DragEvent): void => {
    if (!hasFiles(event)) return;
    // Without this the browser navigates to the file instead of handing it over.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (event: DragEvent): void => {
    if (!hasFiles(event)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) mark(false);
  };
  const onDrop = (event: DragEvent): void => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth = 0;
    mark(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) onFiles(toPicked(files));
  };
  const onPaste = (event: ClipboardEvent): void => {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length === 0) return;
    if (!pasteIsForChat(event.target)) return;
    // Text pasted alongside an image stays with the field; only the file is intercepted.
    event.preventDefault();
    onFiles(toPicked(files));
  };

  window.addEventListener('dragenter', onDragEnter);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('drop', onDrop);
  window.addEventListener('paste', onPaste);
  return () => {
    mark(false);
    window.removeEventListener('dragenter', onDragEnter);
    window.removeEventListener('dragover', onDragOver);
    window.removeEventListener('dragleave', onDragLeave);
    window.removeEventListener('drop', onDrop);
    window.removeEventListener('paste', onPaste);
  };
}
