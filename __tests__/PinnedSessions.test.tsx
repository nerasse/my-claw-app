/**
 * @format
 *
 * Pinned conversations: the drawer lifts them into their own section, their actions button
 * becomes a drag handle, and the whole arrangement survives server refreshes because the
 * order lives in the per-device preferences, not in the session list.
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { pinnedStore } from '../src/core/pinned';
import { labelsOf, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function summary(threadId: string, title: string) {
  return {
    threadId,
    title,
    messageCount: 1,
    createdAt: '2026-08-06T10:00:00.000Z',
    lastActiveAt: '2026-08-06T10:05:00.000Z',
  };
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

test('pinning lifts a conversation into its own section and makes the row announce the hold', async () => {
  const tree = await bootWith([summary('t-alpha', 'Alpha'), summary('t-beta', 'Beta')]);
  await pressLabel(tree, 'Open conversations');
  await waitFor(() => textsOf(tree).includes('conversations · 2'));

  await pressLabel(tree, 'Actions for conversation Alpha');
  await pressLabel(tree, 'Pin to top');

  await waitFor(() => textsOf(tree).includes('pinned · 1'));
  expect(textsOf(tree)).toContain('conversations · 1');
  // The row itself is the grab area, so the row is what announces the hold — and the actions
  // button goes back to being nothing but a button.
  expect(labelsOf(tree)).toContain('Conversation Alpha, hold to reorder');
  expect(labelsOf(tree)).toContain('Actions for conversation Alpha');
  await settleAndUnmount(tree);
});

test('unpinning puts the conversation back into the list', async () => {
  const tree = await bootWith([summary('t-alpha', 'Alpha'), summary('t-beta', 'Beta')]);
  await pressLabel(tree, 'Open conversations');
  await waitFor(() => textsOf(tree).includes('conversations · 2'));

  await pressLabel(tree, 'Actions for conversation Alpha');
  await pressLabel(tree, 'Pin to top');
  await waitFor(() => textsOf(tree).includes('pinned · 1'));

  await pressLabel(tree, 'Actions for conversation Alpha');
  await pressLabel(tree, 'Unpin');

  await waitFor(() => textsOf(tree).includes('conversations · 2'));
  expect(textsOf(tree)).not.toContain('pinned · 1');
  await settleAndUnmount(tree);
});

test('a dragged order sticks and survives a server refresh of the list', async () => {
  const tree = await bootWith([summary('t-alpha', 'Alpha'), summary('t-beta', 'Beta')]);
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Actions for conversation Alpha');
  await pressLabel(tree, 'Pin to top');
  await pressLabel(tree, 'Actions for conversation Beta');
  await pressLabel(tree, 'Pin to top');
  await waitFor(() => textsOf(tree).includes('pinned · 2'));

  // The drop of a drag: the store receives the new order, the drawer renders it.
  await ReactTestRenderer.act(async () => {
    pinnedStore.setOrder(['t-beta', 't-alpha']);
  });
  // Row order is read from the conversation labels: the pinned section renders its rows
  // first, so the dragged order must put Beta's row before Alpha's.
  const conversationOrder = () =>
    labelsOf(tree)
      .filter(label => label.startsWith('Conversation '))
      // Pinned rows carry the reorder hint; the order is what is under test, not the wording.
      .map(label => label.replace(', hold to reorder', ''));
  await waitFor(() => {
    const order = conversationOrder();
    return order.indexOf('Conversation Beta') >= 0
      && order.indexOf('Conversation Beta') < order.indexOf('Conversation Alpha');
  });

  // The server re-sends its list (activity elsewhere); the pins and their order survive.
  await emit({ type: 'session.list.result', sessions: [summary('t-alpha', 'Alpha'), summary('t-beta', 'Beta')] });
  await waitFor(() => textsOf(tree).includes('pinned · 2'));
  const order = conversationOrder();
  expect(order.indexOf('Conversation Beta')).toBeLessThan(order.indexOf('Conversation Alpha'));
  await settleAndUnmount(tree);
});

test('the pinned section is one column wide, and the row itself is the grab area', async () => {
  const tree = await bootWith([summary('t-alpha', 'Alpha')]);
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Actions for conversation Alpha');
  await pressLabel(tree, 'Pin to top');
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
  const tree = await bootWith([summary('t-alpha', 'Alpha'), summary('t-beta', 'Beta')]);
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Actions for conversation Alpha');
  await pressLabel(tree, 'Pin to top');
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

test('a drop reorders from the rows the sortable hands back', async () => {
  const tree = await bootWith([summary('t-alpha', 'Alpha'), summary('t-beta', 'Beta')]);
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Actions for conversation Alpha');
  await pressLabel(tree, 'Pin to top');
  await pressLabel(tree, 'Actions for conversation Beta');
  await pressLabel(tree, 'Pin to top');
  await waitFor(() => textsOf(tree).includes('pinned · 2'));

  // The drop itself, played through the callback the grid owns: the reordered rows come back
  // as data, and the store must be written from them.
  const grid = tree.root.find(node => node.props.testID === 'sortable-grid');
  await ReactTestRenderer.act(async () => {
    grid.props.onDragEnd({ data: [summary('t-beta', 'Beta'), summary('t-alpha', 'Alpha')] });
  });

  expect(pinnedStore.orderOf()).toEqual(['t-beta', 't-alpha']);
  const order = labelsOf(tree)
    .filter(label => label.startsWith('Conversation '))
    .map(label => label.replace(', hold to reorder', ''));
  expect(order.indexOf('Conversation Beta')).toBeLessThan(order.indexOf('Conversation Alpha'));
  await settleAndUnmount(tree);
});

test('a session that disappears takes its pin with it', async () => {
  const tree = await bootWith([summary('t-alpha', 'Alpha'), summary('t-beta', 'Beta')]);
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Actions for conversation Alpha');
  await pressLabel(tree, 'Pin to top');
  await waitFor(() => textsOf(tree).includes('pinned · 1'));

  await emit({ type: 'session.list.result', sessions: [summary('t-beta', 'Beta')] });
  await waitFor(() => textsOf(tree).includes('conversations · 1'));
  expect(textsOf(tree)).not.toContain('pinned · 1');
  expect(labelsOf(tree)).not.toContain('Conversation Alpha, hold to reorder');
  await settleAndUnmount(tree);
});
