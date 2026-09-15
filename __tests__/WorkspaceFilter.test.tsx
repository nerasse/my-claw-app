/**
 * @format
 *
 * The workspace filter of the conversation list: what it masks, what it says about it, and where
 * its value lives. The value is the shell's, not the panel's, because the home list and the drawer
 * are two mounts of the same listing.
 */

import ReactTestRenderer from 'react-test-renderer';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { sessionStore } from '../src/core/sessions';
import type { SessionSummary } from '../src/core/protocol';
import { labelsOf, renderAppHome, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

/** The label a drawer row carries: the title alone is its text, not its accessible name. */
const row = (title: string): string => `Conversation ${title}`;

/**
 * The home screen mounts two drawers -- the slide-over panel and the full-bleed home list -- so a
 * label can name two nodes. The shared `press` insists on exactly one; here either will do, they
 * read the same state.
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

function session(threadId: string, title: string, workspace: string | undefined, lastActiveAt: string): SessionSummary {
  return {
    threadId,
    title,
    messageCount: 1,
    createdAt: lastActiveAt,
    lastActiveAt,
    ...(workspace ? { workspace } : {}),
  };
}

async function renderHomeList(): Promise<Tree> {
  const tree = await renderAppHome();
  await ReactTestRenderer.act(async () => {
    sessionStore.replace([
      session('dev-1', 'dev chat', 'dev', '2026-01-03T00:00:00.000Z'),
      session('dev-2', 'dev other', 'dev', '2026-01-02T00:00:00.000Z'),
      session('cf-1', 'cf chat', 'cf', '2026-01-01T00:00:00.000Z'),
      session('plain', 'no workspace', undefined, '2025-12-31T00:00:00.000Z'),
    ]);
  });
  await waitFor(() => labelsOf(tree).includes(row('cf chat')));
  return tree;
}

beforeEach(() => {
  chatStore.clearAll();
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark' });
});

test('the picker lists the workspaces in use, their counts, and the way back to everything', async () => {
  const tree = await renderHomeList();

  await pressAny(tree, 'Filter by workspace');

  expect(labelsOf(tree)).toContain('All workspaces');
  expect(labelsOf(tree)).toContain('dev');
  expect(labelsOf(tree)).toContain('cf');
  expect(labelsOf(tree)).toContain('default');
  // The count is what tells the owner which workspace is worth narrowing to before he narrows.
  expect(textsOf(tree)).toContain('2 conversations');
  // And the singular is singular: one conversation is not "1 conversations".
  expect(textsOf(tree)).toContain('1 conversation');

  await unmount(tree);
});

test('the filter masks the conversations of every other workspace, and the chip says so', async () => {
  const tree = await renderHomeList();

  await pressAny(tree, 'Filter by workspace');
  await pressAny(tree, 'dev');

  expect(labelsOf(tree)).toContain(row('dev chat'));
  expect(labelsOf(tree)).toContain(row('dev other'));
  expect(labelsOf(tree)).not.toContain(row('cf chat'));
  expect(labelsOf(tree)).not.toContain(row('no workspace'));
  // Masking silently would leave the owner wondering where his conversations went.
  expect(labelsOf(tree)).toContain('Clear the dev filter');
  expect(labelsOf(tree)).toContain('Filter by workspace, dev selected');

  await pressAny(tree, 'Clear the dev filter');

  expect(labelsOf(tree)).toContain(row('cf chat'));
  expect(labelsOf(tree)).toContain(row('no workspace'));
  expect(labelsOf(tree)).not.toContain('Clear the dev filter');

  await unmount(tree);
});

test('the filter belongs to the listing, not to the panel that was showing it', async () => {
  const tree = await renderHomeList();

  await pressAny(tree, 'Filter by workspace');
  await pressAny(tree, 'cf');
  // Opening a conversation replaces the home list with the chat: a filter the panel kept to itself
  // would be gone by now, and the drawer that was mounted all along shows the same listing.
  await pressAny(tree, row('cf chat'));
  await waitFor(() => labelsOf(tree).includes('Open conversations'));
  await pressAny(tree, 'Open conversations');

  expect(labelsOf(tree)).toContain(row('cf chat'));
  expect(labelsOf(tree)).not.toContain(row('dev chat'));

  await unmount(tree);
});

test('the search and the filter compose: the filter narrows what the search searches', async () => {
  const tree = await renderHomeList();

  await pressAny(tree, 'Filter by workspace');
  await pressAny(tree, 'dev');
  await ReactTestRenderer.act(async () => {
    // Both mounts of the listing, so the assertion below is about the composition and not about
    // which of the two panels happened to receive the keystroke.
    for (const input of tree.root.findAll(
      node => String(node.type) === 'TextInput' && node.props.placeholder === 'search',
      { deep: true },
    )) {
      input.props.onChangeText('other');
    }
  });

  expect(labelsOf(tree)).toContain(row('dev other'));
  expect(labelsOf(tree)).not.toContain(row('dev chat'));

  await unmount(tree);
});
