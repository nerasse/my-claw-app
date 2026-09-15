/**
 * @format
 *
 * Folders as sections of the conversation list: the header, its count, the rows under it, and the
 * one section that is always there.
 */

import ReactTestRenderer from 'react-test-renderer';
import { ActivityIndicator } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { sessionStore } from '../src/core/sessions';
import { questionStore } from '../src/core/questionStore';
import { FolderIcon } from '../src/components/icons';
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
  questionStore.clear();
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

test('a folder counts what its conversations are asking of the owner', async () => {
  const tree = await renderList();

  await ReactTestRenderer.act(async () => {
    chatStore.markUnread('cf-1');
  });
  expect(labelsOf(tree)).toContain('Folder CubeFlow, 1 with activity');

  await ReactTestRenderer.act(async () => {
    questionStore.ask({
      type: 'question.ask',
      id: 'q1',
      threadId: 'cf-2',
      questions: [],
      ts: '2026-01-01T00:00:00.000Z',
    });
  });
  // Both are true of this folder; the one waiting on a person is the one it wears.
  expect(labelsOf(tree)).toContain('Folder CubeFlow, 1 question waiting');
  expect(textsOf(tree)).toContain('?1');

  await unmount(tree);
});

test('a run in flight reaches the folder that is hiding it', async () => {
  const tree = await renderList();

  await ReactTestRenderer.act(async () => {
    chatStore.startRun('cf-1');
  });

  // Folded or not, the folder is what hides a run: the badge is the only sign left.
  expect(labelsOf(tree)).toContain('Folder CubeFlow, 1 with activity');

  // The header's label carries the badge, so that is the one to press: a screen reader hears the
  // count before the fold, which is the order the information matters in.
  await pressAny(tree, 'Folder CubeFlow, 1 with activity');
  expect(labelsOf(tree)).not.toContain(row('cf chat'));
  expect(labelsOf(tree)).toContain('Folder CubeFlow, 1 with activity');

  await unmount(tree);
});

test('a run in flight is written on the row, not only on the folder', async () => {
  const tree = await renderList();

  // Nothing is answering yet, so no row draws a spinner.
  expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    chatStore.startRun('cf-1');
  });

  // The folder wears the count, and the row it counts says what it is: the same vocabulary on both,
  // so the badge of a folder is never a claim the list under it cannot account for.
  expect(labelsOf(tree)).toContain('Folder CubeFlow, 1 with activity');
  expect(labelsOf(tree)).toContain(`${row('cf chat')}, answering`);
  expect(tree.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => {
    chatStore.endRun('cf-1');
  });

  // And when the run ends, both say nothing again.
  expect(labelsOf(tree)).not.toContain('Folder CubeFlow, 1 with activity');
  expect(labelsOf(tree)).not.toContain(`${row('cf chat')}, answering`);
  expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);

  await unmount(tree);
});

test('a quiet folder carries nothing, and its other sections keep their own count', async () => {
  const tree = await renderList();

  await ReactTestRenderer.act(async () => {
    chatStore.markUnread('plain');
  });

  expect(labelsOf(tree)).toContain('Folder CubeFlow');
  // The unfiled section is not a folder: what nobody filed has no header to wear a badge on.
  expect(labelsOf(tree)).not.toContain('Folder CubeFlow, 1 with activity');
  expect(textsOf(tree)).toContain('No folder · 1');

  await unmount(tree);
});

test('a fold is remembered on the device, and the list comes back folded', async () => {
  // Second launch: the settings bag already holds the fold, so the drawer draws it before anyone
  // touches it. Nothing else about the list changes.
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', collapsedFolders: 'f1' });
  const tree = await renderAppHome();
  await ReactTestRenderer.act(async () => {
    sessionStore.replace(
      [
        session('cf-1', 'cf chat', { folderId: 'f1' }),
        session('cf-2', 'cf other', { folderId: 'f1' }),
        session('plain', 'no folder chat', { workspace: 'dev' }),
      ],
      [CUBEFLOW, CARRIERE],
    );
  });

  await waitFor(() => labelsOf(tree).includes('Folder CubeFlow'));
  expect(labelsOf(tree)).not.toContain(row('cf chat'));
  expect(textsOf(tree)).toContain('CubeFlow · 2');

  await pressAny(tree, 'Folder CubeFlow');
  expect(labelsOf(tree)).toContain(row('cf chat'));
  expect(bridge.prefsSet).toHaveBeenCalledWith('collapsedFolders', '');

  await unmount(tree);
});

test('a folder carries its glyph, and the section that is not a folder does not', async () => {
  const tree = await renderList();

  // The home screen mounts two drawers: one glyph per folder header, twice over.
  expect(tree.root.findAllByType(FolderIcon)).toHaveLength(4);

  await unmount(tree);

  const withoutFolders = await renderList([]);
  expect(withoutFolders.root.findAllByType(FolderIcon)).toHaveLength(0);

  await unmount(withoutFolders);
});
