/**
 * The right-hand column: one page at a time, and it stays where the owner left it.
 *
 * Three complaints of 2026-10-26, all from the same shape -- a boolean per page drawn in one chain
 * of ternaries while the full-window pages mounted over the rest:
 *
 *   1. "les paramètres s'ouvrent en dessous", with Jobs up: Settings was painted *under* it.
 *   2. "il y a des trucs qui se superposent dans le menu de droite": the browser stayed drawn
 *      under the settings page.
 *   3. "quand on switch de session ça garde ce qu'il y a à droite", and a reload kept nothing.
 *
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter, useWindowDimensions } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { panes, readPanes } from '../src/core/panes';
import { readRightPane, rightPane } from '../src/core/rightPane';
import { labelsOf, press, renderApp, unmount, waitFor } from '../test-utils/render';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions');

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 't-right-pane';
const OTHER = 't-right-pane-2';

function windowIs(width: number): void {
  (useWindowDimensions as unknown as jest.Mock).mockReturnValue({ width, height: 900, scale: 2, fontScale: 1 });
}

function sessions(): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({
        type: 'session.list.result',
        sessions: [THREAD, OTHER].map(threadId => ({
          threadId,
          title: threadId,
          messageCount: 1,
          createdAt: '2026-10-26T10:00:00.000Z',
          lastActiveAt: '2026-10-26T10:00:00.000Z',
        })),
      }),
    });
  });
}

beforeEach(() => {
  windowIs(1600);
  chatStore.clearAll();
  bridge.sendMessage.mockResolvedValue(true);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

describe('one page at a time', () => {
  test('opening settings while jobs is up replaces jobs, and the other way round', async () => {
    const tree = await renderApp();
    try {
      await press(tree, 'More');
      await press(tree, 'Jobs');
      await waitFor(() => labelsOf(tree).includes('Close jobs'));

      await press(tree, 'Open settings');
      await waitFor(() => labelsOf(tree).includes('Search settings'));
      // The jobs page is gone, not painted under: it used to stay mounted and clickable behind.
      expect(labelsOf(tree)).not.toContain('Close jobs');
      expect(rightPane.get().window).toBeNull();
      expect(rightPane.get().page).toBe('settings');

      await press(tree, 'More');
      await press(tree, 'Jobs');
      await waitFor(() => labelsOf(tree).includes('Close jobs'));
      expect(labelsOf(tree)).not.toContain('Search settings');
      expect(rightPane.get().page).toBe('none');
    } finally {
      await unmount(tree);
    }
  });

  test('the browser replaces the settings page instead of painting under it', async () => {
    const tree = await renderApp();
    try {
      await press(tree, 'Open settings');
      await waitFor(() => labelsOf(tree).includes('Search settings'));

      await press(tree, 'More');
      await press(tree, 'Browser');
      await waitFor(() => labelsOf(tree).includes('Close browser'));
      expect(labelsOf(tree)).not.toContain('Search settings');
      expect(rightPane.get().page).toBe('browser');
    } finally {
      await unmount(tree);
    }
  });
});

describe('the column survives a conversation switch', () => {
  test('the settings page stays, at the level it was left on', async () => {
    const tree = await renderApp();
    try {
      await sessions();
      await press(tree, 'Open settings');
      await press(tree, 'Open models');
      await waitFor(() => labelsOf(tree).includes('Add your first provider'));

      await press(tree, `Conversation ${OTHER}`);
      await waitFor(() => labelsOf(tree).includes('Message to send'));
      // Still settings, still on Models: a page about the install has no thread in it.
      expect(labelsOf(tree)).toContain('Add your first provider');
      expect(rightPane.get().page).toBe('settings');
      expect(rightPane.get().settingsPage).toBe('models');
    } finally {
      await unmount(tree);
    }
  });

  test('a page about the conversation is re-read for the thread now on screen', async () => {
    const tree = await renderApp();
    try {
      await sessions();
      await press(tree, 'Commands');
      await press(tree, 'Session files');
      await waitFor(() => labelsOf(tree).includes('Open file notebook.md') === false);
      expect(rightPane.get().page).toBe('files');

      const before = bridge.sendMessage.mock.calls.filter(([frame]) => String(frame).includes('"files.list"')).length;
      await press(tree, `Conversation ${OTHER}`);
      await waitFor(() => labelsOf(tree).includes('Message to send'));
      const after = bridge.sendMessage.mock.calls.filter(([frame]) => String(frame).includes('"files.list"')).length;
      // The same page, asked for the new thread rather than left holding the old one's files.
      expect(rightPane.get().page).toBe('files');
      expect(after).toBe(before + 1);
    } finally {
      await unmount(tree);
    }
  });

  test('a phone keeps nothing: the page would cover the conversation that was just tapped', async () => {
    windowIs(412);
    const tree = await renderApp();
    try {
      await sessions();
      await press(tree, 'Open settings');
      await waitFor(() => labelsOf(tree).includes('Search settings'));
      // The cross of the index IS the way back on a phone: the page has the whole window.
      await press(tree, 'Back to chat');
      await waitFor(() => labelsOf(tree).includes('Message to send'));

      await press(tree, 'Open conversations');
      await press(tree, `Conversation ${OTHER}`);
      await waitFor(() => labelsOf(tree).includes('Message to send'));
      expect(rightPane.get().page).toBe('none');
    } finally {
      await unmount(tree);
    }
  });
});

describe('the column survives a reload', () => {
  test('the settings page and its level are written down', () => {
    bridge.prefsSet.mockClear();
    rightPane.reset();
    rightPane.show('settings');
    rightPane.setSettingsPage('models');
    expect(bridge.prefsSet).toHaveBeenLastCalledWith('rightPane', '{"page":"settings","settingsPage":"models"}');
    expect(readRightPane('{"page":"settings","settingsPage":"models"}')).toEqual({
      page: 'settings',
      settingsPage: 'models',
      viewer: null,
    });
  });

  test('an unknown or broken value opens nothing rather than a page nobody can leave', () => {
    expect(readRightPane(undefined)).toEqual({ page: 'none', settingsPage: 'index', viewer: null });
    expect(readRightPane('not json')).toEqual({ page: 'none', settingsPage: 'index', viewer: null });
    expect(readRightPane('{"page":"nonsense"}').page).toBe('none');
  });

  test('the dragged columns are written down and read back inside their bounds', () => {
    expect(readPanes(undefined)).toEqual({ drawerWidth: 288, drawerCollapsed: false, pagePaneWidth: 460 });
    expect(readPanes('{"drawerWidth":9999,"drawerCollapsed":true,"pagePaneWidth":10}')).toEqual({
      drawerWidth: 520,
      drawerCollapsed: true,
      pagePaneWidth: 340,
    });
    expect(readPanes('{"drawerWidth":"wide"}').drawerWidth).toBe(288);
  });

  test('a drag writes once, not once per pixel', async () => {
    panes.reset();
    bridge.prefsSet.mockClear();
    panes.resizeDrawer(300);
    panes.resizeDrawer(320);
    panes.resizeDrawer(340);
    // Nothing yet: a write per pointer move would be a storm for a number nobody is reading.
    expect(bridge.prefsSet).not.toHaveBeenCalledWith('panes', expect.anything());
    await ReactTestRenderer.act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 500));
    });
    expect(bridge.prefsSet).toHaveBeenCalledTimes(1);
    expect(String(bridge.prefsSet.mock.calls[0]?.[1])).toContain('"drawerWidth":340');
  });
});

/**
 * Every viewer the column can hold, round-tripped through what a reload reads back.
 *
 * The rework of 2026-10-27 made the viewer part of what survives a refresh, so the payload now
 * travels through the device bag. A kind the reader does not recognise would come back as "no
 * viewer" -- a file open before the reload simply gone -- and the text one carries a second field,
 * `file`, that an older shape called `kind`.
 */
