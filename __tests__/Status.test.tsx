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
  runtime: { activeRun: 'none', verbose: true, approvedTools: ['bash'], sdkSessionId: 'sdk-1' },
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

test('the conversation menu opens the status page, between rename and archive', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);

  const labels = labelsOf(tree);
  expect(labels).toContain('Rename');
  expect(labels).toContain('Status');
  expect(labels).toContain('Archive');
  expect(labels.indexOf('Status')).toBeGreaterThan(labels.indexOf('Rename'));
  expect(labels.indexOf('Archive')).toBeGreaterThan(labels.indexOf('Status'));

  await pressLabel(tree, 'Status');
  await waitFor(() => labelsOf(tree).includes('Close status'));
  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'status.get', threadId: THREAD })]),
  );

  await unmount(tree);
});

test('the status page renders the report as cards', async () => {
  const tree = await renderApp();
  await openThreadMenu(tree);
  await pressLabel(tree, 'Status');
  await emit({
    type: 'status.result',
    threadId: THREAD,
    text: '**Session**\n  platform      my-claw-app - dm',
    status: PAYLOAD,
  });

  await waitFor(() => textsOf(tree).some(text => text.includes('claude-opus-5')));
  const texts = textsOf(tree).join('\n');
  expect(texts).toContain('my-claw-app · dm');
  expect(texts).toContain('messages');
  expect(texts).toContain('context limit');
  expect(texts).toContain('512k · declared, capped from 1,000,000');
  expect(texts).toContain('12k on the last call');
  expect(texts).toContain('measured');
  expect(texts).toContain('occupied');
  expect(texts).toContain('auto-compact');
  expect(texts).toContain('on, threshold 80% = 410k');
  expect(texts).toContain('analytics · 90 d');
  expect(texts).toContain('$2.00');
  expect(texts).toContain('reference');
  expect(texts).toContain('runtime');
  expect(texts).toContain('active run');
  expect(texts).toContain('bash');
  // The plain-text form of the same report is kept at the bottom of the page.
  expect(texts).toContain('text output');

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
