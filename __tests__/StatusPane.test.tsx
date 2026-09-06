/**
 * On a wide window the status and instructions pages open beside the conversation, in the pane
 * settings and files already use, instead of covering it: reading the report and the conversation
 * it is about at the same time is the point of a wide window.
 *
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter, useWindowDimensions } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import { chatStore } from '../src/core/chat';
import { statusStore } from '../src/core/status';
import { labelsOf, press, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

// Auto-mocked so the test states the window it is talking about.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions');

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 't-default';

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function sentFrames(): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls.map(([frame]) => JSON.parse(String(frame)) as Record<string, unknown>);
}

async function openThreadActions(tree: Tree): Promise<void> {
  await waitFor(() => labelsOf(tree).some(label => label.startsWith('Actions for conversation')));
  const label = labelsOf(tree).find(entry => entry.startsWith('Actions for conversation'))!;
  await press(tree, label);
}

/** Whether the control labelled `label` is drawn inside the pane beside the conversation. */
function inPane(tree: Tree, label: string): boolean {
  const pane = tree.root.findAll(node => node.props.testID === 'page-pane', { deep: true });
  return pane.some(node => node.findAll(child => child.props.accessibilityLabel === label, { deep: true }).length > 0);
}

beforeEach(() => {
  (useWindowDimensions as unknown as jest.Mock).mockReturnValue({ width: 1600, height: 900, scale: 2, fontScale: 1 });
  statusStore.reset();
  chatStore.clearAll();
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

test('the status page opens beside the conversation, which stays on screen, and closes back to it', async () => {
  const tree = await renderApp();
  await waitFor(() => labelsOf(tree).includes('Add attachment'));
  await openThreadActions(tree);
  await press(tree, 'Status');
  await waitFor(() => labelsOf(tree).includes('Close status'));

  // Both at once: the report's page and the conversation's composer.
  expect(labelsOf(tree)).toContain('Add attachment');
  expect(sentFrames()).toEqual(expect.arrayContaining([{ type: 'status.watch', threadId: THREAD }]));
  // In the pane beside the conversation, not a layer over the shell.
  expect(inPane(tree, 'Close status')).toBe(true);

  await press(tree, 'Close status');
  await waitFor(() => !labelsOf(tree).includes('Close status'));
  expect(labelsOf(tree)).toContain('Add attachment');
  await unmount(tree);
});

test('the instructions page opens beside the conversation too', async () => {
  const tree = await renderApp();
  await waitFor(() => labelsOf(tree).includes('Add attachment'));
  await openThreadActions(tree);
  await press(tree, 'Instructions');
  await waitFor(() => labelsOf(tree).includes('Close instructions'));
  expect(labelsOf(tree)).toContain('Add attachment');
  expect(inPane(tree, 'Close instructions')).toBe(true);
  expect(sentFrames()).toEqual(expect.arrayContaining([{ type: 'session.instructions.get', threadId: THREAD }]));

  await press(tree, 'Close instructions');
  await waitFor(() => !labelsOf(tree).includes('Close instructions'));
  await unmount(tree);
});

test('a report pushed while the page is beside the conversation lands in it', async () => {
  const tree = await renderApp();
  await waitFor(() => labelsOf(tree).includes('Add attachment'));
  await openThreadActions(tree);
  await press(tree, 'Status');
  await emit({
    type: 'status.result',
    threadId: THREAD,
    status: {
      session: { id: 's', createdAt: '2026-08-08T10:00:00.000Z', lastActiveAt: '2026-08-08T10:05:00.000Z', turns: 1 },
      model: { current: 'claude-opus-5', selfHosted: false, contextLimit: 512000, contextNotes: ['declared'], timeout: '120s (default)' },
      context: { estimated: 100, occupied: 51200, autoCompactOn: true, autoCompactThresholdPct: 80, autoCompactThresholdTokens: 409600 },
      usage: null,
      runtime: { runs: [], compacting: false, verbose: true, approvedTools: [] },
    },
  });
  await waitFor(() => textsOf(tree).some(text => text.includes('10.0%')));
  expect(textsOf(tree)).toContain('nothing has been called here yet.');
  await unmount(tree);
});
