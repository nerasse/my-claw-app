/**
 * @format
 *
 * Dragging a conversation into another folder: hold still to pick it up, move, let go over a
 * section.
 *
 * react-test-renderer has no layout engine and `onLayout` never fires on its own, so the test
 * reports the heights the lines would have and aims at where those heights add up to. That sum is
 * the drawer's own arithmetic (`stackLines`), and the numbers it produces are pinned with literals
 * in `dragMove.test.ts`: here it is only how a finger finds a line.
 */

import ReactTestRenderer from 'react-test-renderer';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { prefs } from '../src/core/prefs';
import { sessionStore } from '../src/core/sessions';
import { stackLines } from '../src/core/dragMove';
import { SEPARATOR_HEIGHT } from '../src/app/Drawer';
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

/** The list as the test draws it: every entry with the height it reports, in drawing order. */
const LIST: Array<[string, number]> = [
  ['section:f1', 30],
  ['cf-1', 60],
  ['section:f2', 30],
  ['career-1', 60],
  ['section:', 30],
  ['plain', 60],
];

async function place(tree: Tree, key: string, height: number): Promise<void> {
  // The home screen mounts two drawers, and each holds its own heights: report the line in both,
  // or whichever one the gesture happens to belong to tests against nothing.
  const nodes = tree.root.findAll(
    candidate => candidate.props.testID === `line:${key}` && typeof candidate.props.onLayout === 'function',
    { deep: true },
  );
  if (nodes.length === 0) throw new Error(`no line drawn for ${key}`);
  await ReactTestRenderer.act(async () => {
    for (const node of nodes) {
      node.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 250, height } } });
    }
  });
}

/** The gesture played out in one go: the hold, the move, the release. */
async function drag(from: number, to: number): Promise<void> {
  await ReactTestRenderer.act(async () => {
    fireGestureHandler(getByGestureTestId('drawerDrag'), [
      { state: State.BEGAN, x: 120, y: from },
      { state: State.ACTIVE, x: 120, y: from },
      { state: State.ACTIVE, x: 120, y: to },
      { state: State.END, x: 120, y: to },
    ]);
  });
}

/**
 * A press-down on the list, past every line. It is what lowers the flag the last release raised,
 * and where it lands does not matter: what the owner touched is the list, and that is the whole
 * signal. Past every line, because the harness fills a lone `BEGAN` out into a whole gesture, and
 * a press that carried something would raise the flag again.
 */
async function tapDown(): Promise<void> {
  await ReactTestRenderer.act(async () => {
    fireGestureHandler(getByGestureTestId('drawerDrag'), [
      { state: State.BEGAN, x: 120, y: 900 },
      { state: State.ACTIVE, x: 120, y: 900 },
      { state: State.END, x: 120, y: 900 },
    ]);
  });
}

/** A press on a line, which is what a tap delivers -- and what a release sends after a drag. */
async function press(tree: Tree, label: string): Promise<void> {
  await waitFor(() => labelsOf(tree).includes(label));
  const nodes = tree.root.findAll(
    node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
    { deep: true },
  );
  const target = nodes[nodes.length - 1];
  if (!target) throw new Error(`no pressable labelled ${label}`);
  await ReactTestRenderer.act(async () => target.props.onPress());
}

function sent(): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls.map(call => JSON.parse(String(call[0])) as Record<string, unknown>);
}

/**
 * Two folders with a conversation each, and one nobody filed, laid out. The returned positions are
 * the middle of each line: what a finger aims at, in the list's own coordinates.
 */
async function renderList(): Promise<{ tree: Tree; at: Record<string, number> }> {
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
  for (const [key, height] of LIST) await place(tree, key, height);
  const boxes = stackLines(
    LIST.map(([key]) => ({ key, folderId: null, role: 'row' as const })),
    new Map(LIST),
    SEPARATOR_HEIGHT,
  );
  const at: Record<string, number> = {};
  for (const box of boxes) at[box.key] = Math.floor(box.y + box.height / 2);
  return { tree, at };
}

