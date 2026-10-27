/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import type { SessionFileMeta } from '../src/core/protocol';
import {
  renderApp,
  TEST_MEDIA_TICKET,
  labelsOf,
  textsOf,
  press,
  unmount,
  waitFor,
  type Tree,
} from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const MEDIA_URL = 'http://server:8080/media';

function file(over: Partial<SessionFileMeta>): SessionFileMeta {
  return {
    id: 'f1',
    filename: 'notes.md',
    type: 'file',
    mimeType: 'text/markdown',
    sizeBytes: 42,
    ts: '2026-08-06T10:00:00.000Z',
    ...over,
  };
}

function listFiles(files: SessionFileMeta[]): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({ type: 'files.list.result', files, totalBytes: 0 }),
    });
  });
}

async function openFiles(tree: Tree, files: SessionFileMeta[]): Promise<void> {
  await listFiles(files);
  // Session files moved from its own header button into the Commands menu, first row.
  await press(tree, 'Commands');
  await press(tree, 'Session files');
  await waitFor(() =>
    labelsOf(tree).includes(`Open file ${files[0].filename}`),
  );
}

function pressText(tree: Tree, text: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    // The sheet options are Text nodes inside a Pressable; find the label and press its owner.
    const label = tree.root.find(
      node => node.props.children === text && String(node.type) === 'Text',
    );
    let node = label.parent;
    while (node && typeof node.props.onPress !== 'function') {
      node = node.parent;
    }
    if (!node) throw new Error(`no pressable for ${text}`);
    node.props.onPress();
  });
}

/**
 * Presses the last node carrying a label. The download arrow exists on every row and again inside
 * every viewer, so "the one on top" is the one that is mounted last.
 */
async function pressLast(tree: Tree, label: string): Promise<void> {
  await waitFor(() => labelsOf(tree).includes(label));
  const targets = tree.root.findAll(
    (node: { props: { accessibilityLabel?: string; onPress?: unknown } }) =>
      node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
  const target = targets[targets.length - 1];
  if (!target) throw new Error(`no pressable for ${label}`);
  await ReactTestRenderer.act(async () => {
    target.props.onPress();
  });
}

function sentFrames(): string[] {
  return bridge.sendMessage.mock.calls.map(([frame]) => String(frame));
}

/** The URLs globalThis.fetch was called with. */
function fetchCalls(): string[] {
  const mock = globalThis.fetch as jest.Mock;
  return (mock.mock?.calls ?? []).map(args => String(args[0]));
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  bridge.downloadFile.mockClear();
  bridge.saveFile.mockClear();
  // A thread must exist for the files button to be enabled, like in the running app.
  bridge.prefsGetAll.mockResolvedValue({
    themeMode: 'dark',
    lastThreadId: 't-files',
  });
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: () => Promise.resolve('# Hello\n\nrendered markdown'),
    } as unknown as Response),
  );
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test('the hardware back button returns from the file explorer to the chat', async () => {
  const tree = await renderApp();
  await openFiles(tree, [file({})]);

  // The Android layer calls the last registered handler and stops when it returns true.
  // eslint-disable-next-line @react-native/no-deep-imports -- the ios stub is what the barrel resolves to under jest
  const back = require('react-native/Libraries/Utilities/BackHandler.ios') as {
    default: { __handlers: Array<() => boolean>; exitApp: jest.Mock };
  };
  const handlers = back.default.__handlers;

  let handled = false;
  await ReactTestRenderer.act(async () => {
    handled = handlers[handlers.length - 1]();
  });

  expect(handled).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Message to send'));
  expect(labelsOf(tree)).not.toContain('Back to chat');
  expect(back.default.exitApp).not.toHaveBeenCalled();
  await unmount(tree);
});

test('tapping a markdown file shows its rendered content and offers a download', async () => {
  const tree = await renderApp();
  await openFiles(tree, [file({})]);

  await press(tree, 'Open file notes.md');
  await waitFor(() => labelsOf(tree).includes('Download'));
  await waitFor(() => textsOf(tree).some(t => t.includes('# Hello')));

  // One arrow, then the sheet: the three destinations are named where they are chosen.
  await press(tree, 'Download');
  await press(tree, 'Save as…');
  await waitFor(() => bridge.saveFile.mock.calls.length > 0);
  expect(bridge.saveFile).toHaveBeenCalledWith(
    `${MEDIA_URL}/f1?ticket=${TEST_MEDIA_TICKET}`,
    'notes.md',
    expect.any(String),
  );

  await unmount(tree);
});

