import { useSyncExternalStore } from 'react';
import { connection } from './connection';
import { deviceBridge } from './nativeBridge';
import {
  encodeFsList,
  encodeFsMkdir,
  encodeFsMove,
  encodeFsRead,
  encodeFsRemove,
  encodeFsSessionRoot,
  encodeFsUnwatch,
  encodeFsWatch,
  encodeFsWrite,
} from './protocol';
import type {
  FsChangedFrame,
  FsEncoding,
  FsEntry,
  FsEol,
  FsListResultFrame,
  FsMkdirResultFrame,
  FsMoveResultFrame,
  FsReadResultFrame,
  FsRemoveResultFrame,
  FsSessionRootResultFrame,
  FsWatchResultFrame,
  FsWriteResultFrame,
  ServerFrame,
} from './protocol';

type Listener = () => void;

/** The three faces of the page: a directory, a file being read, a file being edited. */
export type FsMode = 'list' | 'read' | 'edit';

/** One directory listing, exactly as the server answered it. */
export interface FsListing {
  /** The normalised path `fs.list.result` echoed: the breadcrumb is built from this, never guessed. */
  path: string;
  parent: string | null;
  entries: FsEntry[];
  /** The server stopped at its own limit: some entries are not here, and the page says so. */
  truncated: boolean;
  /** The directory could not be read. `entries` is empty when it is set. */
  error: string | null;
}

/** The open file: its metadata, the encoding contract, and the copy the page holds. */
export interface FsOpenFile {
  path: string;
  name: string;
  /** `${mtimeMs}-${size}`, the conflict contract every write echoes back. */
  etag: string | null;
  size: number | null;
  mtimeMs: number | null;
  /** Held so a write can put the file back the way it was: latin1 stays latin1, CRLF stays CRLF. */
  encoding: FsEncoding | null;
  eol: FsEol | null;
  /** Complete for a text file, null for a binary or a failed read. */
  text: string | null;
  binary: { reason: 'nul' | 'control' } | null;
  /** The read stopped at a window: the page holds the head of a bigger file, never all of it. */
  truncated: boolean;
  /** Byte offset the held copy starts at (always 0 today: an append extends the same window). */
  from: number;
  /** Byte offset to continue at, or null at the end of the file. */
  nextFrom: number | null;
  /** The server accepted `fs.watch` (false when the per-connection cap is reached). */
  watching: boolean;
  /** Why the read failed, when it did. */
  error: string | null;
}

/** The state the server refused to overwrite: `fs.write.result` carried it with `conflict`. */
export interface FsConflict {
  etag: string;
  size: number;
  mtimeMs: number;
}

/** Raised while editing when the file moved under the editor. Never a silent reload. */
export interface FsBanner {
  kind: 'changed' | 'removed';
  text: string;
}

export interface FsState {
  /** The page is on screen and the store is following it. */
  open: boolean;
  mode: FsMode;
  /** The directory the page is on: what was requested, until the answer echoes the normalised path. */
  dir: string | null;
  listing: FsListing | null;
  /** A `fs.list` is in flight. True before the first answer, so the page can say so. */
  listingLoading: boolean;
  file: FsOpenFile | null;
  /** A `fs.read` is in flight (a first open, a reload, or an append). */
  fileLoading: boolean;
  /** The edit buffer; non-null only in edit mode. */
  draft: string | null;
  /** The buffer differs from the copy the file was opened with. */
  dirty: boolean;
  saving: boolean;
  conflict: FsConflict | null;
  banner: FsBanner | null;
  /** A refusal or a failed read/write, stated where it was asked for. */
  error: string | null;
  /** A soft line: "created", "3 files sent", "binary, nothing to edit". */
  notice: string | null;
  /** The last directory visited: the page reopens there, and it survives a reboot through prefs. */
  lastDir: string | null;
}

/** The SharedPreferences key the last directory is remembered under. */
export const FS_LAST_DIR_KEY = 'fsLastDir';

const EMPTY: FsState = {
  open: false,
  mode: 'list',
  dir: null,
  listing: null,
  listingLoading: false,
  file: null,
  fileLoading: false,
  draft: null,
  dirty: false,
  saving: false,
  conflict: null,
  banner: null,
  error: null,
  notice: null,
  lastDir: null,
};

