/**
 * The system files store, held to the eight things it promises the page.
 *
 * The protocol has no request id: every `fs.*` answer echoes the path it answers, and that echo
 * is the only correlation there is. So the first test is the one everything else leans on -- an
 * answer for a path the page has left is dropped -- and the rest are the ways this store must
 * refuse to destroy something: a latin1/CRLF file staying latin1/CRLF, a conflicting save not
 * overwriting, an editor not being reloaded under the owner's fingers, our own write not raising
 * its own banner, a binary not being offered to the editor, and a truncated read saying so.
 */

import { connection } from '../connection';
import { deviceBridge } from '../nativeBridge';
import { fsStore, sortEntries } from '../fsStore';
import type {
  FsEntry,
  FsListResultFrame,
  FsReadResultFrame,
  FsWriteResultFrame,
} from '../protocol';

jest.mock('../connection', () => ({
  connection: { send: jest.fn(() => Promise.resolve(true)) },
}));

const send = connection.send as jest.MockedFunction<typeof connection.send>;
const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

function sent(): Array<Record<string, unknown>> {
  return send.mock.calls.map(([frame]) => JSON.parse(String(frame)) as Record<string, unknown>);
}

function framesOf(type: string): Array<Record<string, unknown>> {
  return sent().filter(frame => frame.type === type);
}

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function entry(over: Partial<FsEntry> & { name: string; path: string }): FsEntry {
  return { kind: 'file', size: 10, mtimeMs: 1_700_000_000_000, mode: 0o644, textHint: true, ...over };
}

function listResult(path: string, entries: FsEntry[] = [], over: Partial<FsListResultFrame> = {}): FsListResultFrame {
  const parent = path === '/' ? null : path.slice(0, path.lastIndexOf('/')) || '/';
  return { type: 'fs.list.result', path, parent, entries, truncated: false, ...over };
}

function readResult(over: Partial<FsReadResultFrame> = {}): FsReadResultFrame {
  return {
    type: 'fs.read.result',
    path: '/f.txt',
    etag: '111-3',
    size: 3,
    mtimeMs: 111,
    encoding: 'utf8',
    eol: 'lf',
    text: 'abc',
    lines: 1,
    from: 0,
    nextFrom: null,
    truncated: false,
    ...over,
  };
}

function writeResult(over: Partial<FsWriteResultFrame> = {}): FsWriteResultFrame {
  return { type: 'fs.write.result', path: '/f.txt', ...over };
}

/** The page, open on a directory, with its listing already answered. */
function openOn(path: string, entries: FsEntry[] = []): void {
  fsStore.open(path);
  fsStore.receive(listResult(path, entries));
}

beforeEach(() => {
  fsStore.reset();
  jest.clearAllMocks();
  send.mockResolvedValue(true);
  bridge.prefsGetAll.mockResolvedValue({});
});

