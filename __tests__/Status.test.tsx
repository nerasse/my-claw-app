/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import { chatStore } from '../src/core/chat';
import { statusStore } from '../src/core/status';
import type { StatusPayload } from '../src/core/protocol';
import {
  labelsOf,
  press,
  renderApp,
  textsOf,
  unmount,
  waitFor,
  type Tree,
} from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 'thread-status';

const PAYLOAD: StatusPayload = {
  session: {
    id: 'my-claw-app/dm/dev/thread-status',
    platform: 'my-claw-app',
    chatType: 'dm',
    createdAt: '2026-08-08T10:00:00.000Z',
    lastActiveAt: '2026-08-08T10:05:00.000Z',
    messages: 3,
  },
  model: {
    current: 'claude-opus-5',
    selfHosted: false,
    contextLimit: 512000,
    contextNotes: ['declared', 'capped from 1,000,000'],
  },
  context: {
    measured: { tokens: 12345, pctOfLimit: 2.4 },
    estimated: 60000,
    occupied: 70000,
    autoCompactOn: true,
    autoCompactThresholdPct: 80,
    autoCompactThresholdTokens: 409600,
  },
  conversation: { calls: 1, promptTokens: 12345, cacheReadTokens: 0, completionTokens: 10 },
  analytics: {
    calls: 4,
    errors: 0,
    durationMs: 4000,
    billedUsd: 2,
    referenceUsd: 5,
    unpriced: 0,
    rows: [
      {
        model: 'anthropic/claude-opus-5',
        calls: 4,
        promptTokens: 1000,
        cacheReadTokens: 0,
        completionTokens: 100,
        costUsd: 2,
        costBilled: true,
        costApproximate: false,
      },
    ],
  },
  delegated: null,
  runtime: { activeRun: 'none', verbose: true, approvedTools: ['bash'] },
};

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function sentFrames(): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls.map(
    ([frame]) => JSON.parse(String(frame)) as Record<string, unknown>,
  );
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
  return press(tree, label);
}

/** Opens the drawer and the per-conversation menu (Rename / Status / Archive). */
async function openThreadMenu(tree: Tree): Promise<void> {
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await waitFor(() => labelsOf(tree).some(label => label.startsWith('Actions for conversation')));
  const label = labelsOf(tree).find(entry => entry.startsWith('Actions for conversation'))!;
  await pressLabel(tree, label);
}

beforeEach(() => {
  statusStore.reset();
  chatStore.clearAll();
});

/** The four actions a conversation carries, in the order both menus must show them. */
const CONVERSATION_ACTIONS = ['Rename…', 'Status', 'Archive', 'Delete'];

/** Labels appear once per rendered node, so the order is read from the first sighting of each. */
function actionOrder(tree: Tree): string[] {
  const seen: string[] = [];
  for (const label of labelsOf(tree)) {
    if (CONVERSATION_ACTIONS.includes(label) && !seen.includes(label)) seen.push(label);
  }
  return seen;
}

test('the drawer menu carries the conversation actions, status between rename and archive', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);

  expect(actionOrder(tree)).toEqual(CONVERSATION_ACTIONS);

  await pressLabel(tree, 'Status');
  await waitFor(() => labelsOf(tree).includes('Close status'));
  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'status.get', threadId: THREAD })]),
  );

  await unmount(tree);
});

test('the header menu answers the same list, in the same order', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Conversation Infra maison');
  await pressLabel(tree, 'Commands');

  // Model leads (only the conversation on screen knows its own), then the shared list.
  expect(labelsOf(tree)).toContain('Model…');
  expect(actionOrder(tree)).toEqual(CONVERSATION_ACTIONS);

  await pressLabel(tree, 'Status');
  await waitFor(() => labelsOf(tree).includes('Close status'));
  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'status.get', threadId: THREAD })]),
  );

  await unmount(tree);
});

test('deleting from the drawer asks first, like the header always did', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);
  await pressLabel(tree, 'Delete');

  // The first tap opens the confirmation, it does not delete.
  await waitFor(() => textsOf(tree).some(text => text.includes('Delete')));
  expect(sentFrames().some(frame => frame.type === 'session.delete')).toBe(false);

  await pressLabel(tree, 'Delete');
  await waitFor(() => sentFrames().some(frame => frame.type === 'session.delete'));

  await unmount(tree);
});

async function openReport(tree: Tree): Promise<void> {
  await openThreadMenu(tree);
  await pressLabel(tree, 'Status');
  await emit({
    type: 'status.result',
    threadId: THREAD,
    text: '**Session**\n  platform      my-claw-app - dm',
    status: PAYLOAD,
  });
  await waitFor(() => textsOf(tree).some(text => text.includes('claude-opus-5')));
}