/** `/a/b/c` -> `c`; `/` keeps its own name. */
function baseName(path: string): string {
  if (path === '/') return '/';
  const trimmed = path.replace(/\/+$/, '');
  const cut = trimmed.lastIndexOf('/');
  return cut < 0 ? trimmed : trimmed.slice(cut + 1);
}

/** The etag a `fs.changed` notification carries, in the same shape `fs.read`/`fs.write` report. */
function etagOfChange(frame: { mtimeMs: number; size: number }): string {
  return `${frame.mtimeMs}-${frame.size}`;
}

/**
 * The path a request names, resolved the way the server resolves it. The answer carries the
 * normalised path (`fs.list.result` echoes what `resolve()` walked), so the echo check accepts
 * either spelling: the request we sent, or the path it would resolve to.
 */
function normalisePath(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return `/${out.join('/')}`;
}

function emptyFile(path: string, error: string | null): FsOpenFile {
  return {
    path,
    name: baseName(path),
    etag: null,
    size: null,
    mtimeMs: null,
    encoding: null,
    eol: null,
    text: null,
    binary: null,
    truncated: false,
    from: 0,
    nextFrom: null,
    watching: false,
    error,
  };
}

/**
 * The system files page: one directory, one file, one buffer.
 *
 * The protocol carries no request id: a `fs.*` answer echoes the path it answers, and that echo
 * is the whole correlation contract. The store therefore keeps the path it is *waiting on* and
 * drops any answer for another one -- a listing for a directory the owner has already left must
 * never be drawn under the new one (`stats.result` and its period work exactly the same way).
 *
 * Two rules keep this page from destroying data, and both are enforced here rather than in the
 * screen:
 *
 * - the read's etag, encoding and eol are kept and echoed back on save, so a latin1 file is not
 *   silently rewritten as utf8 and a CRLF file does not become LF;
 * - a save whose etag no longer matches lands as `conflict`: nothing is overwritten, the buffer
 *   stays under the owner's fingers, and the page offers reload or `force` explicitly. There is
 *   no silent save anywhere in this file.
 *
 * The server pushes `fs.changed` for our own writes too, so the etag a successful write reported
 * is kept and the matching notification is ignored: the page does not banner itself.
 */
class FsStoreImpl {
  private state: FsState = EMPTY;
  private listeners = new Set<Listener>();

