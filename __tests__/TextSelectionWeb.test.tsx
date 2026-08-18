/**
 * The same conversation on a platform that can select text by itself.
 *
 * A browser selects across nodes and the chat list opts back into `user-select`, so the hold that
 * leads to the message menu on Android fires in the middle of the drag a reader is making to
 * select, and steals it. Where `chatSelectable` is true the bubble carries no long press at all,
 * and the menu is reached by the row's own button (or a right-click, which is the same handler).
 *
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import type { HistoryEntry } from '../src/core/protocol';
import { press, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

jest.mock('../src/core/platform', () => ({
  ...(jest.requireActual('../src/core/platform') as object),
  chatSelectable: true,
}));

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 't-select-web';

const history: HistoryEntry[] = [
  {
    id: 'h-1',
    role: 'assistant',
    text: 'the command replied',
    ts: '2026-01-01T10:00:02.000Z',
  },
];

async function renderThread(): Promise<Tree> {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.seedHistory(THREAD, history);
  });
  await waitFor(() => textsOf(tree).includes('the command replied'));
  return tree;
}

beforeEach(() => {
  chatStore.clearAll();
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

test('no bubble holds a long press when the platform selects text itself', async () => {
  const tree = await renderThread();

  expect(tree.root.findAll(node => typeof node.props?.onLongPress === 'function')).toHaveLength(0);

  await unmount(tree);
});

test('the message menu is still one press away, on the bubble button', async () => {
  const tree = await renderThread();

  await press(tree, 'Message actions');
  await waitFor(() => textsOf(tree).includes('Copy text'));
  expect(textsOf(tree)).toContain('Select text');

  await unmount(tree);
});
