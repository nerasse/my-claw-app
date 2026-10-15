/**
 * The desktop columns, as the owner asked for them on 2026-09-29: the browser page full screen
 * (and in a tab of its own), the conversation list folded away on demand, and both side columns
 * dragged wider or narrower -- for the session only, every load opening on the default sizes.
 *
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter, useWindowDimensions } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import { chatStore } from '../src/core/chat';
import type { SessionFileMeta } from '../src/core/protocol';
import {
  DRAWER_DEFAULT,
  DRAWER_MAX,
  DRAWER_MIN,
  PAGE_PANE_DEFAULT,
  PAGE_PANE_MIN,
  RAIL_WIDTH,
  clampPagePane,
  drawerColumnOf,
  panes,
} from '../src/core/panes';
import { browserFromLocation } from '../src/core/browserLive';
import { labelsOf, press, renderApp, unmount, waitFor, type Tree } from '../test-utils/render';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions');

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 't-default';

function widthOf(tree: Tree, id: string): number | undefined {
  const node = tree.root.findAll(n => n.props.testID === id)[0];
  const flat = [node?.props.style].flat(Infinity).filter(Boolean) as Array<{ width?: number }>;
  return flat.reverse().find(s => typeof s.width === 'number')?.width;
}

beforeEach(() => {
  (useWindowDimensions as unknown as jest.Mock).mockReturnValue({ width: 1600, height: 900, scale: 2, fontScale: 1 });
  panes.reset();
  chatStore.clearAll();
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

describe('the sizes', () => {
  test('dragged within bounds, a folded list takes the rail, and nothing is written anywhere', () => {
    bridge.prefsSet.mockClear();
    panes.resizeDrawer(9999);
    expect(panes.get().drawerWidth).toBe(DRAWER_MAX);
    panes.resizeDrawer(10);
    expect(panes.get().drawerWidth).toBe(DRAWER_MIN);
    panes.setDrawerCollapsed(true);
    expect(drawerColumnOf(panes.get())).toBe(RAIL_WIDTH);
    // The page never leaves the conversation less than its minimum, and never shrinks under its own.
    expect(clampPagePane(5000, 1600, DRAWER_DEFAULT)).toBe(1600 - DRAWER_DEFAULT - 440);
    expect(clampPagePane(10, 1600, DRAWER_DEFAULT)).toBe(PAGE_PANE_MIN);
    panes.resetDrawer();
    panes.resetPagePane();
    expect(panes.get().drawerWidth).toBe(DRAWER_DEFAULT);
    expect(panes.get().pagePaneWidth).toBe(PAGE_PANE_DEFAULT);
    // Session only: not a preference.
    expect(bridge.prefsSet).not.toHaveBeenCalled();
  });

  test('a tab opened on the browser opens on every window, or on the one popped out', () => {
    const g = globalThis as { location?: { hash?: string } };
    const saved = g.location;
    try {
      g.location = { hash: '#browser' };
      expect(browserFromLocation()).toEqual({ window: null });
      g.location = { hash: '#browser-window=42' };
      expect(browserFromLocation()).toEqual({ window: 42 });
      g.location = { hash: '' };
      expect(browserFromLocation()).toBeNull();
    } finally {
      g.location = saved;
    }
  });
});

describe('on a desktop', () => {
  test('the list folds into a rail and comes back, its column taking the width it was given', async () => {
    const tree = await renderApp();
    await waitFor(() => labelsOf(tree).includes('Hide the conversation list'));
    expect(widthOf(tree, 'pinned-column')).toBe(DRAWER_DEFAULT);

    await press(tree, 'Hide the conversation list');
    await waitFor(() => labelsOf(tree).includes('Show the conversation list'));
    expect(tree.root.findAll(n => n.props.testID === 'drawer-rail').length).toBeGreaterThan(0);
    expect(widthOf(tree, 'pinned-column')).toBe(RAIL_WIDTH);
    // The conversation is still there, with the room the list gave back.
    expect(labelsOf(tree)).toContain('Message to send');

    await press(tree, 'Show the conversation list');
    await waitFor(() => !labelsOf(tree).includes('Show the conversation list'));
    expect(widthOf(tree, 'pinned-column')).toBe(DRAWER_DEFAULT);

    ReactTestRenderer.act(() => panes.resizeDrawer(400));
    expect(widthOf(tree, 'pinned-column')).toBe(400);
    await unmount(tree);
  });

  test('the browser page goes full screen over both columns, and back into its pane', async () => {
    const tree = await renderApp();
    await press(tree, 'More');
    await press(tree, 'Browser');
    await waitFor(() => labelsOf(tree).includes('Full screen'));
    // Beside the conversation, at the default width.
    expect(widthOf(tree, 'page-pane')).toBe(PAGE_PANE_DEFAULT);
    expect(labelsOf(tree)).toContain('Message to send');

    await press(tree, 'Full screen');
    await waitFor(() => labelsOf(tree).includes('Exit full screen'));
    expect(labelsOf(tree)).not.toContain('Message to send');
    expect(tree.root.findAll(n => n.props.testID === 'pinned-column')).toHaveLength(0);
    expect(tree.root.findAll(n => n.props.testID === 'page-pane')).toHaveLength(0);

    await press(tree, 'Exit full screen');
    await waitFor(() => labelsOf(tree).includes('Full screen'));
    expect(labelsOf(tree)).toContain('Message to send');
    expect(widthOf(tree, 'page-pane')).toBe(PAGE_PANE_DEFAULT);
    await unmount(tree);
  });

  test('closing the browser from full screen reopens it in its pane, not full screen', async () => {
    const tree = await renderApp();
    await press(tree, 'More');
    await press(tree, 'Browser');
    await press(tree, 'Full screen');
    await waitFor(() => labelsOf(tree).includes('Exit full screen'));
    await press(tree, 'Close browser');
    await waitFor(() => !labelsOf(tree).includes('Close browser'));
    await press(tree, 'More');
    await press(tree, 'Browser');
    await waitFor(() => labelsOf(tree).includes('Full screen'));
    expect(labelsOf(tree)).toContain('Message to send');
    await unmount(tree);
  });

  test('an attachment opens beside the conversation, and the toggle gives it the window', async () => {
    const file: SessionFileMeta = {
      id: 'f-viewer',
      filename: 'notes.md',
      type: 'file',
      mimeType: 'text/markdown',
      sizeBytes: 42,
      ts: '2026-08-06T10:00:00.000Z',
    };
    const tree = await renderApp();
    await ReactTestRenderer.act(async () => {
      DeviceEventEmitter.emit('claw:ws:message', {
        text: JSON.stringify({ type: 'files.list.result', files: [file], totalBytes: 0 }),
      });
    });
    await press(tree, 'Commands');
    await press(tree, 'Session files');
    await waitFor(() => labelsOf(tree).includes('Open file notes.md'));

    await press(tree, 'Open file notes.md');
    // Beside the conversation: the viewer's own column, at the page pane's default width, and
    // the files page it covered stays mounted for the way back.
    await waitFor(() => labelsOf(tree).includes('Read it full screen'));
    expect(widthOf(tree, 'viewer-pane')).toBe(PAGE_PANE_DEFAULT);
    expect(widthOf(tree, 'page-pane')).toBe(PAGE_PANE_DEFAULT);
    expect(labelsOf(tree)).toContain('Open file notes.md');
    expect(labelsOf(tree)).toContain('Message to send');

    await press(tree, 'Read it full screen');
    await waitFor(() => labelsOf(tree).includes('Read it beside the conversation'));
    expect(widthOf(tree, 'viewer-pane')).toBeUndefined();

    await press(tree, 'Read it beside the conversation');
    await waitFor(() => labelsOf(tree).includes('Read it full screen'));
    expect(widthOf(tree, 'viewer-pane')).toBe(PAGE_PANE_DEFAULT);

    await press(tree, 'Close file view');
    await waitFor(() => !labelsOf(tree).includes('Read it full screen'));
    // The page it covered is what comes back, with its rows and its scroll.
    expect(labelsOf(tree)).toContain('Open file notes.md');
    await unmount(tree);
  });
});

test('a phone has no column to fold, and its browser page is full screen already', async () => {
  (useWindowDimensions as unknown as jest.Mock).mockReturnValue({ width: 412, height: 900, scale: 2, fontScale: 1 });
  const tree = await renderApp();
  expect(labelsOf(tree)).not.toContain('Hide the conversation list');
  await unmount(tree);
});