describe('the echo of the path is the contract', () => {
  test('an answer for a directory the page has left is dropped, not drawn under the new one', () => {
    fsStore.open('/home');

    // The page is waiting, and says so, until the answer for what it asked for arrives.
    expect(fsStore.getSnapshot().listingLoading).toBe(true);
    expect(fsStore.getSnapshot().listing).toBeNull();
    expect(sent()).toContainEqual({ type: 'fs.list', path: '/home' });

    expect(fsStore.receive(listResult('/', [entry({ name: 'rootfile', path: '/rootfile' })]))).toBe(false);
    expect(fsStore.getSnapshot().listing).toBeNull();
    expect(fsStore.getSnapshot().listingLoading).toBe(true);

    expect(fsStore.receive(listResult('/home', [entry({ name: 'a', path: '/home/a' })]))).toBe(true);
    expect(fsStore.getSnapshot().listing?.path).toBe('/home');
    expect(fsStore.getSnapshot().listingLoading).toBe(false);
  });

  test('navigating away twice drops the answer to the directory in between', () => {
    fsStore.open('/a');
    fsStore.navigate('/b');
    clearSend();

    expect(fsStore.receive(listResult('/a'))).toBe(false);
    expect(fsStore.getSnapshot().listing).toBeNull();

    expect(fsStore.receive(listResult('/b', [entry({ name: 'b', path: '/b/b' })]))).toBe(true);
    expect(fsStore.getSnapshot().listing?.path).toBe('/b');
  });

  test('a read answer for another file is dropped too', () => {
    openOn('/home');
    fsStore.openFile('/home/one.txt');
    fsStore.openFile('/home/two.txt');
    clearSend();

    expect(fsStore.receive(readResult({ path: '/home/one.txt', text: 'one' }))).toBe(false);
    expect(fsStore.getSnapshot().file).toBeNull();

    expect(fsStore.receive(readResult({ path: '/home/two.txt', text: 'two' }))).toBe(true);
    expect(fsStore.getSnapshot().file?.text).toBe('two');
  });

  test('the server normalises the path it echoes, and that answer is accepted', () => {
    fsStore.open('/home/neras/..');

    expect(fsStore.receive(listResult('/home', [entry({ name: 'x', path: '/home/x' })]))).toBe(true);
    expect(fsStore.getSnapshot().dir).toBe('/home');
    expect(fsStore.getSnapshot().listing?.path).toBe('/home');
  });

  test('an answer that lands after the page closed has nowhere to land', () => {
    fsStore.open('/home');
    fsStore.close();

    expect(fsStore.receive(listResult('/home'))).toBe(false);
    expect(fsStore.getSnapshot().open).toBe(false);
    expect(fsStore.getSnapshot().listing).toBeNull();
  });

  test('a watch answer for a file the page has left is dropped', () => {
    openOn('/home');
    fsStore.openFile('/home/one.txt');
    fsStore.receive(readResult({ path: '/home/one.txt' }));
    fsStore.openFile('/home/two.txt');
    fsStore.receive(readResult({ path: '/home/two.txt' }));

    expect(fsStore.receive({ type: 'fs.watch.result', path: '/home/one.txt', watching: true })).toBe(false);
    expect(fsStore.getSnapshot().file?.watching).toBe(false);
    expect(fsStore.receive({ type: 'fs.watch.result', path: '/home/two.txt', watching: true })).toBe(true);
    expect(fsStore.getSnapshot().file?.watching).toBe(true);
  });

  test('a frame that is not one of ours is not claimed', () => {
    expect(fsStore.receive({ type: 'hello', version: '0.7.23' })).toBe(false);
  });
});

describe('the etag, the encoding and the eol make the round trip', () => {
  test('a save echoes exactly what the read reported', () => {
    openOn('/etc');
    fsStore.openFile('/etc/latin1.conf');
    fsStore.receive(
      readResult({
        path: '/etc/latin1.conf',
        etag: '111-6',
        size: 6,
        mtimeMs: 111,
        encoding: 'latin1',
        eol: 'crlf',
        text: 'caf\u00e9\r\n',
      }),
    );
    expect(fsStore.beginEdit()).toBe(true);
    fsStore.editText('caf\u00e9!');
    clearSend();
    fsStore.save();

    expect(sent()).toContainEqual({
      type: 'fs.write',
      path: '/etc/latin1.conf',
      text: 'caf\u00e9!',
      etag: '111-6',
      encoding: 'latin1',
      eol: 'crlf',
    });
  });

  test('the etag a successful write reported is what the next save sends', () => {
    openOn('/etc');
    fsStore.openFile('/etc/f.txt');
    fsStore.receive(readResult({ path: '/etc/f.txt', etag: '111-3' }));
    fsStore.beginEdit();
    fsStore.editText('abcd');
    fsStore.save();
    fsStore.receive(writeResult({ path: '/etc/f.txt', etag: '222-4', size: 4, mtimeMs: 222 }));
    clearSend();
    fsStore.save();

    expect(sent()).toContainEqual({
      type: 'fs.write',
      path: '/etc/f.txt',
      text: 'abcd',
      etag: '222-4',
      encoding: 'utf8',
      eol: 'lf',
    });
  });
});

