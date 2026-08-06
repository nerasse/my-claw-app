/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import type { SessionFileMeta } from '../src/core/protocol';
import {
  renderApp,
  labelsOf,
  textsOf,
  press,
  unmount,
  waitFor,
  type Tree,
} from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const MEDIA_URL = 'http://10.10.20.10:8080/media';

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
  await press(tree, 'Session files');
  await waitFor(() =>
    labelsOf(tree).includes(`Open file ${files[0].filename}`),
  );
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  bridge.downloadFile.mockClear();
  // A thread must exist for the files button to be enabled, like in the running app.
  bridge.prefsGetAll.mockResolvedValue({
    themeMode: 'dark',
    lastThreadId: 't-files',
  });
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve('# Hello\n\nrendered markdown'),
    } as Response),
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
  const back = (
    require('react-native/Libraries/Utilities/BackHandler.ios') as {
      default: { __handlers: Array<() => boolean>; exitApp: jest.Mock };
    }
  ).default;
  let handled = false;
  await ReactTestRenderer.act(async () => {
    handled = back.__handlers[back.__handlers.length - 1]();
  });

  expect(handled).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Message to send'));
  expect(labelsOf(tree)).not.toContain('Back to chat');
  expect(back.exitApp).not.toHaveBeenCalled();
  await unmount(tree);
});

test('tapping a markdown file shows its rendered content and offers a download', async () => {
  const tree = await renderApp();
  await openFiles(tree, [file({})]);

  await press(tree, 'Open file notes.md');
  await waitFor(() => labelsOf(tree).includes('Save file to downloads'));
  await waitFor(() => textsOf(tree).some(t => t.includes('# Hello')));

  await press(tree, 'Save file to downloads');
  await waitFor(() => bridge.downloadFile.mock.calls.length > 0);
  expect(bridge.downloadFile).toHaveBeenCalledWith(
    `${MEDIA_URL}/f1?device=dev-test&token=token-test`,
    'notes.md',
    false,
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
  await waitFor(() => labelsOf(tree).includes('Save image to gallery'));
  expect(globalThis.fetch).not.toHaveBeenCalled();

  await press(tree, 'Save image to gallery');
  await waitFor(() => bridge.downloadFile.mock.calls.length > 0);
  expect(bridge.downloadFile).toHaveBeenCalledWith(
    `${MEDIA_URL}/img1?device=dev-test&token=token-test`,
    'photo.png',
    true,
  );

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
  await waitFor(() => labelsOf(tree).includes('Save file to downloads'));
  await waitFor(() => textsOf(tree).includes('no preview for this file type'));
  expect(globalThis.fetch).not.toHaveBeenCalled();

  await unmount(tree);
});