test('the status page leads with context, tokens and cost', async () => {
  const tree = await renderApp();
  await openReport(tree);

  const texts = textsOf(tree).join('\n');
  expect(texts).toContain('claude-opus-5');
  expect(texts).toContain('context');
  // 70k occupied of a 512k window, and the auto-compact line that explains the meter.
  expect(texts).toContain('70k');
  expect(texts).toContain('/ 512k');
  expect(texts).toContain('13.7%');
  expect(texts).toContain('auto-compact at 80% · 410k');
  expect(texts).toContain('measured 12k · estimated 60k');
  expect(texts).toContain('tokens in');
  expect(texts).toContain('tokens out');
  expect(texts).toContain('cost · 90 days');
  expect(texts).toContain('$2.00');
  expect(texts).toContain('$5.00 reference');
  expect(texts).toContain('my-claw-app · dm');

  await unmount(tree);
});

test('a conversation is a thread here, so no counter is labelled "since /new"', async () => {
  const tree = await renderApp();
  await openReport(tree);

  expect(textsOf(tree).join('\n')).not.toContain('/new');

  await unmount(tree);
});

test('the raw text and the ids stay folded until asked for', async () => {
  const tree = await renderApp();
  await openReport(tree);

  // Both folds are shut on arrival: the page is the report, not a text dump.
  expect(textsOf(tree).join('\n')).not.toContain('**Session**');
  expect(textsOf(tree).join('\n')).not.toContain('my-claw-app/dm/dev/thread-status');
  expect(labelsOf(tree)).toContain('raw output');
  expect(labelsOf(tree)).toContain('details');

  await pressLabel(tree, 'raw output');
  expect(textsOf(tree).join('\n')).toContain('**Session**');

  await pressLabel(tree, 'details');
  const opened = textsOf(tree).join('\n');
  expect(opened).toContain('my-claw-app/dm/dev/thread-status');
  expect(opened).toContain('512k · declared, capped from 1,000,000');
  expect(opened).toContain('bash');

  await unmount(tree);
});

test('a run in flight is called out above the cards', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);
  await pressLabel(tree, 'Status');
  await emit({
    type: 'status.result',
    threadId: THREAD,
    text: 'report',
    status: { ...PAYLOAD, runtime: { ...PAYLOAD.runtime, activeRun: 'main' } },
  });

  await waitFor(() => textsOf(tree).some(text => text.includes('running · main')));

  await unmount(tree);
});

test('a typed /status answers with the page, never a bubble in the conversation', async () => {
  const tree = await renderApp();
  await emit({
    type: 'chat.command.result',
    threadId: THREAD,
    text: '**Session**',
    status: PAYLOAD,
  });

  await waitFor(() => labelsOf(tree).includes('Close status'));
  expect(chatStore.getItems(THREAD).length).toBe(0);

  await unmount(tree);
});

test('a command result without a status payload still renders as a bubble', async () => {
  const tree = await renderApp();
  await emit({
    type: 'chat.command.result',
    threadId: THREAD,
    replyToId: 'r1',
    text: 'Stopped.',
  });

  await waitFor(() => chatStore.getItems(THREAD).length > 0);
  expect(chatStore.getItems(THREAD).some(item => item.kind === 'text' && item.command)).toBe(true);
  expect(labelsOf(tree)).not.toContain('Close status');

  await unmount(tree);
});

test('the back key closes the status page and stops there', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);
  await pressLabel(tree, 'Status');
  await waitFor(() => labelsOf(tree).includes('Close status'));

  // The Android layer calls the last registered handler and stops when it returns true.
  // eslint-disable-next-line @react-native/no-deep-imports -- the ios stub is what the barrel resolves to under jest
  const back = require('react-native/Libraries/Utilities/BackHandler.ios') as {
    default: { __handlers: Array<() => boolean>; exitApp: jest.Mock };
  };
  const handlers = back.default.__handlers;

  let handled = false;
  await ReactTestRenderer.act(async () => {
    handled = handlers[handlers.length - 1]();
  });

  expect(handled).toBe(true);
  await waitFor(() => !labelsOf(tree).includes('Close status'));
  // What was underneath survives: the drawer that hosted the menu is still there.
  expect(labelsOf(tree)).toContain('Search conversations');
  expect(back.default.exitApp).not.toHaveBeenCalled();
  await unmount(tree);
});

test('a refused status.get shows on the page instead of spinning', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);
  await pressLabel(tree, 'Status');
  await emit({ type: 'error', scope: 'status', message: 'status unavailable' });

  await waitFor(() => textsOf(tree).includes('status unavailable'));

  await unmount(tree);
});

test('a late status.result does not reopen a closed page', async () => {
  const tree = await renderApp();
  await emit({ type: 'status.result', threadId: THREAD, text: '**Session**', status: PAYLOAD });

  expect(labelsOf(tree)).not.toContain('Close status');

  await unmount(tree);
});
