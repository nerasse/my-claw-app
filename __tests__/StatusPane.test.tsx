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
import { rightPane } from '../src/core/rightPane';
import { statusStore } from '../src/core/status';
import { labelsOf, press, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

// Auto-mocked so the test states the window it is talking about.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions');
// The browser router, which is the only place this regression exists: `route.ts` (Android) has no
// address, so `initialRoute()` answers null there and the boot replay below has nothing to reopen.
// An address that already names the thread on screen is exactly what `showThread` leaves behind.
jest.mock('../src/core/route', () => ({
  initialRoute: () => ({ threadId: 't-default' }),
  showThread: () => {},
  watchBack: () => () => {},
}));

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

/**
 * A phone has no column to share, so the page takes the conversation's place. It used to open
 * and close 19 ms later (owner, 2026-11-16: "la page status ne fonctionne plus sur mobile").
 *
 * The cause was an identity, not a phone: `enterThread` read `filesOpen`/`statusOpen`/
 * `instructionsPageOpen` from the render, so opening a page rebuilt `openThread`, the boot effect
 * that lists `openThread` among its dependencies replayed, re-read the address -- the thread
 * being on screen already -- and called `openThread` again, which closed the column. It is the
 * `rightPane.get().page` read that breaks the loop, and it is what this test holds.
 */
test('the page stays open on a phone, where nothing else is drawn to take the tap', async () => {
  (useWindowDimensions as unknown as jest.Mock).mockReturnValue({ width: 400, height: 900, scale: 2, fontScale: 1 });
  rightPane.reset();
  const tree = await renderApp();
  try {
    await waitFor(() => labelsOf(tree).includes('Add attachment'));
    await openThreadActions(tree);
    await press(tree, 'Status');
    await waitFor(() => labelsOf(tree).includes('Close status'));
    // A full turn of the loop is milliseconds; the report itself is the proof it survived them.
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
    expect(rightPane.get().page).toBe('status');
  } finally {
    rightPane.reset();
    await unmount(tree);
  }
});
