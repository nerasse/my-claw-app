/**
 * The system files page.
 *
 * It is the only screen that can edit anything on the machine my-claw runs on, so the tests are
 * about what it refuses: a binary is never offered to the editor, a conflicting save is never
 * silent (both ways out are on screen), a change under an editor never replaces the document,
 * and a dirty buffer never leaves without being asked about.
 *
 * CodeMirror is mocked -- a real one is a WebView and a device, and the page's contract with it
 * is only `value`/`readOnly`/`language` and one `onChange` -- and the frames are handed to the
 * store directly, because the router wiring is the shell's side of this page.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text, View as HostBox } from 'react-native';
import { SystemFilesScreen } from '../SystemFilesScreen';
import { OverlayHost } from '../../components/OverlayHost';
import { DownloadControl } from '../../components/DownloadControl';
import { overlayStore } from '../../core/overlay';
import { fsStore } from '../../core/fsStore';
import { connection } from '../../core/connection';
import { deviceBridge } from '../../core/nativeBridge';
import type { FsEntry, FsListResultFrame, FsReadResultFrame, FsWriteResultFrame, ServerFrame } from '../../core/protocol';

// The real singleton owns a socket and its reconnect timers; reaching it from a screen test
// leaks them past the run.
jest.mock('../../core/connection', () => ({
  connection: { send: jest.fn(() => Promise.resolve(true)) },
}));

// The host would mount a WebView and a real CodeMirror page: what the page is held to is the
// props it hands over, and one `onChange` coming back.
jest.mock('../../components/CodeEditor', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');
  return {
    CodeEditor: (props: Record<string, unknown>) => ReactMock.createElement(View, { testID: 'code-editor', ...props }),
  };
});

// The picker resolves a TurboModule at module evaluation, which does not exist under jest.
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(async () => []),
  isErrorWithCode: jest.fn(() => false),
  errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
  types: { allFiles: '*/*' },
}));

type Tree = ReactTestRenderer.ReactTestRenderer;

const send = connection.send as jest.MockedFunction<typeof connection.send>;
const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

function sent(): Array<Record<string, unknown>> {
  return send.mock.calls.map(([frame]) => JSON.parse(String(frame)) as Record<string, unknown>);
}

function texts(tree: Tree): string[] {
  return tree.root
    .findAllByType(Text)
    .flatMap(node => (typeof node.props.children === 'string' ? [node.props.children as string] : []));
}

function labels(tree: Tree): string[] {
  const all = tree.root
    .findAll(node => typeof node.props.accessibilityLabel === 'string', { deep: true })
    .map(node => node.props.accessibilityLabel as string);
  // The renderer exposes both the composite and the host node under it: one label, once.
  return Array.from(new Set(all));
}

function press(tree: Tree, label: string): void {
  const targets = tree.root.findAll(
    node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
    { deep: true },
  );
  if (targets.length === 0) throw new Error(`no pressable labelled ${label}`);
  ReactTestRenderer.act(() => {
    targets[0].props.onPress();
  });
}

function receive(frame: ServerFrame): void {
  ReactTestRenderer.act(() => {
    fsStore.receive(frame);
  });
}

function editorProps(tree: Tree): Record<string, unknown> {
  const found = tree.root.findAllByProps({ testID: 'code-editor' });
  if (found.length === 0) throw new Error('no editor on screen');
  return found[0].props as Record<string, unknown>;
}

/**
 * The hardware back key.
 *
 * The RN jest preset resolves platform files to `ios`, whose BackHandler registers nothing, so
 * `jest.setup.js` keeps a registry the tests drive directly: the app really runs the Android one,
 * which walks the handlers last-registered-first and stops at the first that answers true.
 */
function backHandler(): { __handlers: Array<() => boolean> } {
  // eslint-disable-next-line @react-native/no-deep-imports -- the ios stub is what the barrel resolves to under jest
  const back = require('react-native/Libraries/Utilities/BackHandler.ios') as {
    default: { __handlers: Array<() => boolean> };
  };
  return back.default;
}

/** True when the press was handled: false is what makes Android close the app. */
async function hardwareBack(): Promise<boolean> {
  const handlers = backHandler().__handlers;
  let handled = false;
  await ReactTestRenderer.act(async () => {
    handled = handlers[handlers.length - 1]!();
  });
  return handled;
}

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function entry(over: Partial<FsEntry> & { name: string; path: string }): FsEntry {
  return { kind: 'file', size: 10, mtimeMs: 1_700_000_000_000, mode: 0o644, textHint: true, ...over };
}

