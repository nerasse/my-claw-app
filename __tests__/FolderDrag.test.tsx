/**
 * @format
 *
 * Dragging a conversation into another folder: hold still to pick it up, move, let go over a
 * section. The hit test reads the boxes the lines report, so the test places them by hand --
 * react-test-renderer has no layout engine and `onLayout` never fires on its own.
 */

import ReactTestRenderer from 'react-test-renderer';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { sessionStore } from '../src/core/sessions';
import type { FolderSummary, SessionSummary } from '../src/core/protocol';
import { labelsOf, renderAppHome, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

function session(threadId: string, title: string, over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    threadId,
    title,
    messageCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastActiveAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const CUBEFLOW: FolderSummary = { id: 'f1', name: 'CubeFlow', rank: 0 };
const CARRIERE: FolderSummary = { id: 'f2', name: 'Carrière', rank: 1 };

async function place(tree: Tree, key: string, y: number, height: number): Promise<void> {
  // The home screen mounts two drawers, and each holds its own boxes: place the line in both, or
  // whichever one the gesture happens to belong to drags against an empty list.
  const nodes = tree.root.findAll(
    candidate =>
      candidate.props.testID === `line:${key}` && typeof candidate.props.onLayout === 'function',
    { deep: true },
  );
  if (nodes.length === 0) throw new Error(`no line drawn for ${key}`);
  await ReactTestRenderer.act(async () => {
    for (const node of nodes) {
      node.props.onLayout({ nativeEvent: { layout: { x: 0, y, width: 250, height } } });
    }
  });
}

/** The gesture played out in one go: the hold, the move, the release. */
async function drag(y: number, to: number): Promise<void> {
  await ReactTestRenderer.act(async () => {
    fireGestureHandler(getByGestureTestId('drawerDrag'), [
      { state: State.BEGAN, x: 120, y },
      { state: State.ACTIVE, x: 120, y },
      { state: State.ACTIVE, x: 120, y: to },
      { state: State.END, x: 120, y: to },
    ]);
  });
}

function sent(): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls.map(call => JSON.parse(String(call[0])) as Record<string, unknown>);
}

/**
 * Two folders with a conversation each, and one nobody filed:
 *
 *   0   CubeFlow header      30
 *   30  cf-1                 60
 *   90  Carrière header      30
 *   120 career-1             60
 *   180 unfiled header       30
 *   210 plain                60
 */
async function renderList(): Promise<Tree> {
  const tree = await renderAppHome();
  await ReactTestRenderer.act(async () => {
    sessionStore.replace(
      [
        session('cf-1', 'cf chat', { folderId: 'f1' }),
        session('career-1', 'career chat', { folderId: 'f2' }),
        session('plain', 'no folder chat'),
      ],
      [CUBEFLOW, CARRIERE],
    );
  });
  await waitFor(() => labelsOf(tree).includes('Conversation no folder chat'));
  await place(tree, 'section:f1', 0, 30);
  await place(tree, 'cf-1', 30, 60);
  await place(tree, 'section:f2', 90, 30);
  await place(tree, 'career-1', 120, 60);
  await place(tree, 'section:', 180, 30);
  await place(tree, 'plain', 210, 60);
  return tree;
}

beforeEach(() => {
  chatStore.clearAll();
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark' });
  bridge.sendMessage.mockClear();
  bridge.sendMessage.mockResolvedValue(true);
});

test('a conversation dropped on a folder is filed into it', async () => {
  const tree = await renderList();

  await drag(240, 10);

  expect(sent()).toContainEqual({ type: 'session.folder', threadId: 'plain', folderId: 'f1' });

  await unmount(tree);
});

test('a conversation dropped on the unfiled section is taken out of its folder', async () => {
  const tree = await renderList();

  await drag(60, 190);

  expect(sent()).toContainEqual({ type: 'session.folder', threadId: 'cf-1', folderId: null });

  await unmount(tree);
});

test('letting go over the section it came from files nothing', async () => {
  const tree = await renderList();

  await drag(240, 240);
  await drag(240, 190);

  expect(sent()).not.toContainEqual(expect.objectContaining({ type: 'session.folder' }));

  await unmount(tree);
});

test('letting go outside every section files nothing', async () => {
  const tree = await renderList();

  await drag(240, 900);

  // A drag that ends nowhere is a drag the owner changed his mind about.
  expect(sent()).not.toContainEqual(expect.objectContaining({ type: 'session.folder' }));

  await unmount(tree);
});

test('the heading of the conversations nobody filed is not something to pick up', async () => {
  const tree = await renderList();

  // It names no folder: there is nothing to carry and no place in an order of folders.
  await drag(190, 10);

  expect(sent()).not.toContainEqual(expect.objectContaining({ type: 'session.folder' }));
  expect(sent()).not.toContainEqual(expect.objectContaining({ type: 'folder.order' }));

  await unmount(tree);
});

test('a folder dropped on another one takes its place', async () => {
  const tree = await renderList();

  // Carrière onto CubeFlow: it moves to the top and CubeFlow shifts down.
  await drag(100, 10);

  expect(sent()).toContainEqual({ type: 'folder.order', folderIds: ['f2', 'f1'] });
  // And it moves now, not after a round trip: the echo is what makes the gesture feel answered.
  expect(textsOf(tree).indexOf('Carrière · 1')).toBeLessThan(textsOf(tree).indexOf('CubeFlow · 1'));

  await unmount(tree);
});

test('a folder let go where it already is reorders nothing', async () => {
  const tree = await renderList();

  // CubeFlow onto Carrière: it would take the place it already holds, so nothing is sent.
  await drag(10, 100);
  await drag(100, 100);

  expect(sent()).not.toContainEqual(expect.objectContaining({ type: 'folder.order' }));

  await unmount(tree);
});

test('a folder dropped on the conversations nobody filed reorders nothing', async () => {
  const tree = await renderList();

  await drag(10, 190);

  expect(sent()).not.toContainEqual(expect.objectContaining({ type: 'folder.order' }));

  await unmount(tree);
});