test('tapping an image opens the viewer and saves to the gallery', async () => {
  const tree = await renderApp();
  await openFiles(tree, [
    file({
      id: 'img1',
      filename: 'photo.png',
      type: 'image',
      mimeType: 'image/png',
    }),
  ]);

  await press(tree, 'Open file photo.png');
  await waitFor(() => labelsOf(tree).includes('Download'));
  // The row behind carries the same arrow; the viewer's is the one on top.
  expect(labelsOf(tree).filter(label => label === 'Download').length).toBeGreaterThan(1);
  // The viewer reads nothing over the network: the image was already fetched by the media URL's
  // own progress flow. (The app self-update check may have fired its one /app-update fetch, so
  // the assertion is on media fetches only.)
  expect(fetchCalls().filter(u => u.includes('/media/'))).toEqual([]);

  // No download card underneath: that second layer stole the taps and its own cross was
  // unreachable behind the image.
  expect(labelsOf(tree)).not.toContain('Close file view');
  expect(labelsOf(tree)).not.toContain('no preview for this file type');

  // And no Modal around the zoomable image: on Android a Modal is a separate window, outside
  // the gesture root view, where pinch and tap are never recognised.
  const modals = tree.root.findAll(
    n =>
      typeof n.props.onRequestClose === 'function' && n.props.visible === true,
    { deep: true },
  );
  expect(modals).toHaveLength(0);

  await pressLast(tree, 'Download');
  await press(tree, 'Save to the gallery');
  await waitFor(() => bridge.downloadFile.mock.calls.length > 0);
  expect(bridge.downloadFile).toHaveBeenCalledWith(
    `${MEDIA_URL}/img1?ticket=${TEST_MEDIA_TICKET}`,
    'photo.png',
    true,
    expect.any(String),
  );

  await unmount(tree);
});

test('tapping the image pops the controls, the cross closes the viewer', async () => {
  const tree = await renderApp();
  await openFiles(tree, [
    file({
      id: 'img2',
      filename: 'shot.png',
      type: 'image',
      mimeType: 'image/png',
    }),
  ]);

  await press(tree, 'Open file shot.png');
  await waitFor(() => labelsOf(tree).includes('Close image'));
  // The arrow exists on the row behind and inside the viewer; both are pressable, and the count
  // is what proves the viewer's goes with the bars.
  const downloadArrows = (): number =>
    tree.root.findAll(
      (node: { props: { accessibilityLabel?: string; onPress?: unknown } }) =>
        node.props.accessibilityLabel === 'Download' && typeof node.props.onPress === 'function',
    ).length;
  const withBars = downloadArrows();
  expect(withBars).toBeGreaterThan(1);

  // Tap on the photo: the bars disappear so nothing covers the image. The row's own arrow stays:
  // what goes is the viewer's, which is the point of the bars.
  await press(tree, 'Zoomable image');
  await waitFor(() => !labelsOf(tree).includes('Close image'));
  expect(downloadArrows()).toBe(withBars - 1);

  // Tap again: they pop back.
  await press(tree, 'Zoomable image');
  await waitFor(() => labelsOf(tree).includes('Close image'));

  // The cross quits the viewer and lands back on the file list.
  await press(tree, 'Close image');
  await waitFor(() => labelsOf(tree).includes('Open file shot.png'));
  expect(labelsOf(tree)).not.toContain('Close image');

  await unmount(tree);
});