const HOME: FsListResultFrame = {
  type: 'fs.list.result',
  path: '/home/neras',
  parent: '/home',
  entries: [
    entry({ name: 'notes.md', path: '/home/neras/notes.md', size: 2_048 }),
    entry({ name: 'dev', kind: 'dir', path: '/home/neras/dev' }),
    entry({ name: 'logo.png', path: '/home/neras/logo.png', size: 51_200 }),
    entry({ name: '.git', kind: 'dir', path: '/home/neras/.git' }),
  ],
  truncated: false,
};

/** The same folder with one plain-text file in it: what stays in the editor in read mode. */
const HOME_WITH_SCRIPT: FsListResultFrame = {
  ...HOME,
  entries: [...HOME.entries, entry({ name: 'deploy.sh', path: '/home/neras/deploy.sh', size: 64 })],
};

function readResult(over: Partial<FsReadResultFrame> = {}): FsReadResultFrame {
  return {
    type: 'fs.read.result',
    path: '/home/neras/notes.md',
    etag: '111-8',
    size: 8,
    mtimeMs: 111,
    encoding: 'utf8',
    eol: 'lf',
    text: '# notes\n',
    lines: 1,
    from: 0,
    nextFrom: null,
    truncated: false,
    ...over,
  };
}

describe('SystemFilesScreen', () => {
  let mounted: Tree | null = null;

  /** The store is module-level and its listeners outlive a test: a tree left mounted is still
   *  subscribed, so the next reset() re-renders it outside any act() and prints as an error. */
  async function render(onClose: () => void = () => {}): Promise<Tree> {
    let tree!: Tree;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<SystemFilesScreen onClose={onClose} />);
    });
    // The page lands on the remembered directory through the prefs bridge: one promise hop.
    await ReactTestRenderer.act(async () => {
      await flush();
    });
    mounted = tree;
    return tree;
  }

  afterEach(async () => {
    if (mounted) {
      await ReactTestRenderer.act(async () => mounted?.unmount());
    }
    mounted = null;
    fsStore.reset();
    await ReactTestRenderer.act(async () => overlayStore.reset());
    jest.clearAllMocks();
  });

  beforeEach(() => {
    send.mockResolvedValue(true);
    // The page opens on the directory the prefs bridge remembered: the screen tests all work
    // from there, and the "first visit" landing is the store suite's business.
    bridge.prefsGetAll.mockResolvedValue({ fsLastDir: '/home/neras' });
  });

  test('the listing is the directory the server echoed, and nothing is hidden', async () => {
    const tree = await render();
    expect(sent()).toContainEqual({ type: 'fs.list', path: '/home/neras' });

    receive(HOME);
    expect(labels(tree)).toContain('Open /home/neras/.git');
    expect(labels(tree)).toContain('Open /home/neras/dev');
    expect(labels(tree)).toContain('Open /home/neras/notes.md');
    // The breadcrumb is built from the normalised path the answer carried, and every segment
    // is a way back up.
    expect(labels(tree)).toContain('Go to /home');
    expect(labels(tree)).toContain('Go to /home/neras');
    // Directories first, then names.
    expect(labels(tree).filter(label => label.startsWith('Open '))).toEqual([
      'Open /home/neras/.git',
      'Open /home/neras/dev',
      'Open /home/neras/logo.png',
      'Open /home/neras/notes.md',
    ]);
    expect(texts(tree).join('\n')).toContain('4 entries');
  });

  test('back walks up the tree one folder at a time, and leaves only from the machine root', async () => {
    const onClose = jest.fn();
    const tree = await render(onClose);
    receive(HOME);
    press(tree, 'Open /home/neras/dev');

    // A folder is a place you can be sent back up from, and the header says where to.
    expect(labels(tree)).toContain('Up to /home/neras');

    expect(await hardwareBack()).toBe(true);
    expect(sent()).toContainEqual({ type: 'fs.list', path: '/home/neras' });
    expect(onClose).not.toHaveBeenCalled();

    expect(await hardwareBack()).toBe(true);
    expect(sent()).toContainEqual({ type: 'fs.list', path: '/home' });
    expect(onClose).not.toHaveBeenCalled();

    expect(await hardwareBack()).toBe(true);
    expect(sent()).toContainEqual({ type: 'fs.list', path: '/' });
    expect(onClose).not.toHaveBeenCalled();

    // Nothing above the machine root: that press is the way out, and it is said as such.
    expect(labels(tree)).not.toContain('Up to /');
    expect(await hardwareBack()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('the cross leaves from anywhere, without walking the tree first', async () => {
    const onClose = jest.fn();
    const tree = await render(onClose);
    receive(HOME);
    press(tree, 'Open /home/neras/dev');

    press(tree, 'Close files');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('the cross asks before it throws away a dirty buffer', async () => {
    const onClose = jest.fn();
    const tree = await render(onClose);
    receive(HOME);
    press(tree, 'Open /home/neras/notes.md');
    receive(readResult());
    press(tree, 'Edit file');
    const editor = editorProps(tree);
    ReactTestRenderer.act(() => {
      (editor.onChange as (text: string) => void)('mine');
    });

    press(tree, 'Close files');
    expect(onClose).not.toHaveBeenCalled();
    expect(texts(tree)).toContain('Discard your changes?');

    press(tree, 'Discard changes');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('a file that is not markdown opens in the read-only editor, with its cursor line in the header', async () => {
    const tree = await render();
    receive(HOME_WITH_SCRIPT);

    press(tree, 'Open /home/neras/deploy.sh');
    expect(sent()).toContainEqual({ type: 'fs.read', path: '/home/neras/deploy.sh' });

    receive(readResult({ path: '/home/neras/deploy.sh', text: 'echo hi\n' }));
    const editor = editorProps(tree);
    expect(editor.value).toBe('echo hi\n');
    expect(editor.readOnly).toBe(true);
    expect(editor.language).toBe('shell');
    expect(texts(tree).join('\n')).toContain('ln 1');
  });

  test('markdown is read as a document: the editor is not on screen and no cursor line is claimed', async () => {
    const tree = await render();
    receive(HOME);
    press(tree, 'Open /home/neras/notes.md');
    receive(readResult({ text: '# notes\n\nsome prose\n' }));

    // Nothing to put a caret in: a rendered document has no cursor.
    expect(tree.root.findAllByProps({ testID: 'code-editor' })).toHaveLength(0);
    expect(texts(tree).join('\n')).not.toContain('ln 1');
    expect(texts(tree).join('\n')).toContain('# notes');
    // The door to the raw text is still there, and it is what `Edit` does.
    expect(labels(tree)).toContain('Edit file');
  });

  test('editing the same markdown hands it back raw, in the markdown the editor knows', async () => {
    const tree = await render();
    receive(HOME);
    press(tree, 'Open /home/neras/notes.md');
    receive(readResult({ text: '# notes\n\nsome prose\n' }));

    press(tree, 'Edit file');
    const editor = editorProps(tree);
    expect(editor.value).toBe('# notes\n\nsome prose\n');
    expect(editor.readOnly).toBe(false);
    expect(editor.language).toBe('markdown');
    expect(texts(tree).join('\n')).toContain('ln 1');
  });

  test('a binary shows its metadata and is never offered to the editor', async () => {
    const tree = await render();
    receive(HOME);
    press(tree, 'Open /home/neras/logo.png');
    receive(
      readResult({
        path: '/home/neras/logo.png',
        binary: { reason: 'nul' },
        text: undefined,
        size: 51_200,
      }),
    );

    const shown = texts(tree).join('\n');
    expect(shown).toContain('binary file (NUL byte) · nothing to edit');
    expect(shown).toContain('50.0 KB');
    expect(labels(tree)).not.toContain('Edit file');
    expect(tree.root.findAllByProps({ testID: 'code-editor' })).toHaveLength(0);
  });

  test('a truncated read says so with the real size, and stays read-only', async () => {
    const tree = await render();
    receive(HOME);
    press(tree, 'Open /home/neras/notes.md');
    receive(readResult({ truncated: true, nextFrom: 2_000_000, size: 5_000_000 }));

    expect(texts(tree).join('\n')).toContain('showing the first read window only · the file is 4.8 MB on disk');
    expect(labels(tree)).not.toContain('Edit file');
  });

  test('a conflicting save offers both ways out, and neither is silent', async () => {
    const tree = await render();
    receive(HOME);
    press(tree, 'Open /home/neras/notes.md');
    receive(readResult());
    press(tree, 'Edit file');

    const editor = editorProps(tree);
    expect(editor.readOnly).toBe(false);
    ReactTestRenderer.act(() => {
      (editor.onChange as (text: string) => void)('mine');
    });
    expect(texts(tree)).toContain('modified');

    press(tree, 'Save file');
    expect(sent()).toContainEqual({
      type: 'fs.write',
      path: '/home/neras/notes.md',
      text: 'mine',
      etag: '111-8',
      encoding: 'utf8',
      eol: 'lf',
    });

    const conflict: FsWriteResultFrame = {
      type: 'fs.write.result',
      path: '/home/neras/notes.md',
      etag: '999-99',
      size: 99,
      mtimeMs: 999,
      conflict: { etag: '999-99', size: 99, mtimeMs: 999 },
    };
    receive(conflict);

    expect(texts(tree).join('\n')).toContain('nothing was overwritten');
    expect(labels(tree)).toContain('Reload from disk');
    expect(labels(tree)).toContain('Overwrite anyway');
    // The buffer is still there, and still the owner's.
    expect(editorProps(tree).value).toBe('mine');

    press(tree, 'Overwrite anyway');
    expect(sent()).toContainEqual({
      type: 'fs.write',
      path: '/home/neras/notes.md',
      text: 'mine',
      etag: '111-8',
      force: true,
      encoding: 'utf8',
      eol: 'lf',
    });
  });

  test('a change under the editor raises a banner and leaves the document alone', async () => {
    const tree = await render();
    receive(HOME);
    press(tree, 'Open /home/neras/notes.md');
    receive(readResult());
    press(tree, 'Edit file');
    const editor = editorProps(tree);
    ReactTestRenderer.act(() => {
      (editor.onChange as (text: string) => void)('mine');
    });
    send.mockClear();

    receive({ type: 'fs.changed', path: '/home/neras/notes.md', kind: 'changed', size: 99, mtimeMs: 999 });

    expect(texts(tree)).toContain('the file changed on the server while you were editing');
    // Reloading here would delete what the owner is typing: the document is untouched and
    // nothing was asked of the server.
    expect(editorProps(tree).value).toBe('mine');
    expect(sent()).toEqual([]);
  });

  test('a dirty buffer does not leave the editor without a confirmation', async () => {
    const tree = await render();
    receive(HOME);
    press(tree, 'Open /home/neras/notes.md');
    receive(readResult());
    press(tree, 'Edit file');
    const editor = editorProps(tree);
    ReactTestRenderer.act(() => {
      (editor.onChange as (text: string) => void)('mine');
    });

    press(tree, 'Back to files');
    expect(texts(tree)).toContain('Discard your changes?');

    // Cancel: still editing, buffer intact.
    press(tree, 'Close menu');
    expect(labels(tree)).toContain('Save file');
    expect(editorProps(tree).value).toBe('mine');

    press(tree, 'Back to files');
    press(tree, 'Discard changes');
    // Back on the listing, and nothing was written on the way out.
    expect(labels(tree)).toContain('Close files');
    expect(sent().filter(frame => frame.type === 'fs.write')).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'code-editor' })).toHaveLength(0);
  });

  test('a clean buffer leaves without a question', async () => {
    const tree = await render();
    receive(HOME);
    press(tree, 'Open /home/neras/notes.md');
    receive(readResult());
    press(tree, 'Back to files');

    expect(labels(tree)).toContain('Close files');
    expect(labels(tree)).not.toContain('Save file');
  });

  test('the row sheet offers the whole vocabulary on a file', async () => {
    const tree = await render();
    receive(HOME);

    // A long press opens the sheet; the sheet's own rows are pressables too.
    const row = tree.root.findAll(
      node => node.props.accessibilityLabel === 'Open /home/neras/notes.md' && typeof node.props.onLongPress === 'function',
      { deep: true },
    )[0];
    ReactTestRenderer.act(() => {
      row.props.onLongPress();
    });

    const shown = labels(tree);
    for (const label of ['Open', 'Edit', 'Rename…', 'Move…', 'Copy path', 'Download…', 'Delete…']) {
      expect(shown).toContain(label);
    }
    // A file has no "send files here": that belongs to a directory.
    expect(shown).not.toContain('Send files here…');
  });

  /** Opens a row's sheet; the visible button and the long press are the same door. */
  function openSheet(tree: Tree, path: string): void {
    const row = tree.root.findAll(
      node => node.props.accessibilityLabel === `Open ${path}` && typeof node.props.onLongPress === 'function',
      { deep: true },
    )[0];
    ReactTestRenderer.act(() => {
      row.props.onLongPress();
    });
  }

  test('picking a row acts once, and the sheet is gone by the time it did', async () => {
    const tree = await render();
    receive(HOME);
    // The device identity lands in an effect: the row's arrow needs it.
    await ReactTestRenderer.act(async () => {});

    openSheet(tree, '/home/neras/notes.md');
    expect(labels(tree)).toContain('Copy path');

    press(tree, 'Copy path');

    // The sheet used to stay up over the notice it had just raised: a download was reported
    // behind its own menu (owner, 2026-09-26).
    expect(labels(tree)).not.toContain('Copy path');
    expect(labels(tree)).toContain('Dismiss notice');
  });

  test('a file row carries its own download arrow and a visible actions button', async () => {
    const tree = await render();
    receive(HOME);
    await ReactTestRenderer.act(async () => {});

    // One tap to save, and one visible button to reach everything else: the menu is no longer
    // hidden behind a long press nobody discovers.
    expect(labels(tree)).toContain('Download');
    expect(labels(tree)).toContain('Actions for notes.md');

    press(tree, 'Actions for notes.md');
    expect(labels(tree)).toContain('Rename…');
  });

  describe('a download', () => {
    /** The screen beside the host, as the shell mounts them: the host last, over everything. */
    async function renderWithHost(): Promise<Tree> {
      let tree!: Tree;
      await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
          <HostBox>
            <SystemFilesScreen onClose={() => {}} />
            <OverlayHost />
          </HostBox>,
        );
      });
      await ReactTestRenderer.act(async () => {
        await flush();
      });
      mounted = tree;
      receive(HOME);
      await ReactTestRenderer.act(async () => {});
      return tree;
    }

    type Node = ReactTestRenderer.ReactTestInstance;
    const ancestors = (node: Node): unknown[] => {
      const types: unknown[] = [];
      for (let at: Node | null = node.parent; at; at = at.parent) types.push(at.type);
      return types;
    };
    const row = (tree: Tree, label: string): Node =>
      tree.root.find(n => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function');

    // The bug of 2026-09-28: the sheet was rendered beside the arrow, and filled the row it sat in.
    test("the arrow's destinations are drawn by the host over the page, not inside the row", async () => {
      const tree = await renderWithHost();
      const arrow = tree.root.find(n => n.type === DownloadControl && n.props.targets[0]?.filename === 'notes.md');
      ReactTestRenderer.act(() => {
        arrow.find(n => n.props?.accessibilityLabel === 'Download' && typeof n.props?.onPress === 'function').props.onPress();
      });
      const destination = row(tree, 'Save to Downloads');
      expect(ancestors(destination)).toContain(OverlayHost);
      expect(ancestors(destination)).not.toContain(DownloadControl);
      expect(ancestors(destination)).not.toContain(SystemFilesScreen);

      ReactTestRenderer.act(() => destination.props.onPress());
      await ReactTestRenderer.act(async () => {
        await flush();
      });
      expect(bridge.downloadFile).toHaveBeenCalledWith(
        expect.stringContaining('/fs/download?path=%2Fhome%2Fneras%2Fnotes.md'),
        'notes.md',
        false,
        expect.any(String),
      );
      expect(labels(tree)).not.toContain('Save to Downloads');
      expect(labels(tree)).toContain('Notice Saved to Downloads');
    });

    test('"Download…" in the actions sheet takes the same road as the arrow', async () => {
      const tree = await renderWithHost();
      openSheet(tree, '/home/neras/notes.md');
      press(tree, 'Download…');
      expect(labels(tree)).not.toContain('Rename…');
      expect(labels(tree)).toEqual(expect.arrayContaining(['Save to Downloads', 'Save as…']));
      expect(ancestors(row(tree, 'Save as…'))).toContain(OverlayHost);
    });
  });

  test('the row sheet on a directory offers creating and sending inside it', async () => {
    const tree = await render();
    receive(HOME);

    const row = tree.root.findAll(
      node => node.props.accessibilityLabel === 'Open /home/neras/dev' && typeof node.props.onLongPress === 'function',
      { deep: true },
    )[0];
    ReactTestRenderer.act(() => {
      row.props.onLongPress();
    });

    const shown = labels(tree);
    expect(shown).toContain('New file…');
    expect(shown).toContain('New folder…');
    expect(shown).toContain('Send files here…');
    expect(shown).toContain('Delete folder…');
    expect(shown).not.toContain('Edit');
  });

  test('a directory the server could not read says so instead of drawing an empty one', async () => {
    const tree = await render();
    receive({
      type: 'fs.list.result',
      path: '/home/neras',
      parent: '/home',
      entries: [],
      truncated: false,
      error: 'EACCES: permission denied',
    });

    expect(texts(tree).join('\n')).toContain('EACCES: permission denied');
    expect(labels(tree)).toContain('Ask again');
  });
});