  /** The directory the last `fs.list` asked about: an answer for any other path is stale. */
  private pendingDir: string | null = null;
  /** The file the last `fs.read` asked about: an answer for any other path is stale. */
  private pendingRead: string | null = null;
  /** The in-flight read continues the held copy instead of replacing it. */
  private appendPending = false;
  /** The in-flight write is a save (the editor's) or the creation of an empty file. */
  private pendingWrite: { kind: 'save' | 'create'; path: string } | null = null;
  /** The page was opened from a conversation: its workspace is where the answer lands. */
  private pendingThread: string | null = null;
  /** The user asked for the editor, and the read has not answered yet. */
  private editOnRead = false;
  /** One in-flight prefs read of the remembered directory. */
  private remembering: Promise<string | null> | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): FsState {
    return this.state;
  }

  /** Only tests need it: the store outlives a screen, on purpose. */
  reset(): void {
    this.state = EMPTY;
    this.pendingDir = null;
    this.pendingRead = null;
    this.appendPending = false;
    this.pendingWrite = null;
    this.pendingThread = null;
    this.editOnRead = false;
    this.remembering = null;
    this.emit();
  }

  /**
   * The page is on screen. The first visit lands on the remembered directory; a `startPath`
   * (a conversation's workspace) wins over it.
   */
  open(startPath?: string): void {
    if (this.state.open) return;
    this.state = { ...EMPTY, open: true, lastDir: this.state.lastDir };
    this.emit();
    const explicit = startPath?.trim();
    if (explicit) {
      this.navigate(explicit);
      return;
    }
    this.rememberedDir()
      .then(dir => {
        // A `fs.session.root` answer may have navigated while the prefs were being read: the
        // first directory of the session is the one the owner asked for, not the one from before.
        if (!this.state.open || this.state.dir !== null) return;
        this.navigate(dir ?? '/');
      })
      .catch(() => {});
  }

  /**
   * Opened from a conversation: the page starts on that session's workspace, which only the
   * server knows (`fs.session.root`). Until the answer lands the page sits on the remembered
   * directory, and the answer navigates it away.
   */
  openFromSession(threadId: string): void {
    this.open();
    this.pendingThread = threadId;
    this.send(encodeFsSessionRoot(threadId));
  }

  close(): void {
    const file = this.state.file;
    if (file) this.unwatch(file.path);
    this.pendingDir = null;
    this.pendingRead = null;
    this.appendPending = false;
    this.pendingWrite = null;
    this.pendingThread = null;
    this.editOnRead = false;
    this.state = { ...EMPTY, open: false, lastDir: this.state.lastDir };
    this.emit();
  }

  /** A directory was chosen: breadcrumb, row, or the page's own first landing. */
  navigate(path: string): void {
    const previous = this.state.file;
    if (previous) this.unwatch(previous.path);
    this.pendingDir = path;
    this.appendPending = false;
    this.pendingWrite = null;
    this.editOnRead = false;
    this.state = {
      ...this.state,
      open: true,
      mode: 'list',
      dir: path,
      listing: null,
      listingLoading: true,
      file: null,
      fileLoading: false,
      draft: null,
      dirty: false,
      saving: false,
      conflict: null,
      banner: null,
      error: null,
      lastDir: path,
    };
    this.emit();
    this.remember(path);
    this.send(encodeFsList(path));
  }

  /** Ask for the current directory again (after a create/rename/delete, or by hand). */
  refresh(): void {
    const dir = this.state.dir;
    if (!dir) return;
    this.pendingDir = dir;
    this.state = { ...this.state, listingLoading: true };
    this.emit();
    this.send(encodeFsList(dir));
  }

  /**
   * A file was tapped, or "Edit" was chosen on it. The editor is entered only once the read has
   * answered and said the file can be edited: binary and truncated files are read-only, and the
   * read is the only thing that knows.
   */
  openFile(path: string, options: { edit?: boolean } = {}): void {
    const previous = this.state.file;
    if (previous && previous.path !== path) this.unwatch(previous.path);
    this.pendingRead = path;
    this.appendPending = false;
    this.editOnRead = options.edit === true;
    this.state = {
      ...this.state,
      open: true,
      mode: 'read',
      file: previous && previous.path === path ? previous : null,
      fileLoading: true,
      draft: null,
      dirty: false,
      saving: false,
      conflict: null,
      banner: null,
      error: null,
    };
    this.emit();
    this.send(encodeFsRead(path));
  }

  /** Back to the listing, unwatching the file. The listing is refreshed rather than kept stale. */
  leaveFile(): void {
    const file = this.state.file;
    if (file) this.unwatch(file.path);
    this.appendPending = false;
    this.pendingWrite = null;
    this.editOnRead = false;
    this.state = {
      ...this.state,
      mode: 'list',
      file: null,
      fileLoading: false,
      draft: null,
      dirty: false,
      saving: false,
      conflict: null,
      banner: null,
      error: null,
    };
    this.emit();
    this.refresh();
  }

  /** The read-only view becomes an editor. Refused for a binary or a truncated file, said out loud. */
  beginEdit(): boolean {
    const file = this.state.file;
    if (!file || file.text === null || file.binary || file.truncated || file.error) {
      if (file?.binary) this.setNotice('this file is binary: there is nothing to edit in it');
      else if (file?.truncated) this.setNotice('this file is bigger than one read window: it opens read-only');
      return false;
    }
    this.state = { ...this.state, mode: 'edit', draft: file.text, dirty: false, conflict: null, banner: null };
    this.emit();
    return true;
  }

  /** One keystroke. Any content different from the opened copy is a change to save or lose. */
  editText(text: string): void {
    if (this.state.mode !== 'edit' || this.state.draft === null) return;
    if (text === this.state.draft) return;
    this.state = { ...this.state, draft: text, dirty: text !== this.state.file?.text };
    this.emit();
  }

  /**
   * Writes the buffer back with the etag, encoding and eol the read reported. `force` is the
   * owner's "overwrite anyway", offered only after the server refused a conflicting save.
   */
  save(force = false): void {
    const file = this.state.file;
    const draft = this.state.draft;
    if (this.state.mode !== 'edit' || !file || file.text === null || draft === null || !file.etag) return;
    this.pendingWrite = { kind: 'save', path: file.path };
    this.state = { ...this.state, saving: true, error: null, conflict: force ? null : this.state.conflict };
    this.emit();
    this.send(
      encodeFsWrite({
        path: file.path,
        text: draft,
        etag: file.etag,
        ...(force ? { force: true } : {}),
        ...(file.encoding ? { encoding: file.encoding } : {}),
        ...(file.eol ? { eol: file.eol } : {}),
      }),
    );
  }

  /** Overwrite anyway, after a conflict: the local buffer wins. */
  overwrite(): void {
    this.save(true);
  }

  /**
   * Takes the server's copy again. In read mode this is how a pushed change is followed up; in
   * edit mode it is the owner's explicit "take theirs", which is the only way local edits are
   * ever discarded.
   */
  reload(): void {
    const file = this.state.file;
    if (!file) return;
    this.pendingRead = file.path;
    this.appendPending = false;
    this.state = { ...this.state, fileLoading: true, error: null, conflict: null, banner: null, notice: null };
    this.emit();
    this.send(encodeFsRead(file.path));
  }

  /** Drops the buffer and goes back to reading. Never automatic: the screen asks first. */
  discardEdit(): void {
    const file = this.state.file;
    if (!file) return;
    this.state = { ...this.state, mode: 'read', draft: null, dirty: false, saving: false, conflict: null, banner: null };
    this.emit();
  }

  /** Hides the change banner. The document is already untouched; this only stops the nagging. */
  dismissBanner(): void {
    if (!this.state.banner) return;
    this.state = { ...this.state, banner: null };
    this.emit();
  }

  /** An empty write against an etag that names no file: the server's create case. */
  createFile(path: string): void {
    this.pendingWrite = { kind: 'create', path };
    this.state = { ...this.state, error: null };
    this.emit();
    this.send(encodeFsWrite({ path, text: '', etag: '' }));
  }

  createDir(path: string): void {
    this.state = { ...this.state, error: null };
    this.emit();
    this.send(encodeFsMkdir(path));
  }

  rename(from: string, to: string): void {
    this.move(from, to);
  }

  move(from: string, to: string): void {
    this.state = { ...this.state, error: null };
    this.emit();
    this.send(encodeFsMove(from, to));
  }

  /** `recursive` is the caller's explicit choice; a directory is never emptied by accident. */
  remove(path: string, recursive: boolean): void {
    this.state = { ...this.state, error: null };
    this.emit();
    this.send(encodeFsRemove(path, recursive));
  }

  /** A soft line under the toolbar (upload done, edit refused...). The screen sets its own too. */
  setNotice(message: string | null): void {
    this.state = { ...this.state, notice: message };
    this.emit();
  }

  /** An `error` frame with the `fs` scope: a refusal from the server, named. */
  fail(message: string): void {
    this.state = {
      ...this.state,
      error: message,
      listingLoading: false,
      fileLoading: false,
      saving: false,
    };
    this.emit();
  }

  /**
   * Every `fs.*` server frame. Returns whether it was one: the router can hand this the whole
   * stream, and an answer for a path the page has left is dropped here rather than drawn.
   */
  receive(frame: ServerFrame): boolean {
    switch (frame.type) {
      case 'fs.list.result':
        return this.receiveList(frame);
      case 'fs.read.result':
        return this.receiveRead(frame);
      case 'fs.write.result':
        return this.receiveWrite(frame);
      case 'fs.mkdir.result':
        return this.receiveMkdir(frame);
      case 'fs.move.result':
        return this.receiveMove(frame);
      case 'fs.remove.result':
        return this.receiveRemove(frame);
      case 'fs.watch.result':
        return this.receiveWatch(frame);
      case 'fs.changed':
        return this.receiveChanged(frame);
      case 'fs.session.root.result':
        return this.receiveSessionRoot(frame);
      default:
        return false;
    }
  }

  private receiveList(frame: FsListResultFrame): boolean {
    if (!this.state.open) return false;
    // The echoed path is the contract: an answer for a directory the owner has already left is
    // not drawn under the new one, and there is no request id to correlate them instead. The
    // server normalises before it answers, so the request's own resolution is accepted too.
    if (frame.path !== this.pendingDir && frame.path !== normalisePath(this.pendingDir ?? '')) return false;
    this.state = {
      ...this.state,
      dir: frame.path,
      listing: {
        path: frame.path,
        parent: frame.parent,
        entries: frame.entries,
        truncated: frame.truncated,
        error: frame.error ?? null,
      },
      listingLoading: false,
      lastDir: frame.path,
    };
    this.emit();
    return true;
  }

  private receiveRead(frame: FsReadResultFrame): boolean {
    if (!this.state.open) return false;
    if (frame.path !== this.pendingRead) return false;
    const append = this.appendPending;
    const askedForEditor = this.editOnRead;
    const previous = this.state.file;
    this.appendPending = false;
    this.editOnRead = false;

    if (frame.error) {
      this.state = {
        ...this.state,
        mode: 'read',
        file: emptyFile(frame.path, frame.error),
        fileLoading: false,
        draft: null,
        dirty: false,
        saving: false,
        conflict: null,
        banner: null,
      };
      this.emit();
      return true;
    }

    // An append continues the copy the page already holds -- [0, from) + [from, nextFrom) -- and
    // only for the same file: a window for another path never splices into this one.
    const continues = append && previous !== null && previous.path === frame.path && previous.text !== null;
    const merged = continues && frame.text !== undefined ? previous.text + frame.text : frame.text ?? null;
    const editable = merged !== null && !frame.binary && !frame.truncated;
    const wantsEditor = !append && (askedForEditor || this.state.mode === 'edit');
    const enterEdit = wantsEditor && editable;
    if (wantsEditor && !enterEdit) {
      if (frame.binary) this.setNotice('binary file: metadata only, nothing to edit');
      else if (frame.truncated) this.setNotice('the file is bigger than one read window: it opens read-only');
    }
    const file: FsOpenFile = {
      path: frame.path,
      name: baseName(frame.path),
      etag: frame.etag ?? null,
      size: frame.size ?? null,
      mtimeMs: frame.mtimeMs ?? null,
      encoding: frame.encoding ?? null,
      eol: frame.eol ?? null,
      text: merged,
      binary: frame.binary ?? null,
      truncated: frame.truncated,
      from: continues ? previous.from : frame.from,
      nextFrom: frame.nextFrom,
      watching: previous?.path === frame.path ? previous.watching : false,
      error: null,
    };
    this.state = {
      ...this.state,
      mode: enterEdit ? 'edit' : 'read',
      file,
      fileLoading: false,
      draft: enterEdit ? merged : null,
      dirty: false,
      conflict: append ? this.state.conflict : null,
      banner: null,
    };
    this.emit();
    // Watch only a file that answered with a path: watching what does not exist is cheap on the
    // server but a notification that can never come.
    if (previous?.path !== frame.path) this.send(encodeFsWatch(frame.path));
    return true;
  }

  private receiveWrite(frame: FsWriteResultFrame): boolean {
    const pending = this.pendingWrite;
    if (pending && pending.path === frame.path) {
      this.pendingWrite = null;
      if (pending.kind === 'create') {
        if (frame.error) this.setNotice(`could not create: ${frame.error}`);
        else if (frame.conflict) this.setNotice('a file with that name already exists');
        else {
          this.setNotice(`created ${baseName(frame.path)}`);
          this.refresh();
        }
        return true;
      }
    }
    const file = this.state.file;
    if (!this.state.open || !file || frame.path !== file.path) return false;
    if (frame.error) {
      this.state = { ...this.state, saving: false, error: frame.error };
      this.emit();
      return true;
    }
    if (frame.conflict) {
      // Nothing is overwritten and the buffer stays exactly where the owner left it: the page
      // offers reload or `force` from here, and neither of them is a silent save.
      this.state = { ...this.state, saving: false, conflict: frame.conflict };
      this.emit();
      return true;
    }
    const draft = this.state.draft;
    this.state = {
      ...this.state,
      saving: false,
      conflict: null,
      banner: null,
      dirty: false,
      // The etag the write reported is what the next `fs.changed` must match to be recognised as
      // ours: without it the server's echo of our own save would raise the editor's banner.
      file: {
        ...file,
        etag: frame.etag ?? file.etag,
        size: frame.size ?? file.size,
        mtimeMs: frame.mtimeMs ?? file.mtimeMs,
        text: draft ?? file.text,
      },
    };
    this.emit();
    return true;
  }

  private receiveMkdir(frame: FsMkdirResultFrame): boolean {
    if (!this.state.open) return false;
    this.setNotice(`created ${baseName(frame.path)}`);
    this.refresh();
    return true;
  }

  private receiveMove(frame: FsMoveResultFrame): boolean {
    if (!this.state.open) return false;
    this.setNotice(`moved to ${frame.to}`);
    this.refresh();
    return true;
  }

  private receiveRemove(frame: FsRemoveResultFrame): boolean {
    if (!this.state.open) return false;
    this.setNotice(`removed ${baseName(frame.path)}`);
    this.refresh();
    return true;
  }

  private receiveWatch(frame: FsWatchResultFrame): boolean {
    const file = this.state.file;
    // An `fs.unwatch` answer arrives after the file was left, and a watch answer for another file
    // is one the page has moved on from: both are dropped, like every other stale echo.
    if (!file || frame.path !== file.path) return false;
    this.state = { ...this.state, file: { ...file, watching: frame.watching } };
    this.emit();
    return true;
  }

  private receiveChanged(frame: FsChangedFrame): boolean {
    const file = this.state.file;
    if (!this.state.open || !file || frame.path !== file.path) return false;
    // The server pushes `fs.changed` for our own writes too. The write answer already moved the
    // etag, so a notification carrying it is us: no banner, no reload, no echo of our own hand.
    if (file.etag && etagOfChange(frame) === file.etag) return true;
    if (this.state.mode === 'edit') {
      this.state = {
        ...this.state,
        banner: {
          kind: frame.kind,
          text:
            frame.kind === 'removed'
              ? 'the file was removed on the server while you were editing'
              : 'the file changed on the server while you were editing',
        },
      };
      this.emit();
      return true;
    }
    this.follow(frame);
    return true;
  }

  /**
   * Read mode follows the file. A file that only grew is appended -- from `nextFrom` for a
   * windowed copy, from the old byte size for a complete one -- so a tailing log does not cost a
   * full re-read per line. Everything else (shrank, replaced, removed) reloads.
   */
  private follow(frame: FsChangedFrame): void {
    const file = this.state.file;
    if (!file) return;
    if (frame.kind === 'changed' && file.text !== null && file.size !== null && frame.size > file.size) {
      const from = file.truncated ? file.nextFrom : file.size;
      if (from !== null) {
        this.pendingRead = file.path;
        this.appendPending = true;
        this.send(encodeFsRead(file.path, { from }));
        return;
      }
    }
    this.reload();
  }

  private receiveSessionRoot(frame: FsSessionRootResultFrame): boolean {
    if (!this.state.open || this.pendingThread !== frame.threadId) return false;
    this.pendingThread = null;
    this.navigate(frame.path);
    return true;
  }

  /** The remembered directory: module state first, then the prefs bridge (one read per mount). */
  private rememberedDir(): Promise<string | null> {
    if (this.state.lastDir) return Promise.resolve(this.state.lastDir);
    this.remembering ??= deviceBridge
      .prefsGetAll()
      .then(raw => raw[FS_LAST_DIR_KEY]?.trim() || null)
      .catch(() => null);
    return this.remembering;
  }

  private remember(path: string): void {
    // Fire and forget: a failed write only costs the directory on the next cold start.
    deviceBridge.prefsSet(FS_LAST_DIR_KEY, path).catch(() => {});
  }

  private unwatch(path: string): void {
    this.send(encodeFsUnwatch(path));
  }

  private send(frame: string): void {
    connection.send(frame).catch(() => {});
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const fsStore = new FsStoreImpl();

const subscribe = (listener: Listener): (() => void) => fsStore.subscribe(listener);

export function useFsStore(): FsState {
  return useSyncExternalStore(subscribe, () => fsStore.getSnapshot());
}

/** Dossiers first (a symlink that resolves to one counts), then names, case-insensitively. */
export function sortEntries(entries: FsEntry[]): FsEntry[] {
  const isDir = (entry: FsEntry): boolean => entry.kind === 'dir' || entry.targetKind === 'dir';
  return [...entries].sort((a, b) => {
    const dirs = isDir(a) === isDir(b) ? 0 : isDir(a) ? -1 : 1;
    if (dirs !== 0) return dirs;
    const an = a.name.toLowerCase();
    const bn = b.name.toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    if (a.name === b.name) return 0;
    return a.name < b.name ? -1 : 1;
  });
}