describe('a conflict is never overwritten silently', () => {
  function conflictScenario(): FsWriteResultFrame {
    openOn('/etc');
    fsStore.openFile('/etc/f.txt');
    fsStore.receive(readResult({ path: '/etc/f.txt' }));
    fsStore.beginEdit();
    fsStore.editText('mine');
    fsStore.save();
    return writeResult({
      path: '/etc/f.txt',
      etag: '999-99',
      size: 99,
      mtimeMs: 999,
      conflict: { etag: '999-99', size: 99, mtimeMs: 999 },
    });
  }

  test('the conflict is kept, the buffer is untouched, and nothing was written', () => {
    const result = conflictScenario();
    clearSend();

    expect(fsStore.receive(result)).toBe(true);
    const state = fsStore.getSnapshot();
    expect(state.conflict).toEqual({ etag: '999-99', size: 99, mtimeMs: 999 });
    expect(state.dirty).toBe(true);
    expect(state.draft).toBe('mine');
    // The opened copy is what it was: a refused save changes nothing on either side.
    expect(state.file?.text).toBe('abc');
    expect(state.file?.etag).toBe('111-3');
    expect(state.saving).toBe(false);
    expect(sent()).toHaveLength(0);
  });

  test('"overwrite anyway" is force: true, and "reload" takes the server copy', () => {
    fsStore.receive(conflictScenario());
    clearSend();
    fsStore.overwrite();
    expect(sent()).toContainEqual({
      type: 'fs.write',
      path: '/etc/f.txt',
      text: 'mine',
      etag: '111-3',
      force: true,
      encoding: 'utf8',
      eol: 'lf',
    });

    clearSend();
    fsStore.reload();
    expect(sent()).toContainEqual({ type: 'fs.read', path: '/etc/f.txt' });
    fsStore.receive(readResult({ path: '/etc/f.txt', etag: '999-99', size: 99, mtimeMs: 999, text: 'theirs' }));
    const state = fsStore.getSnapshot();
    expect(state.conflict).toBeNull();
    expect(state.draft).toBe('theirs');
    expect(state.dirty).toBe(false);
  });
});

describe('a file changed by someone else', () => {
  test('read mode appends when the file only grew and the copy is complete', () => {
    openOn('/var/log');
    fsStore.openFile('/var/log/app.log');
    fsStore.receive(readResult({ path: '/var/log/app.log', etag: '111-3', size: 3, mtimeMs: 111, text: 'abc' }));
    clearSend();

    fsStore.receive({ type: 'fs.changed', path: '/var/log/app.log', kind: 'changed', size: 6, mtimeMs: 222 });
    // The tail is re-read from where the held copy ends, not from the top.
    expect(sent()).toContainEqual({ type: 'fs.read', path: '/var/log/app.log', from: 3 });

    fsStore.receive(
      readResult({
        path: '/var/log/app.log',
        etag: '222-6',
        size: 6,
        mtimeMs: 222,
        text: 'def',
        from: 3,
        nextFrom: null,
      }),
    );
    expect(fsStore.getSnapshot().file?.text).toBe('abcdef');
    expect(fsStore.getSnapshot().file?.etag).toBe('222-6');
    expect(fsStore.getSnapshot().file?.size).toBe(6);
  });

  test('a windowed copy appends from nextFrom', () => {
    openOn('/var/log');
    fsStore.openFile('/var/log/big.log');
    fsStore.receive(
      readResult({
        path: '/var/log/big.log',
        etag: '111-2000000',
        size: 2_000_000,
        mtimeMs: 111,
        text: 'head',
        nextFrom: 2_000_000,
        truncated: true,
      }),
    );
    clearSend();

    fsStore.receive({ type: 'fs.changed', path: '/var/log/big.log', kind: 'changed', size: 2_500_000, mtimeMs: 222 });
    expect(sent()).toContainEqual({ type: 'fs.read', path: '/var/log/big.log', from: 2_000_000 });
  });

  test('a file that shrank or was replaced is re-read from the top', () => {
    openOn('/var/log');
    fsStore.openFile('/var/log/app.log');
    fsStore.receive(readResult({ path: '/var/log/app.log', size: 3, text: 'abc' }));
    clearSend();

    fsStore.receive({ type: 'fs.changed', path: '/var/log/app.log', kind: 'changed', size: 1, mtimeMs: 333 });
    expect(sent()).toContainEqual({ type: 'fs.read', path: '/var/log/app.log' });
    expect(sent().filter(frame => frame.from !== undefined)).toHaveLength(0);
  });

  test('edit mode raises a banner and never touches the document', () => {
    openOn('/etc');
    fsStore.openFile('/etc/f.txt');
    fsStore.receive(readResult({ path: '/etc/f.txt' }));
    fsStore.beginEdit();
    fsStore.editText('mine');
    clearSend();

    fsStore.receive({ type: 'fs.changed', path: '/etc/f.txt', kind: 'changed', size: 99, mtimeMs: 999 });
    const state = fsStore.getSnapshot();
    expect(state.banner?.kind).toBe('changed');
    expect(state.draft).toBe('mine');
    // Reloading under the owner's fingers would delete what they are typing: nothing is asked,
    // nothing is replaced.
    expect(sent()).toEqual([]);

    fsStore.dismissBanner();
    expect(fsStore.getSnapshot().banner).toBeNull();
    expect(fsStore.getSnapshot().draft).toBe('mine');
  });

  test('a removal under the editor says so instead of pretending the file is there', () => {
    openOn('/etc');
    fsStore.openFile('/etc/f.txt');
    fsStore.receive(readResult({ path: '/etc/f.txt' }));
    fsStore.beginEdit();
    clearSend();

    fsStore.receive({ type: 'fs.changed', path: '/etc/f.txt', kind: 'removed', size: 0, mtimeMs: 0 });
    expect(fsStore.getSnapshot().banner?.kind).toBe('removed');
    expect(sent()).toEqual([]);
  });
});

