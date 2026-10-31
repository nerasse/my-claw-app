/**
 * @format
 *
 * The switch lives in the conversation actions, which both the drawer row and the chat header open.
 * The header's copy read the store through the drawer's own selection, which is null there, and
 * had no listing row to fall back on -- so it drew "off" forever and a tap sent `enabled: true`
 * again. The owner's report: "quand je clique dessus, ça reste sur off".
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { quotaRetryStore } from '../src/core/quota';
import { labelsOf, press, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 'thread-quota-retry';
const OTHER = 'thread-other';

function sentFrames(): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls.map(([frame]) => JSON.parse(String(frame)) as Record<string, unknown>);
}

async function emit(frame: Record<string, unknown>): Promise<void> {
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

/**
 * The row's hint is the state: "off", "on · waits for the provider reset", or "waiting · …".
 *
 * The shell mounts the drawer and the chat side by side, and both compose the same conversation
 * actions, so one state can be on screen twice: what matters is that every copy agrees.
 */
function switchHints(tree: Tree): Set<string> {
  return new Set(
    textsOf(tree).filter(text => text === 'off' || text.startsWith('on · waits') || text.startsWith('waiting · retry')),
  );
}

describe('the quota-retry switch in the chat menu', () => {
  beforeEach(() => {
    chatStore.clearAll();
    bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
  });
  afterEach(() => quotaRetryStore.reset());

  async function openChatMenu(tree: Tree): Promise<void> {
    await waitFor(() => labelsOf(tree).includes('Commands'));
    await press(tree, 'Commands');
    await waitFor(() => labelsOf(tree).includes('Retry when the quota returns'));
  }

  it('draws the state the server pushed, on a conversation the listing never flagged', async () => {
    const tree = await renderApp();
    await ReactTestRenderer.act(async () => chatStore.addUserMessage(THREAD, 'u1', 'hello', []));
    await waitFor(() => labelsOf(tree).includes('Commands'));
    await openChatMenu(tree);

    expect(switchHints(tree)).toEqual(new Set(['off']));

    await emit({ type: 'session.quotaRetry.state', threadId: THREAD, enabled: true });
    expect(switchHints(tree)).toEqual(new Set(['on · waits for the provider reset']));

    // And the wait the server armed, which is the other half of the same row.
    await emit({
      type: 'session.quotaRetry.state',
      threadId: THREAD,
      enabled: true,
      waiting: { at: '2026-11-01T00:00:00.000Z', attempts: 1, windows: ['Week'] },
    });
    expect([...switchHints(tree)][0]).toMatch(/^waiting · retry at /);
    await unmount(tree);
  });

  it('turns this conversation off on a second press, never on again', async () => {
    const tree = await renderApp();
    await ReactTestRenderer.act(async () => chatStore.addUserMessage(THREAD, 'u1', 'hello', []));
    await waitFor(() => labelsOf(tree).includes('Commands'));
    await openChatMenu(tree);

    // Another conversation is on: the menu must not borrow its switch.
    await emit({ type: 'session.quotaRetry.state', threadId: OTHER, enabled: true });
    expect(switchHints(tree)).toEqual(new Set(['off']));

    await press(tree, 'Retry when the quota returns');
    // The server's answer, which is what the row has to follow -- and the menu closed on the press.
    await emit({ type: 'session.quotaRetry.state', threadId: THREAD, enabled: true });
    await openChatMenu(tree);
    await press(tree, 'Retry when the quota returns');

    const sent = sentFrames().filter(frame => frame.type === 'session.quotaRetry.set');
    expect(sent).toEqual([
      { type: 'session.quotaRetry.set', threadId: THREAD, enabled: true },
      { type: 'session.quotaRetry.set', threadId: THREAD, enabled: false },
    ]);
    await unmount(tree);
  });
});
