/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { sessionStore } from '../src/core/sessions';
import type { HistoryEntry, WorkspaceEntry } from '../src/core/protocol';
import { labelsOf, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 't-ws';

const history: HistoryEntry[] = [
  { id: 'h-0', role: 'user', text: 'check the site', ts: '2026-01-01T10:00:00.000Z' },
  { id: 'h-1', role: 'assistant', text: 'the command replied', ts: '2026-01-01T10:00:02.000Z' },
];

const WORKSPACES: WorkspaceEntry[] = [
  { key: 'default', path: '/home/neras/.my-claw/workspace', default: true },
  { key: 'sofa', path: '/home/neras/dev/SOFA', default: false },
];

function emit(frame: unknown): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function pressLabel(tree: Tree, label: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    const targets = tree.root.findAll(
      node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
      { deep: true },
    );
    const target = targets[0] ?? tree.root.find(node => node.props.accessibilityLabel === label);
    target.props.onPress();
  });
}

function optionSelected(tree: Tree, label: string): boolean {
  const option = tree.root.find(
    node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
  return option.props.accessibilityState?.selected === true;
}

function sentOf(tree: Tree, type: string): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls
    .map(([frame]) => JSON.parse(String(frame)))
    .filter(frame => frame.type === type);
}

async function renderWithHistory(): Promise<Tree> {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.seedHistory(THREAD, history);
  });
  await waitFor(() => textsOf(tree).includes('the command replied'));
  return tree;
}

beforeEach(() => {
  chatStore.clearAll();
  sessionStore.replace([]);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
  bridge.sendMessage.mockClear();
});

test('the + proposes a workspace for the new conversation and sends the pick', async () => {
  const tree = await renderWithHistory();
  await emit({ type: 'workspaces.list.result', workspaces: WORKSPACES });

  await pressLabel(tree, 'New conversation');
  await waitFor(() => labelsOf(tree).includes('Default workspace'));
  expect(textsOf(tree)).toContain('/home/neras/dev/SOFA');
  expect(optionSelected(tree, 'Default workspace')).toBe(true);
  expect(optionSelected(tree, 'sofa')).toBe(false);

  await pressLabel(tree, 'sofa');

  const sets = sentOf(tree, 'session.workspace.set');
  expect(sets).toHaveLength(1);
  expect(sets[0]).toMatchObject({ type: 'session.workspace.set', workspace: 'sofa' });
  expect(sets[0]!.threadId).not.toBe(THREAD);
  // The pick closed and the choice sticks until the server confirms it.
  await waitFor(() => !labelsOf(tree).includes('Default workspace'));
  expect(sessionStore.has(String(sets[0]!.threadId))).toBe(false);
  await unmount(tree);
});

test('Change workspace sits next to Session files in the Commands menu and switches the conversation', async () => {
  const tree = await renderWithHistory();
  await ReactTestRenderer.act(async () => {
    sessionStore.replace([
      { threadId: THREAD, title: 'the active one', messageCount: 4, createdAt: '2026-01-01T00:00:00.000Z', lastActiveAt: '2026-01-01T10:00:00.000Z', workspace: 'default' },
    ]);
  });
  await emit({ type: 'workspaces.list.result', workspaces: WORKSPACES });

  await pressLabel(tree, 'Commands');
  await waitFor(() => labelsOf(tree).includes('Change workspace'));
  expect(textsOf(tree)).toContain('current: default');

  await pressLabel(tree, 'Change workspace');
  await waitFor(() => labelsOf(tree).includes('sofa'));
  expect(optionSelected(tree, 'Default workspace')).toBe(true);

  await pressLabel(tree, 'sofa');

  const sets = sentOf(tree, 'session.workspace.set');
  expect(sets).toHaveLength(1);
  expect(sets[0]).toMatchObject({ type: 'session.workspace.set', threadId: THREAD, workspace: 'sofa' });
  // The optimistic echo updates the row right away, the server's answer will confirm.
  expect(sessionStore.workspaceOf(THREAD)).toBe('sofa');
  await unmount(tree);
});

test('the drawer conversation menu carries the same action and preselects the current workspace', async () => {
  const tree = await renderWithHistory();
  await ReactTestRenderer.act(async () => {
    sessionStore.replace([
      { threadId: THREAD, title: 'the active one', messageCount: 4, createdAt: '2026-01-01T00:00:00.000Z', lastActiveAt: '2026-01-01T10:00:00.000Z' },
      { threadId: 'other-thread', title: 'the other one', messageCount: 1, createdAt: '2026-01-02T00:00:00.000Z', lastActiveAt: '2026-01-02T10:00:00.000Z', workspace: 'sofa' },
    ]);
  });
  await emit({ type: 'workspaces.list.result', workspaces: WORKSPACES });

  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Actions for conversation the other one');
  await waitFor(() => labelsOf(tree).includes('Change workspace'));
  expect(textsOf(tree)).toContain('current: sofa');

  await pressLabel(tree, 'Change workspace');
  await waitFor(() => labelsOf(tree).includes('sofa'));
  expect(optionSelected(tree, 'sofa')).toBe(true);
  expect(optionSelected(tree, 'Default workspace')).toBe(false);
  await unmount(tree);
});

test('a named workspace is badged on its drawer row, the default one stays unlabelled', async () => {
  const tree = await renderWithHistory();
  await ReactTestRenderer.act(async () => {
    sessionStore.replace([
      { threadId: THREAD, title: 'the active one', messageCount: 4, createdAt: '2026-01-01T00:00:00.000Z', lastActiveAt: '2026-01-01T10:00:00.000Z', workspace: 'sofa' },
      { threadId: 'plain-thread', title: 'the default one', messageCount: 1, createdAt: '2026-01-02T00:00:00.000Z', lastActiveAt: '2026-01-02T10:00:00.000Z', workspace: 'default' },
    ]);
  });

  await pressLabel(tree, 'Open conversations');
  await waitFor(() => textsOf(tree).includes('sofa'));
  // The default workspace is the silent baseline: no badge, no label.
  expect(textsOf(tree)).not.toContain('default');
  await unmount(tree);
});

test('the server answer supersedes the optimistic pick once the conversation is listed', async () => {
  const tree = await renderWithHistory();
  await emit({ type: 'workspaces.list.result', workspaces: WORKSPACES });

  await pressLabel(tree, 'New conversation');
  await waitFor(() => labelsOf(tree).includes('Default workspace'));
  await pressLabel(tree, 'sofa');
  const threadId = String(sentOf(tree, 'session.workspace.set')[0]!.threadId);

  await emit({ type: 'session.workspace.set.result', threadId, workspace: 'sofa' });
  await ReactTestRenderer.act(async () => {
    sessionStore.replace([
      { threadId, title: '(new conversation)', messageCount: 0, createdAt: '2026-01-03T00:00:00.000Z', lastActiveAt: '2026-01-03T10:00:00.000Z', workspace: 'sofa' },
      { threadId: THREAD, title: 'the active one', messageCount: 4, createdAt: '2026-01-01T00:00:00.000Z', lastActiveAt: '2026-01-01T10:00:00.000Z' },
    ]);
  });

  await pressLabel(tree, 'Open conversations');
  await waitFor(() => textsOf(tree).includes('sofa'));
  await unmount(tree);
});