describe('our own write does not raise our own banner', () => {
  test('the notification matching the write answer is ignored', () => {
    openOn('/etc');
    fsStore.openFile('/etc/f.txt');
    fsStore.receive(readResult({ path: '/etc/f.txt' }));
    fsStore.beginEdit();
    fsStore.editText('abcd');
    fsStore.save();
    fsStore.receive(writeResult({ path: '/etc/f.txt', etag: '222-4', size: 4, mtimeMs: 222 }));
    clearSend();

    fsStore.receive({ type: 'fs.changed', path: '/etc/f.txt', kind: 'changed', size: 4, mtimeMs: 222 });
    const state = fsStore.getSnapshot();
    expect(state.banner).toBeNull();
    expect(state.dirty).toBe(false);
    expect(sent()).toEqual([]);
  });

  test('a notification that does not match the write answer is somebody else, and banners', () => {
    openOn('/etc');
    fsStore.openFile('/etc/f.txt');
    fsStore.receive(readResult({ path: '/etc/f.txt' }));
    fsStore.beginEdit();
    fsStore.editText('abcd');
    fsStore.save();
    fsStore.receive(writeResult({ path: '/etc/f.txt', etag: '222-4', size: 4, mtimeMs: 222 }));

    fsStore.receive({ type: 'fs.changed', path: '/etc/f.txt', kind: 'changed', size: 5, mtimeMs: 333 });
    expect(fsStore.getSnapshot().banner?.kind).toBe('changed');
  });
});

describe('dirty and saved', () => {
  test('typing marks dirty, a successful save cleans it', () => {
    openOn('/etc');
    fsStore.openFile('/etc/f.txt');
    fsStore.receive(readResult({ path: '/etc/f.txt' }));
    fsStore.beginEdit();
    expect(fsStore.getSnapshot().dirty).toBe(false);

    fsStore.editText('abcd');
    expect(fsStore.getSnapshot().dirty).toBe(true);

    fsStore.save();
    fsStore.receive(writeResult({ path: '/etc/f.txt', etag: '222-4', size: 4, mtimeMs: 222 }));
    expect(fsStore.getSnapshot().dirty).toBe(false);
    expect(fsStore.getSnapshot().file?.text).toBe('abcd');
  });

  test('a refused save keeps the buffer dirty: nothing was written', () => {
    openOn('/etc');
    fsStore.openFile('/etc/f.txt');
    fsStore.receive(readResult({ path: '/etc/f.txt' }));
    fsStore.beginEdit();
    fsStore.editText('abcd');
    fsStore.save();
    fsStore.receive(writeResult({ path: '/etc/f.txt', error: 'EACCES: permission denied' }));

    expect(fsStore.getSnapshot().dirty).toBe(true);
    expect(fsStore.getSnapshot().error).toBe('EACCES: permission denied');
    expect(fsStore.getSnapshot().saving).toBe(false);
  });

  test('editing back to the opened copy stops being dirty', () => {
    openOn('/etc');
    fsStore.openFile('/etc/f.txt');
    fsStore.receive(readResult({ path: '/etc/f.txt' }));
    fsStore.beginEdit();
    fsStore.editText('abcd');
    fsStore.editText('abc');
    expect(fsStore.getSnapshot().dirty).toBe(false);
  });
});