beforeEach(() => {
  chatStore.clearAll();
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark' });
  bridge.sendMessage.mockClear();
  bridge.sendMessage.mockResolvedValue(true);
});

test('a conversation dropped on a folder is filed into it', async () => {
  const { tree, at } = await renderList();

  await drag(at.plain, at['section:f1']);

  expect(sent()).toContainEqual({ type: 'session.folder', threadId: 'plain', folderId: 'f1' });

  await unmount(tree);
});

test('a conversation dropped on the unfiled section is taken out of its folder', async () => {
  const { tree, at } = await renderList();

  await drag(at['cf-1'], at['section:']);

  expect(sent()).toContainEqual({ type: 'session.folder', threadId: 'cf-1', folderId: null });

  await unmount(tree);
});

test('letting go over the section it came from files nothing', async () => {
  const { tree, at } = await renderList();

  await drag(at.plain, at.plain);
  await drag(at.plain, at['section:']);

  expect(sent()).not.toContainEqual(expect.objectContaining({ type: 'session.folder' }));

  await unmount(tree);
});

test('letting go outside every section files nothing', async () => {
  const { tree, at } = await renderList();

  // A drag that ends nowhere is a drag the owner changed his mind about.
  await drag(at.plain, 900);

  expect(sent()).not.toContainEqual(expect.objectContaining({ type: 'session.folder' }));

  await unmount(tree);
});

test('the heading of the conversations nobody filed is not something to pick up', async () => {
  const { tree, at } = await renderList();

  // It names no folder: there is nothing to carry and no place in an order of folders.
  await drag(at['section:'], at['section:f1']);

  expect(sent()).not.toContainEqual(expect.objectContaining({ type: 'session.folder' }));
  expect(sent()).not.toContainEqual(expect.objectContaining({ type: 'folder.order' }));

  await unmount(tree);
});

test('a folder dropped on another one takes its place', async () => {
  const { tree, at } = await renderList();

  // Carrière onto CubeFlow: it moves to the top and CubeFlow shifts down.
  await drag(at['section:f2'], at['section:f1']);

  expect(sent()).toContainEqual({ type: 'folder.order', folderIds: ['f2', 'f1'] });
  // And it moves now, not after a round trip: the echo is what makes the gesture feel answered.
  expect(textsOf(tree).indexOf('Carrière · 1')).toBeLessThan(textsOf(tree).indexOf('CubeFlow · 1'));

  await unmount(tree);
});

test('a folder let go where it already is reorders nothing', async () => {
  const { tree, at } = await renderList();

  // CubeFlow onto Carrière: it would take the place it already holds, so nothing is sent.
  await drag(at['section:f1'], at['section:f2']);
  await drag(at['section:f2'], at['section:f2']);

  expect(sent()).not.toContainEqual(expect.objectContaining({ type: 'folder.order' }));

  await unmount(tree);
});

test('a folder dropped on the conversations nobody filed reorders nothing', async () => {
  const { tree, at } = await renderList();

  await drag(at['section:f1'], at['section:']);

  expect(sent()).not.toContainEqual(expect.objectContaining({ type: 'folder.order' }));

  await unmount(tree);
});

test('the click a release sends does not also open the conversation', async () => {
  const { tree, at } = await renderList();

  await drag(at.plain, at['section:f1']);
  expect(sent()).toContainEqual({ type: 'session.folder', threadId: 'plain', folderId: 'f1' });

  // A browser dispatches the click where the button came up, whatever the gesture did with the
  // press first: filing a conversation must not also open it.
  await press(tree, 'Conversation no folder chat');
  expect(prefs.get().lastThreadId).toBeNull();

  // And it is that click alone: the next press-down clears the flag, so the tap after it opens as
  // it always did -- nothing is swallowed that the owner did not ask to be swallowed.
  await tapDown();
  await press(tree, 'Conversation no folder chat');
  expect(prefs.get().lastThreadId).toBe('plain');

  await unmount(tree);
});
