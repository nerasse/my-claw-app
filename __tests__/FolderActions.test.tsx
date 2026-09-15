/**
 * @format
 *
 * The folder gestures: naming one, renaming it, deleting it, and filing a conversation into it.
 * What each one sends is the contract; the server owns the rest.
 */

import ReactTestRenderer from 'react-test-renderer';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { sessionStore } from '../src/core/sessions';
import type { FolderSummary, SessionSummary } from '../src/core/protocol';
import { labelsOf, renderAppHome, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

const row = (title: string): string => `Conversation ${title}`;

/** The home screen mounts two drawers, so a label can name two nodes: either will do. */
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

async function renderList(withFolders = true): Promise<Tree> {
  const tree = await renderAppHome();
  await ReactTestRenderer.act(async () => {
    sessionStore.replace(
      [
        session('cf-1', 'cf chat', { folderId: 'f1' }),
        session('plain', 'no folder chat', { workspace: 'dev' }),
      ],
      withFolders ? [CUBEFLOW, CARRIERE] : [],
    );
  });
  await waitFor(() => labelsOf(tree).includes(row('cf chat')));
  return tree;
}

/** Types into a prompt sheet and confirms it. */
async function nameIt(tree: Tree, title: string, value: string, confirm: string): Promise<void> {
  const field = tree.root.findAll(
    node => String(node.type) === 'TextInput' && node.props.accessibilityLabel === title,
    { deep: true },
  )[0];
  if (!field) throw new Error(`no prompt titled ${title}`);
  await ReactTestRenderer.act(async () => field.props.onChangeText(value));
  await pressAny(tree, confirm);
}

/** The frames this shell sent, as objects, newest last. */
function sent(): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls.map(call => JSON.parse(String(call[0])) as Record<string, unknown>);
}

beforeEach(() => {
  chatStore.clearAll();
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark' });
  bridge.sendMessage.mockClear();
  bridge.sendMessage.mockResolvedValue(true);
});

test('a folder is named and created, in the workspace the list is filtered to', async () => {
  const tree = await renderList();

  await pressAny(tree, 'New folder');
  await nameIt(tree, 'Name this folder', 'Infra', 'Create');

  // Unfiltered, the folder is born nowhere in particular: its workspace defaults the conversations
  // created from inside it, and there is no view to take one from.
  expect(sent()).toContainEqual({ type: 'folder.create', name: 'Infra' });

  // Filtered, it is born where the owner is looking, which is also what keeps an empty folder
  // visible under that filter.
  await pressAny(tree, 'Filter by workspace');
  await pressAny(tree, 'dev');
  await pressAny(tree, 'New folder');
  await nameIt(tree, 'Name this folder', 'Infra', 'Create');

  expect(sent()).toContainEqual({ type: 'folder.create', name: 'Infra', workspace: 'dev' });

  await unmount(tree);
});

test('a conversation is filed from its own menu, and can be taken out again', async () => {
  const tree = await renderList();

  await pressAny(tree, 'Actions for conversation no folder chat');
  await pressAny(tree, 'Move to folder…');
  await pressAny(tree, 'CubeFlow');

  expect(sent()).toContainEqual({ type: 'session.folder', threadId: 'plain', folderId: 'f1' });
  // The listing follows and confirms, but the row moves now: waiting for the round trip reads as
  // a tap that did nothing.
  expect(textsOf(tree)).toContain('CubeFlow · 2');
  expect(textsOf(tree)).toContain('No folder · 0');

  await pressAny(tree, 'Actions for conversation cf chat');
  await pressAny(tree, 'Move to folder…');
  await pressAny(tree, 'No folder');

  expect(sent()).toContainEqual({ type: 'session.folder', threadId: 'cf-1', folderId: null });

  await unmount(tree);
});

test('the move picker says where the conversation sits right now', async () => {
  const tree = await renderList();

  await pressAny(tree, 'Actions for conversation cf chat');
  await pressAny(tree, 'Move to folder…');

  // The row that says where it is, and the one that would take it out of everything.
  expect(textsOf(tree)).toContain('Move "cf chat" to');
  expect(labelsOf(tree)).toContain('No folder');
  expect(labelsOf(tree)).toContain('Carrière');

  await unmount(tree);
});

test('a folder is renamed from its own menu', async () => {
  const tree = await renderList();

  await pressAny(tree, 'Actions for folder CubeFlow');
  await pressAny(tree, 'Rename');
  await nameIt(tree, 'Rename this folder', 'CubeFlow Desk', 'Rename');

  expect(sent()).toContainEqual({ type: 'folder.rename', folderId: 'f1', name: 'CubeFlow Desk' });

  await unmount(tree);
});

test('deleting a folder asks first, and says what it leaves behind', async () => {
  const tree = await renderList();

  await pressAny(tree, 'Actions for folder CubeFlow');
  await pressAny(tree, 'Delete folder');

  // Nothing is deleted with a folder: the question says so before the answer is given.
  expect(textsOf(tree)).toContain('Delete the folder CubeFlow? Its conversations stay in the list.');
  expect(sent()).not.toContainEqual(expect.objectContaining({ type: 'folder.remove' }));

  await pressAny(tree, 'Delete');

  expect(sent()).toContainEqual({ type: 'folder.remove', folderId: 'f1' });

  await unmount(tree);
});

test('with no folder yet, the list offers to make one and nothing else moves', async () => {
  const tree = await renderList(false);

  // The section that holds everything says so without inventing a folder to say it.
  expect(textsOf(tree)).toContain('conversations · 2');
  expect(labelsOf(tree)).toContain('New folder');

  await pressAny(tree, 'Actions for conversation cf chat');
  await pressAny(tree, 'Move to folder…');
  expect(textsOf(tree)).toContain('Move "cf chat" to');
  expect(labelsOf(tree)).toContain('No folder');

  await unmount(tree);
});