describe('binary and truncated files', () => {
  test('a binary answers with metadata and cannot be edited', () => {
    openOn('/bin');
    fsStore.openFile('/bin/blob');
    fsStore.receive(readResult({ path: '/bin/blob', binary: { reason: 'nul' }, text: undefined }));

    const state = fsStore.getSnapshot();
    expect(state.file?.binary).toEqual({ reason: 'nul' });
    expect(state.file?.text).toBeNull();
    expect(state.mode).toBe('read');
    expect(fsStore.beginEdit()).toBe(false);
    expect(fsStore.getSnapshot().mode).toBe('read');
    expect(fsStore.getSnapshot().notice).toContain('binary');
  });

  test('a truncated read says so, keeps the real size, and cannot be edited', () => {
    openOn('/var/log');
    fsStore.openFile('/var/log/big.log');
    fsStore.receive(
      readResult({
        path: '/var/log/big.log',
        size: 5_000_000,
        text: 'head',
        nextFrom: 2_000_000,
        truncated: true,
      }),
    );

    const state = fsStore.getSnapshot();
    expect(state.file?.truncated).toBe(true);
    expect(state.file?.size).toBe(5_000_000);
    expect(state.file?.text).toBe('head');
    expect(fsStore.beginEdit()).toBe(false);
    expect(fsStore.getSnapshot().notice).toContain('read-only');
  });

  test('asking for the editor on a file that turns out binary lands in read mode', () => {
    openOn('/bin');
    fsStore.openFile('/bin/blob', { edit: true });
    fsStore.receive(readResult({ path: '/bin/blob', binary: { reason: 'control' }, text: undefined }));

    expect(fsStore.getSnapshot().mode).toBe('read');
    expect(fsStore.getSnapshot().draft).toBeNull();
  });
});

describe('the page lifecycle', () => {
  test('the first visit lands on the remembered directory from the prefs bridge', async () => {
    bridge.prefsGetAll.mockResolvedValue({ fsLastDir: '/var/log' });
    fsStore.open();
    await flush();

    expect(sent()).toContainEqual({ type: 'fs.list', path: '/var/log' });
  });

  test('the last directory visited is remembered and written back', async () => {
    fsStore.open('/home');
    fsStore.receive(listResult('/home'));
    expect(bridge.prefsSet).toHaveBeenCalledWith('fsLastDir', '/home');

    fsStore.close();
    clearSend();
    fsStore.open();
    await flush();
    expect(sent()).toContainEqual({ type: 'fs.list', path: '/home' });
  });

  test('opening from a conversation asks for the session root and navigates there', () => {
    fsStore.openFromSession('t-1');
    expect(sent()).toContainEqual({ type: 'fs.session.root', threadId: 't-1' });

    expect(fsStore.receive({ type: 'fs.session.root.result', threadId: 'other', path: '/elsewhere' })).toBe(false);
    expect(fsStore.receive({ type: 'fs.session.root.result', threadId: 't-1', path: '/home/neras/dev' })).toBe(true);
    expect(sent()).toContainEqual({ type: 'fs.list', path: '/home/neras/dev' });
  });

  test('opening a file watches it, leaving unwatches it and refreshes the listing', () => {
    openOn('/var/log');
    fsStore.openFile('/var/log/app.log');
    fsStore.receive(readResult({ path: '/var/log/app.log' }));
    expect(sent()).toContainEqual({ type: 'fs.watch', path: '/var/log/app.log' });

    clearSend();
    fsStore.leaveFile();
    expect(sent()).toContainEqual({ type: 'fs.unwatch', path: '/var/log/app.log' });
    expect(sent()).toContainEqual({ type: 'fs.list', path: '/var/log' });
    expect(fsStore.getSnapshot().mode).toBe('list');
    expect(fsStore.getSnapshot().file).toBeNull();
  });

  test('a failed read is a state, not a spinning page', () => {
    openOn('/etc');
    fsStore.openFile('/etc/gone');
    fsStore.receive({ type: 'fs.read.result', path: '/etc/gone', from: 0, nextFrom: null, truncated: false, error: 'ENOENT' });

    expect(fsStore.getSnapshot().fileLoading).toBe(false);
    expect(fsStore.getSnapshot().file?.error).toBe('ENOENT');
    // Nothing to watch: the read answered an error, not a path.
    expect(framesOf('fs.watch')).toHaveLength(0);
  });

  test('an fs refusal stops every spinner and is stated where it was asked for', () => {
    openOn('/etc');
    fsStore.createDir('/etc/blocked');
    fsStore.fail('fs.mkdir failed: EACCES');

    expect(fsStore.getSnapshot().error).toBe('fs.mkdir failed: EACCES');
    expect(fsStore.getSnapshot().listingLoading).toBe(false);
  });
});

