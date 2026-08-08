/**
 * @format
 *
 * What the back key does once the user has walked into settings. Every screen reached from
 * settings must come back to settings: the model picker used to close settings on its way in,
 * so backing out of it landed on the chat, and the next press had nothing left to close and
 * quit the app.
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { labelsOf, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const KEPT = 'thread-kept';

/** The Android layer calls the last registered handler and stops when it returns true. */
function backHandler(): { __handlers: Array<() => boolean>; exitApp: jest.Mock } {
  // eslint-disable-next-line @react-native/no-deep-imports -- the ios stub is what the barrel resolves to under jest
  const back = require('react-native/Libraries/Utilities/BackHandler.ios') as {
    default: { __handlers: Array<() => boolean>; exitApp: jest.Mock };
  };
  return back.default;
}

/** True when the press was handled: false is what makes Android close the app. */
async function hardwareBack(): Promise<boolean> {
  const handlers = backHandler().__handlers;
  let handled = false;
  await ReactTestRenderer.act(async () => {
    handled = handlers[handlers.length - 1]!();
  });
  return handled;
}

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

async function openSettings(tree: Tree): Promise<void> {
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');
}

/** The server answers the Agents page with at least the defaults row usable. */
function agentsConfig(): Record<string, unknown> {
  return {
    type: 'agents.config.result',
    defaultModel: 'fast-1',
    defaultEffort: '',
    effortLevels: ['low', 'medium', 'high'],
    providers: [],
    agents: [
      {
        key: 'orchestrator',
        label: 'Orchestrator',
        description: 'The agent you talk to',
        model: 'fast-1',
        pinned: false,
        inheritsFrom: 'global',
      },
    ],
  };
}

async function boot(): Promise<Tree> {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(KEPT, 'Infra maison')] });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  chatStore.clearAll();
  bridge.sendMessage.mockResolvedValue(true);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: KEPT });
});

test('the model picker opened from settings comes back to settings, not to the exit', async () => {
  const tree = await boot();
  await openSettings(tree);
  await pressLabel(tree, 'Open agents');
  await emit(agentsConfig());
  await emit({
    type: 'model.list.result',
    models: [{ id: 'fast-1', label: 'Fast' }],
    defaultModel: 'fast-1',
  });

  await waitFor(() => labelsOf(tree).includes('Default model'));
  await pressLabel(tree, 'Default model');
  await waitFor(() => labelsOf(tree).includes('Fast'));

  // Back closes the sheet and puts the settings page back on screen: the screen that opened
  // it is the screen it must return to.
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Default model'));
  expect(labelsOf(tree)).not.toContain('Fast');

  // Then back walks Agents to the index, and the index to the conversation, never the launcher.
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Open general'));
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Open conversations'));
  expect(backHandler().exitApp).not.toHaveBeenCalled();

  await settleAndUnmount(tree);
});

test('back walks out of a model group before it closes the picker', async () => {
  const tree = await boot();
  await openSettings(tree);
  await pressLabel(tree, 'Open agents');
  await emit(agentsConfig());
  await emit({
    type: 'model.list.result',
    models: [
      { id: 'fast-1', label: 'Fast' },
      { id: 'opus', label: 'Opus', group: 'Claude' },
    ],
    defaultModel: 'fast-1',
  });

  await waitFor(() => labelsOf(tree).includes('Default model'));
  await pressLabel(tree, 'Default model');
  await waitFor(() => labelsOf(tree).includes('Claude ›'));
  await pressLabel(tree, 'Claude ›');
  await waitFor(() => labelsOf(tree).includes('Opus'));

  // One level out: the group's models go, the picker itself stays open.
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Claude ›'));
  expect(labelsOf(tree)).not.toContain('Opus');

  // Only then does back close the sheet, back onto settings.
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Default model'));

  await settleAndUnmount(tree);
});

test('the picker reopens at its root after a group was browsed', async () => {
  const tree = await boot();
  await openSettings(tree);
  await pressLabel(tree, 'Open agents');
  await emit(agentsConfig());
  await emit({
    type: 'model.list.result',
    models: [
      { id: 'fast-1', label: 'Fast' },
      { id: 'opus', label: 'Opus', group: 'Claude' },
    ],
    defaultModel: 'fast-1',
  });

  await waitFor(() => labelsOf(tree).includes('Default model'));
  await pressLabel(tree, 'Default model');
  await waitFor(() => labelsOf(tree).includes('Claude ›'));
  await pressLabel(tree, 'Claude ›');
  await waitFor(() => labelsOf(tree).includes('Opus'));
  await pressLabel(tree, 'Close menu');

  await waitFor(() => labelsOf(tree).includes('Default model'));
  await pressLabel(tree, 'Default model');
  await waitFor(() => labelsOf(tree).includes('Claude ›'));

  await settleAndUnmount(tree);
});

test('diagnostics is a page under Other: back walks diagnostics, Other, index', async () => {
  const tree = await boot();
  await openSettings(tree);
  await pressLabel(tree, 'Open other');
  await waitFor(() => labelsOf(tree).includes('Open diagnostics'));
  await pressLabel(tree, 'Open diagnostics');
  await waitFor(() => labelsOf(tree).includes('Back to other'));

  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Open diagnostics'));

  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Open general'));

  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Open conversations'));
  expect(backHandler().exitApp).not.toHaveBeenCalled();

  await settleAndUnmount(tree);
});

test('empty categories open their page and back out to the index', async () => {
  const tree = await boot();
  await openSettings(tree);

  await pressLabel(tree, 'Open tools');
  await waitFor(() => textsOf(tree).includes('no tools found'));
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Open general'));

  await pressLabel(tree, 'Open MCPs');
  await waitFor(() => textsOf(tree).includes('no servers declared'));
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Open general'));

  await pressLabel(tree, 'Open config');
  await waitFor(() => textsOf(tree).includes('loading...'));
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Open general'));

  await pressLabel(tree, 'Open other');
  await waitFor(() => labelsOf(tree).includes('Theme System'));
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Open general'));

  await settleAndUnmount(tree);
});

test('only the conversation screen lets a back press fall through to Android', async () => {
  const tree = await boot();
  await openSettings(tree);

  // Settings handles it, the chat screen below does not: that last false is what Android
  // turns into "close the app", and it must only ever happen at the root.
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Open conversations'));
  expect(await hardwareBack()).toBe(false);

  await settleAndUnmount(tree);
});
