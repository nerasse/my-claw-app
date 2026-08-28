/**
 * @format
 *
 * Pinned conversations: the drawer lifts them into their own section, their row becomes a drag
 * handle, and both the pin and its order belong to the server. The device asks (`session.pin`,
 * `session.pin.order`) and draws what comes back on the summaries, so the phone and the browser
 * cannot disagree about what is pinned.
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import { labelsOf, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function summary(threadId: string, title: string, pinRank?: number) {
  return {
    threadId,
    title,
    messageCount: 1,
    createdAt: '2026-08-06T10:00:00.000Z',
    lastActiveAt: '2026-08-06T10:05:00.000Z',
    ...(pinRank === undefined ? {} : { pinRank }),
  };
}

function sentFrames(): Record<string, unknown>[] {
  return bridge.sendMessage.mock.calls
    .map(([frame]) => {
      try {
        return JSON.parse(String(frame)) as Record<string, unknown>;
      } catch {
        return {};
      }
    })
    .filter(frame => String(frame.type).startsWith('session.pin'));
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

/** The chat screen's 40ms scroll timer must fire before unmount, or the next test crashes. */
async function settleAndUnmount(tree: Tree): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 60));
  });
  await unmount(tree);
}

async function bootWith(sessions: ReturnType<typeof summary>[]): Promise<Tree> {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions });
  return tree;
}

beforeEach(() => {
  bridge.sendMessage.mockClear();
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: 't-default' });
});

test('pinning asks the server, and the answer is what lifts the row into its own section', async () => {
  const tree = await bootWith([summary('t-alpha', 'Alpha'), summary('t-beta', 'Beta')]);
  await pressLabel(tree, 'Open conversations');
  await waitFor(() => textsOf(tree).includes('conversations · 2'));

  await pressLabel(tree, 'Actions for conversation Alpha');
  await pressLabel(tree, 'Pin to top');

  expect(sentFrames()).toEqual([{ type: 'session.pin', threadId: 't-alpha', pinned: true }]);
  // Nothing moved yet: the rank is the server's word, not the tap's.
  expect(textsOf(tree)).not.toContain('pinned · 1');

  await emit({
    type: 'session.list.result',
    sessions: [summary('t-alpha', 'Alpha', 0), summary('t-beta', 'Beta')],
  });

  await waitFor(() => textsOf(tree).includes('pinned · 1'));
  expect(textsOf(tree)).toContain('conversations · 1');
  // The row itself is the grab area, so the row is what announces the hold — and the actions
  // button goes back to being nothing but a button.
  expect(labelsOf(tree)).toContain('Conversation Alpha, hold to reorder');
  expect(labelsOf(tree)).toContain('Actions for conversation Alpha');
  await settleAndUnmount(tree);
});

test('unpinning asks for the pin to be dropped, and the row goes back to the list', async () => {
  const tree = await bootWith([summary('t-alpha', 'Alpha', 0), summary('t-beta', 'Beta')]);
  await pressLabel(tree, 'Open conversations');
  await waitFor(() => textsOf(tree).includes('pinned · 1'));

  await pressLabel(tree, 'Actions for conversation Alpha');
  await pressLabel(tree, 'Unpin');

  expect(sentFrames()).toEqual([{ type: 'session.pin', threadId: 't-alpha', pinned: false }]);

  await emit({
    type: 'session.list.result',
    sessions: [summary('t-alpha', 'Alpha'), summary('t-beta', 'Beta')],
  });

  await waitFor(() => textsOf(tree).includes('conversations · 2'));
  expect(textsOf(tree)).not.toContain('pinned · 1');
  await settleAndUnmount(tree);
});

test('the rank orders the pinned block, whatever order the listing arrives in', async () => {
  const tree = await bootWith([summary('t-alpha', 'Alpha', 1), summary('t-beta', 'Beta', 0)]);
  await pressLabel(tree, 'Open conversations');
  await waitFor(() => textsOf(tree).includes('pinned · 2'));

  const conversationOrder = () =>
    labelsOf(tree)
      .filter(label => label.startsWith('Conversation '))
      // Pinned rows carry the reorder hint; the order is what is under test, not the wording.
      .map(label => label.replace(', hold to reorder', ''));
  const order = conversationOrder();
  expect(order.indexOf('Conversation Beta')).toBeLessThan(order.indexOf('Conversation Alpha'));
  await settleAndUnmount(tree);
});

test('a drop sends the dropped order, read from the rows the sortable hands back', async () => {
  const tree = await bootWith([summary('t-alpha', 'Alpha', 0), summary('t-beta', 'Beta', 1)]);
  await pressLabel(tree, 'Open conversations');
  await waitFor(() => textsOf(tree).includes('pinned · 2'));

  const grid = tree.root.find(node => node.props.testID === 'sortable-grid');
  await ReactTestRenderer.act(async () => {
    grid.props.onDragEnd({ data: [summary('t-beta', 'Beta', 1), summary('t-alpha', 'Alpha', 0)] });
  });

  expect(sentFrames()).toEqual([
    { type: 'session.pin.order', threadIds: ['t-beta', 't-alpha'] },
  ]);
  await settleAndUnmount(tree);
});