describe('directory operations ask for a fresh listing', () => {
  test('mkdir, move and remove all refresh the directory they touched', () => {
    openOn('/home', [entry({ name: 'a', path: '/home/a' })]);
    clearSend();

    fsStore.receive({ type: 'fs.mkdir.result', path: '/home/newdir' });
    expect(sent()).toContainEqual({ type: 'fs.list', path: '/home' });
    expect(fsStore.getSnapshot().notice).toBe('created newdir');

    clearSend();
    fsStore.receive({ type: 'fs.move.result', from: '/home/a', to: '/home/b' });
    expect(sent()).toContainEqual({ type: 'fs.list', path: '/home' });

    clearSend();
    fsStore.receive({ type: 'fs.remove.result', path: '/home/b' });
    expect(sent()).toContainEqual({ type: 'fs.list', path: '/home' });
    expect(fsStore.getSnapshot().notice).toBe('removed b');
  });

  test('creating a file is the empty write the server calls a create', () => {
    openOn('/home');
    clearSend();
    fsStore.createFile('/home/notes.md');
    expect(sent()).toContainEqual({ type: 'fs.write', path: '/home/notes.md', text: '', etag: '' });

    fsStore.receive(writeResult({ path: '/home/notes.md', etag: '999-0', size: 0, mtimeMs: 999 }));
    expect(fsStore.getSnapshot().notice).toBe('created notes.md');
    expect(sent()).toContainEqual({ type: 'fs.list', path: '/home' });
  });

  test('creating a file that already exists says so instead of conflicting the editor', () => {
    openOn('/home');
    fsStore.createFile('/home/notes.md');
    fsStore.receive(
      writeResult({ path: '/home/notes.md', etag: '111-3', size: 3, mtimeMs: 111, conflict: { etag: '111-3', size: 3, mtimeMs: 111 } }),
    );

    expect(fsStore.getSnapshot().conflict).toBeNull();
    expect(fsStore.getSnapshot().notice).toBe('a file with that name already exists');
  });

  test('removing a folder asks for recursive explicitly, and the frame carries it', () => {
    openOn('/home');
    clearSend();
    fsStore.remove('/home/node_modules', true);
    expect(sent()).toContainEqual({ type: 'fs.remove', path: '/home/node_modules', recursive: true });
  });
});

describe('sortEntries', () => {
  const names = (entries: FsEntry[]): string[] => sortEntries(entries).map(e => e.name);

  test('directories first, then names, case-insensitively', () => {
    const entries = [
      entry({ name: 'zeta.txt', path: '/z/zeta.txt' }),
      entry({ name: 'Beta', path: '/Beta', kind: 'dir' }),
      entry({ name: 'alpha', path: '/alpha' }),
      entry({ name: 'apple', path: '/apple', kind: 'dir' }),
    ];
    expect(names(entries)).toEqual(['apple', 'Beta', 'alpha', 'zeta.txt']);
  });

  test('a symlink that resolves to a directory sorts with the directories', () => {
    const entries = [
      entry({ name: 'file', path: '/file' }),
      entry({ name: 'link', path: '/link', kind: 'symlink', targetKind: 'dir' }),
      entry({ name: 'dangling', path: '/dangling', kind: 'symlink' }),
    ];
    expect(names(entries)).toEqual(['link', 'dangling', 'file']);
  });
});

function clearSend(): void {
  send.mockClear();
}
