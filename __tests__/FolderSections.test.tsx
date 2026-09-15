/**
 * @format
 *
 * Folders as sections of the conversation list: the header, its count, the rows under it, and the
 * one section that is always there.
 */

import ReactTestRenderer from 'react-test-renderer';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { sessionStore } from '../src/core/sessions';
import type { FolderSummary, SessionSummary } from '../src/core/protocol';
import { labelsOf, renderAppHome, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

const row = (title: string): string => `Conversation ${title}`;

/**
 * The home screen mounts two drawers -- the slide-over panel and the full-bleed home list -- so a
 * label can name two nodes. Either will do, they read the same state.
 */
async function pressAny(tree: Tree, label: string): Promise<void> {
  await waitFor(() => labelsOf(tree).includes(label));
  const target = tree.root.findAll(
    node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
    { deep: true },
  )[0];
  if (!target) throw new Error(`no pressable labelled ${label}`);
  await ReactTestRenderer.act(async () => target.props.onPress());
}

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

async function renderList(folders: FolderSummary[] = [CUBEFLOW, CARRIERE], filter: string | null = null): Promise<Tree> {
  const tree = await renderAppHome();
  await ReactTestRenderer.act(async () => {
    sessionStore.replace(
      [
        session('cf-1', 'cf chat', { folderId: 'f1' }),
        session('cf-2', 'cf other', { folderId: 'f1' }),
        session('career-1', 'career chat', { folderId: 'f2' }),
        session('plain', 'no folder chat', { workspace: 'dev' }),
      ],
      folders,
    );
  });
  await waitFor(() => labelsOf(tree).includes(row('cf chat')));
  if (filter !== null) {
    await pressAny(tree, 'Filter by workspace');
    await pressAny(tree, filter);
  }
  return tree;
}

beforeEach(() => {
  chatStore.clearAll();
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark' });
});

test('a folder is a section: its name, its count, and its rows', async () => {
  const tree = await renderList();

  expect(textsOf(tree)).toContain('CubeFlow · 2');
  expect(textsOf(tree)).toContain('Carrière · 1');
  expect(labelsOf(tree)).toContain(row('cf chat'));
  expect(labelsOf(tree)).toContain(row('career chat'));

  await unmount(tree);
});

test('the conversations nobody filed are a section of their own, and they come last', async () => {
  const tree = await renderList();

  const headers = textsOf(tree).filter(text => text.endsWith('· 1') || text.endsWith('· 2'));
  expect(headers).toContain('No folder · 1');
  // Rank order first, and the conversations in no folder after every folder: the list reads
  // top to bottom as the cabinet does.
  expect(textsOf(tree).indexOf('CubeFlow · 2')).toBeLessThan(textsOf(tree).indexOf('No folder · 1'));
  expect(labelsOf(tree)).toContain(row('no folder chat'));

  await unmount(tree);
});

test('a tap on a folder folds it, and its count stays on the header', async () => {
  const tree = await renderList();

  await pressAny(tree, 'Folder CubeFlow');

  expect(labelsOf(tree)).not.toContain(row('cf chat'));
  expect(labelsOf(tree)).not.toContain(row('cf other'));
  // Folded is not hidden: the header still says what is inside, and the other sections are untouched.
  expect(textsOf(tree)).toContain('CubeFlow · 2');
  expect(labelsOf(tree)).toContain(row('career chat'));

  await pressAny(tree, 'Folder CubeFlow');
  expect(labelsOf(tree)).toContain(row('cf chat'));

  await unmount(tree);
});

test('under a workspace filter, a folder with nothing left in it is not drawn', async () => {
  const tree = await renderList([CUBEFLOW, CARRIERE], 'dev');

  expect(textsOf(tree)).not.toContain('CubeFlow · 2');
  expect(textsOf(tree)).not.toContain('Carrière · 1');
  expect(labelsOf(tree)).toContain(row('no folder chat'));

  await unmount(tree);
});

test('a folder born in the filtered workspace is still drawn, empty', async () => {
  const tree = await renderList([{ id: 'f3', name: 'CubeFlow', rank: 0, workspace: 'dev' }], 'dev');

  expect(textsOf(tree)).toContain('CubeFlow · 0');
  expect(labelsOf(tree)).toContain(row('no folder chat'));

  await unmount(tree);
});