test('a finger has to hold before it drags, a cursor drags on the spot', async () => {
  const tree = await bootWith([summary('t-alpha', 'Alpha', 0), summary('t-beta', 'Beta', 1)]);
  await pressLabel(tree, 'Open conversations');
  await waitFor(() => textsOf(tree).includes('pinned · 2'));

  // A touch has to say "this is a drag and not a scroll" by staying still first. Under a cursor
  // that same wait is the feature not working at all: the pointer moves the instant the button is
  // down, further than the offset that cancels an activation, so the press never became a drag.
  const grid = tree.root.find(node => node.props.testID === 'sortable-grid');
  expect(grid.props.dragActivationDelay).toBe(400);
  expect(grid.props.dragActivationFailOffset).toBe(5);
  await settleAndUnmount(tree);
});

test('the pinned section is one column wide, and the row itself is the grab area', async () => {
  const tree = await bootWith([summary('t-alpha', 'Alpha', 0)]);
  await pressLabel(tree, 'Open conversations');
  await waitFor(() => textsOf(tree).includes('pinned · 1'));

  // Both halves of the same bug: a sortable that is not told to be a single column falls back
  // to a wrapping row, where each cell sizes itself to its own title and shoves the actions
  // button past the edge of the panel — and a custom handle would then be the one thing you
  // have to hit to drag, which is precisely the thing pushed out of reach.
  const grid = tree.root.find(node => node.props.testID === 'sortable-grid');
  expect(grid.props.columns).toBe(1);
  expect(grid.props.customHandle).toBe(false);
  await settleAndUnmount(tree);
});

test('each heading sits on its own list, pinned block first', async () => {
  const tree = await bootWith([summary('t-alpha', 'Alpha', 0), summary('t-beta', 'Beta')]);
  await pressLabel(tree, 'Open conversations');
  await waitFor(() => textsOf(tree).includes('pinned · 1'));

  // The separation is the headings: the pinned count leads, the conversations count follows,
  // instead of floating above the search box where it headed nothing.
  const texts = textsOf(tree);
  expect(texts.indexOf('pinned · 1')).toBeLessThan(texts.indexOf('conversations · 1'));

  // And the blocks really are two: the pinned row lives inside the sortable, the plain one
  // does not. (A bare title lookup would catch the open conversation in the top bar too.)
  const grid = tree.root.find(node => node.props.testID === 'sortable-grid');
  // Deduplicated: one Pressable surfaces as both its composite and its host node.
  const inGrid = new Set(
    grid
      .findAll(node => typeof node.props.accessibilityLabel === 'string', { deep: true })
      .map(node => node.props.accessibilityLabel as string)
      .filter(label => label.startsWith('Conversation ')),
  );
  expect([...inGrid]).toEqual(['Conversation Alpha, hold to reorder']);
  await settleAndUnmount(tree);
});

test('a session that disappears takes its pin with it, with nothing to prune', async () => {
  const tree = await bootWith([summary('t-alpha', 'Alpha', 0), summary('t-beta', 'Beta')]);
  await pressLabel(tree, 'Open conversations');
  await waitFor(() => textsOf(tree).includes('pinned · 1'));

  await emit({ type: 'session.list.result', sessions: [summary('t-beta', 'Beta')] });
  await waitFor(() => textsOf(tree).includes('conversations · 1'));
  expect(textsOf(tree)).not.toContain('pinned · 1');
  expect(labelsOf(tree)).not.toContain('Conversation Alpha, hold to reorder');
  // And no reorder was invented on the way: a listing without the thread is not a drop.
  expect(sentFrames()).toEqual([]);
  await settleAndUnmount(tree);
});

test('the pins this device kept to itself are handed over once, then forgotten', async () => {
  bridge.prefsGetAll.mockResolvedValue({ pinnedSessions: '["t-beta","t-alpha"]', themeMode: 'dark', lastThreadId: 't-default' });

  const tree = await bootWith([summary('t-alpha', 'Alpha'), summary('t-beta', 'Beta')]);
  await waitFor(() => sentFrames().length === 3);

  expect(sentFrames()).toEqual([
    { type: 'session.pin', threadId: 't-beta', pinned: true },
    { type: 'session.pin', threadId: 't-alpha', pinned: true },
    { type: 'session.pin.order', threadIds: ['t-beta', 't-alpha'] },
  ]);
  // Cleared whatever the server makes of them: a second boot must not replay a stale order.
  expect(bridge.prefsSet).toHaveBeenCalledWith('pinnedSessions', null);
  await settleAndUnmount(tree);
});