test('the hardware back closes the image viewer, not the whole explorer', async () => {
  const tree = await renderApp();
  await openFiles(tree, [
    file({
      id: 'img3',
      filename: 'wide.png',
      type: 'image',
      mimeType: 'image/png',
    }),
  ]);

  await press(tree, 'Open file wide.png');
  await waitFor(() => labelsOf(tree).includes('Close image'));

  // eslint-disable-next-line @react-native/no-deep-imports -- the ios stub is what the barrel resolves to under jest
  const back = require('react-native/Libraries/Utilities/BackHandler.ios') as {
    default: { __handlers: Array<() => boolean> };
  };
  const handlers = back.default.__handlers;
  let handled = false;
  await ReactTestRenderer.act(async () => {
    handled = handlers[handlers.length - 1]();
  });

  // The image layer takes the press; the file list is still underneath.
  expect(handled).toBe(true);
  await waitFor(() => !labelsOf(tree).includes('Close image'));
  expect(labelsOf(tree)).toContain('Open file wide.png');

  await unmount(tree);
});

test('a markdown file opens full screen, not in a modal card', async () => {
  const tree = await renderApp();
  await openFiles(tree, [file({})]);

  await press(tree, 'Open file notes.md');
  await waitFor(() => textsOf(tree).some(t => t.includes('# Hello')));

  // Full screen: the preview card with its "no preview" fallback is not mounted, and there
  // is no Modal around the content at all.
  expect(labelsOf(tree)).toContain('Close file view');
  expect(textsOf(tree)).not.toContain('no preview for this file type');
  const modals = tree.root.findAll(
    n => typeof n.props.onRequestClose === 'function' && n.props.visible === true,
    { deep: true },
  );
  expect(modals).toHaveLength(0);

  await unmount(tree);
});

test('the hardware back quits the full-screen text viewer', async () => {
  const tree = await renderApp();
  await openFiles(tree, [file({})]);

  await press(tree, 'Open file notes.md');
  await waitFor(() => labelsOf(tree).includes('Close file view'));

  // eslint-disable-next-line @react-native/no-deep-imports -- the ios stub is what the barrel resolves to under jest
  const back = require('react-native/Libraries/Utilities/BackHandler.ios') as {
    default: { __handlers: Array<() => boolean> };
  };
  const handlers = back.default.__handlers;
  let handled = false;
  await ReactTestRenderer.act(async () => {
    handled = handlers[handlers.length - 1]();
  });

  expect(handled).toBe(true);
  await waitFor(() => !labelsOf(tree).includes('Close file view'));
  expect(labelsOf(tree)).toContain('Open file notes.md');

  await unmount(tree);
});

test('deleting asks for a confirmation, and the cancel sends nothing', async () => {
  const tree = await renderApp();
  await openFiles(tree, [
    file({ id: 'del1', filename: 'old.pdf', type: 'file' }),
  ]);

  bridge.sendMessage.mockClear();
  await press(tree, 'Delete file old.pdf');

  // The tap on delete must not double as a tap on the row: nothing opened.
  expect(labelsOf(tree)).not.toContain('Close file view');
  expect(labelsOf(tree)).not.toContain('Close image');
  expect(textsOf(tree)).toContain(
    'Delete old.pdf? The agent loses access to it too.',
  );
  expect(sentFrames().some(f => f.includes('files.delete'))).toBe(false);

  await pressText(tree, 'Cancel');
  expect(sentFrames().some(f => f.includes('files.delete'))).toBe(false);
  expect(textsOf(tree)).toContain('old.pdf');

  await unmount(tree);
});

test('confirming the delete sends the frame for that file', async () => {
  const tree = await renderApp();
  await openFiles(tree, [
    file({ id: 'del1', filename: 'old.pdf', type: 'file' }),
    file({ id: 'del2', filename: 'keep.pdf', type: 'file' }),
  ]);

  bridge.sendMessage.mockClear();
  await press(tree, 'Delete file old.pdf');
  await pressText(tree, 'Delete');

  const frame = JSON.parse(sentFrames().at(-1)!) as {
    type: string;
    threadId: string;
    id: string;
  };
  expect(frame.type).toBe('files.delete');
  expect(frame.threadId).toBe('t-files');
  expect(frame.id).toBe('del1');

  await unmount(tree);
});