describe('every viewer survives the round trip', () => {
  const VIEWERS = [
    { kind: 'image', images: [{ url: 'http://h/m/1', filename: 'photo.png' }], index: 0 },
    { kind: 'text', url: 'http://h/m/2', filename: 'notes.md', file: 'markdown' },
    { kind: 'text', url: 'http://h/m/3', filename: 'main.ts', file: 'code' },
    { kind: 'video', url: 'http://h/m/4', filename: 'clip.mp4' },
    { kind: 'svg', url: 'http://h/m/5', filename: 'logo.svg' },
    { kind: 'pdf', url: 'http://h/m/6', filename: 'doc.pdf' },
    { kind: 'html', url: 'http://h/m/7', filename: 'page.html' },
    { kind: 'office', url: 'http://h/m/8', filename: 'letter.docx' },
    { kind: 'archive', url: 'http://h/m/9', filename: 'bundle.zip' },
    { kind: 'file', url: 'http://h/m/10', filename: 'blob.bin', sizeBytes: 12 },
    { kind: 'skill', url: 'http://h/s/1', skill: { name: 'x' } },
  ] as const;

  test.each(VIEWERS.map(viewer => [viewer.kind, viewer] as const))('%s', (kind, viewer) => {
    rightPane.reset();
    rightPane.openViewer(viewer as never);

    const written = readRightPane(String(bridge.prefsSet.mock.calls.at(-1)?.[1]));
    expect(written.viewer).toEqual(viewer);
    expect(written.page).toBe('none');
    expect(kind).toBe(viewer.kind);
  });

  test('a stored text viewer keeps the file kind it was opened with', () => {
    // What the reader is told the file is: the discriminant says the viewer, `file` says the page.
    rightPane.reset();
    rightPane.openViewer({ kind: 'text', url: 'http://h/m/2', filename: 'notes.md', file: 'code' });
    const restored = readRightPane('{"page":"none","viewer":{"kind":"text","url":"http://h/m/2","filename":"notes.md","file":"code"}}');
    expect(restored.viewer).toMatchObject({ file: 'code' });
  });
});