test('a refused delete surfaces on the files screen', async () => {
  const tree = await renderApp();
  await openFiles(tree, [file({ id: 'del2', filename: 'garde.pdf', type: 'file' })]);

  await press(tree, 'Delete file garde.pdf');
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({
        type: 'error',
        message: 'file not found',
        scope: 'files',
      }),
    });
  });

  // Routed only to a chat bubble, this was invisible under the files screen.
  await waitFor(() => labelsOf(tree).includes('Files error file not found'));
  expect(textsOf(tree)).toContain('garde.pdf');

  await unmount(tree);
});

test('an error from another screen does not land on the files banner', async () => {
  const tree = await renderApp();
  await openFiles(tree, [file({ id: 'f9', filename: 'garde.pdf', type: 'file' })]);

  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({
        type: 'error',
        message: 'history failed',
        scope: 'session',
      }),
    });
  });

  expect(labelsOf(tree)).not.toContain('Files error history failed');

  await unmount(tree);
});

test('a file without a preview still offers a download', async () => {
  const tree = await renderApp();
  await openFiles(tree, [
    file({
      id: 'a1',
      filename: 'clip.mp3',
      type: 'audio',
      mimeType: 'audio/mpeg',
    }),
  ]);

  await press(tree, 'Open file clip.mp3');
  await waitFor(() => labelsOf(tree).includes('Download'));
  await waitFor(() => textsOf(tree).includes('no preview for this file type'));
  // The viewer reads nothing over the network (apart from the app self-update check at boot).
  expect(fetchCalls().filter(u => u.includes('/media/'))).toEqual([]);

  // The card's own download control opens the same sheet, and save-as is one of its rows.
  await press(tree, 'Download');
  await press(tree, 'Save as…');
  await waitFor(() => bridge.saveFile.mock.calls.length > 0);
  expect(bridge.saveFile).toHaveBeenCalledWith(
    `${MEDIA_URL}/a1?ticket=${TEST_MEDIA_TICKET}`,
    'clip.mp3',
    expect.any(String),
  );

  await unmount(tree);
});

/**
 * What the reader is told a file is.
 *
 * The viewer state of the right pane carries the server's `kind` in `file`; `kind` is the union's
 * own discriminant and is always `'text'`. The shell read the discriminant, so every file reached
 * the reader as plain text and a markdown page lost its prose typography -- exactly what the zoom
 * control betrays, since only the markdown rendering offers one.
 */
test('a file the server classified as markdown opens in the prose reader', async () => {
  const tree = await renderApp();
  // The name says nothing: only the server's verdict can make this a markdown page.
  await openFiles(tree, [file({ id: 'f-md', filename: '1-speech', kind: 'markdown' })]);

  await press(tree, 'Open file 1-speech');
  await waitFor(() => labelsOf(tree).includes('Download'));
  await waitFor(() => labelsOf(tree).includes('Larger text'));

  await unmount(tree);
});

test('a code file opens in the code reader, with no zoom on offer', async () => {
  const tree = await renderApp();
  await openFiles(tree, [file({ id: 'f-ts', filename: 'main.ts', kind: 'code' })]);

  await press(tree, 'Open file main.ts');
  await waitFor(() => labelsOf(tree).includes('Download'));
  expect(labelsOf(tree)).not.toContain('Larger text');

  await unmount(tree);
});

test('a zoom step is remembered, and both ends of the range stop', async () => {
  const tree = await renderApp();
  await openFiles(tree, [file({ id: 'f-md', filename: 'notes.md', kind: 'markdown' })]);
  await press(tree, 'Open file notes.md');
  await waitFor(() => labelsOf(tree).includes('Larger text'));

  await press(tree, 'Larger text');
  await waitFor(() => textsOf(tree).some(t => t.includes('115%')));
  // The same step on the next file: a zoom is a preference about the reader, not the page.
  await press(tree, 'Close file view');
  await press(tree, 'Open file notes.md');
  await waitFor(() => textsOf(tree).some(t => t.includes('115%')));

  for (let i = 0; i < 8; i += 1) await press(tree, 'Larger text');
  await waitFor(() => textsOf(tree).some(t => t.includes('200%')));
  for (let i = 0; i < 12; i += 1) await press(tree, 'Smaller text');
  await waitFor(() => textsOf(tree).some(t => t.includes('85%')));

  await unmount(tree);
});
