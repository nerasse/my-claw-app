/**
 * @format
 *
 * Provider CRUD is four settings pages: the list, the models of one provider, the create/edit
 * form, and the env key page. The frames answer with whole snapshots (agents.config.result for
 * the provider, providers.env.result for the env names), so the tests drive the server the same
 * way the wire does and assert on what the pages then render.
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { chatStore } from '../src/core/chat';
import { agentsStore } from '../src/core/agents';
import { providersEnvStore } from '../src/core/providers';
import { deviceBridge } from '../src/core/nativeBridge';
import { labelsOf, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 'thread-providers';

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

function typeInto(tree: Tree, label: string, text: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    const input = tree.root.find(
      node => String(node.type) === 'TextInput' && node.props.accessibilityLabel === label,
    );
    input.props.onChangeText(text);
  });
}

function setSwitch(tree: Tree, label: string, value: boolean): Promise<void> {
  return ReactTestRenderer.act(async () => {
    const sw = tree.root.find(
      node => node.props.accessibilityLabel === label && typeof node.props.onValueChange === 'function',
    );
    sw.props.onValueChange(value);
  });
}

async function settleAndUnmount(tree: Tree): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 60));
  });
  await unmount(tree);
}

function sentFrames(): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls.map(
    ([frame]) => JSON.parse(String(frame)) as Record<string, unknown>,
  );
}

/** The Android layer calls the last registered handler and stops when it returns true. */
function backHandler(): { __handlers: Array<() => boolean>; exitApp: jest.Mock } {
  // eslint-disable-next-line @react-native/no-deep-imports -- the ios stub is what the barrel resolves to under jest
  const back = require('react-native/Libraries/Utilities/BackHandler.ios') as {
    default: { __handlers: Array<() => boolean>; exitApp: jest.Mock };
  };
  return back.default;
}

async function hardwareBack(): Promise<boolean> {
  const handlers = backHandler().__handlers;
  let handled = false;
  await ReactTestRenderer.act(async () => {
    handled = handlers[handlers.length - 1]!();
  });
  return handled;
}

function providersConfig(): Record<string, unknown> {
  return {
    type: 'agents.config.result',
    defaultModel: 'mimo',
    defaultEffort: '',
    effortLevels: ['low', 'medium', 'high'],
    fallback: '',
    providers: [
      {
        key: 'litellm',
        type: 'openai',
        discover: true,
        models: 2,
        baseUrl: 'https://litellm.test/v1',
        keyEnv: 'LITELLM_API_KEY',
        keyPresent: true,
      },
      {
        key: 'anthropic',
        type: 'claude-sdk',
        discover: true,
        models: 1,
        keyEnv: 'ANTHROPIC_API_KEY',
        keyPresent: false,
      },
    ],
    agents: [],
  };
}

function envResult(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'providers.env.result',
    names: ['LITELLM_API_KEY', 'GROQ_API_KEY'],
    present: ['LITELLM_API_KEY', 'GROQ_API_KEY', 'PATH'],
    usedBy: { litellm: 'LITELLM_API_KEY' },
    ...over,
  };
}

async function bootToProviders(): Promise<Tree> {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');
  await pressLabel(tree, 'Open providers');
  await emit(providersConfig());
  await waitFor(() => labelsOf(tree).includes('Open provider litellm'));
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  chatStore.clearAll();
  agentsStore.reset();
  providersEnvStore.reset();
  bridge.sendMessage.mockResolvedValue(true);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

test('creating a provider writes the env value in the same save and returns to the list', async () => {
  const tree = await bootToProviders();
  await emit(envResult({ names: ['LITELLM_API_KEY'], present: ['LITELLM_API_KEY'] }));

  await pressLabel(tree, 'New provider');
  await waitFor(() => labelsOf(tree).includes('Create provider'));

  await typeInto(tree, 'Provider key', 'groq');
  // The suggested env name is not set anywhere on the server: the value field appears so the
  // same Save can store it.
  await waitFor(() => labelsOf(tree).includes('Provider env value'));
  await typeInto(tree, 'Provider base url', 'https://api.groq.com/openai/v1');
  await typeInto(tree, 'Provider env value', 'sk-groq-secret');
  await setSwitch(tree, 'Provider discover', true);
  await pressLabel(tree, 'Create provider');

  await waitFor(
    () =>
      sentFrames().some(
        f =>
          f.type === 'providers.upsert' &&
          f.key === 'groq' &&
          f.baseUrl === 'https://api.groq.com/openai/v1' &&
          f.apiKeyEnv === 'GROQ_API_KEY' &&
          f.discover === true,
      ),
    60,
  );
  expect(sentFrames()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'providers.env.set', name: 'GROQ_API_KEY', value: 'sk-groq-secret' }),
    ]),
  );
  // Back on the list, where the new row shows after the server answers.
  await waitFor(() => labelsOf(tree).includes('New provider'), 60);
  expect(labelsOf(tree)).toContain('Open provider litellm');

  await settleAndUnmount(tree);
});

test('a name already set on the server is reused: no value field, no env.set frame', async () => {
  const tree = await bootToProviders();
  await emit(envResult());

  await pressLabel(tree, 'New provider');
  await waitFor(() => labelsOf(tree).includes('Create provider'));
  // "groq" suggests GROQ_API_KEY, which IS present on the server: reused, no value asked.
  await typeInto(tree, 'Provider key', 'groq');
  await waitFor(() => labelsOf(tree).includes('Provider env value'), 30).catch(() => {});
  expect(labelsOf(tree)).not.toContain('Provider env value');
  expect(textsOf(tree)).toEqual(
    expect.arrayContaining(['already set on the server · it will be reused, no value needed']),
  );
  await typeInto(tree, 'Provider base url', 'https://api.groq.com/openai/v1');
  await pressLabel(tree, 'Create provider');

  await waitFor(
    () => sentFrames().some(f => f.type === 'providers.upsert' && f.apiKeyEnv === 'GROQ_API_KEY'),
    60,
  );
  expect(sentFrames().some(f => f.type === 'providers.env.set')).toBe(false);

  await settleAndUnmount(tree);
});

test('the edit form sends the changed fields and a rename when the key changes', async () => {
  const tree = await bootToProviders();

  await pressLabel(tree, 'Open provider litellm');
  await waitFor(() => labelsOf(tree).includes('Edit provider'));
  await pressLabel(tree, 'Edit provider');
  await waitFor(() => labelsOf(tree).includes('Save provider'));

  // The form is seeded from the snapshot.
  expect(labelsOf(tree)).toContain('Provider key');
  await typeInto(tree, 'Provider key', 'llm-gateway');
  await typeInto(tree, 'Provider group', 'LiteLLM');

  const before = sentFrames().length;
  await pressLabel(tree, 'Save provider');
  await waitFor(() => sentFrames().length > before, 60);
  expect(sentFrames()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'providers.rename', from: 'litellm', to: 'llm-gateway' }),
      expect.objectContaining({ type: 'providers.upsert', key: 'llm-gateway', group: 'LiteLLM' }),
    ]),
  );
  // The server answers with the snapshot it stored: the models page of the renamed key opens.
  await emit({ ...providersConfig(), providers: [{ ...(providersConfig().providers as Array<Record<string, unknown>>)[0], key: 'llm-gateway' }] });
  await waitFor(() => labelsOf(tree).includes('Edit provider'), 60);

  await settleAndUnmount(tree);
});

test('deleting offers the two-step confirm, and the key removal is its own explicit option', async () => {
  const tree = await bootToProviders();

  await pressLabel(tree, 'Open provider litellm');
  await waitFor(() => labelsOf(tree).includes('Edit provider'));
  await pressLabel(tree, 'Edit provider');
  await waitFor(() => labelsOf(tree).includes('Delete provider'));

  await pressLabel(tree, 'Delete provider');
  await waitFor(() => labelsOf(tree).includes('Delete and remove its key from .env'));
  // The plain delete leaves the variable in .env.
  await pressLabel(tree, 'Delete');
  await waitFor(() => sentFrames().some(f => f.type === 'providers.remove' && f.key === 'litellm'), 60);
  expect(sentFrames().some(f => f.type === 'providers.env.remove')).toBe(false);
  await waitFor(() => labelsOf(tree).includes('New provider'), 60);

  await settleAndUnmount(tree);
});

test('the env page renames the variable and binds the provider onto another', async () => {
  const tree = await bootToProviders();
  await emit(envResult());
  await pressLabel(tree, 'Open provider litellm');
  await waitFor(() => labelsOf(tree).includes('Edit provider'));
  await pressLabel(tree, 'Edit provider');
  await waitFor(() => labelsOf(tree).includes('Open environment settings'));
  await pressLabel(tree, 'Open environment settings');
  await waitFor(() => labelsOf(tree).includes('Rename the variable'));

  // The current binding is shown with its live status.
  expect(textsOf(tree)).toEqual(expect.arrayContaining(['LITELLM_API_KEY']));

  await typeInto(tree, 'Rename the env variable', 'LLM_KEY');
  await pressLabel(tree, 'Rename the variable');
  await waitFor(
    () => sentFrames().some(f => f.type === 'providers.env.rename' && f.from === 'LITELLM_API_KEY' && f.to === 'LLM_KEY'),
    60,
  );
  // The server answers the env list after the rename, which is also what clears the busy flag.
  await emit(envResult());

  // Bind onto an existing variable: a providers.upsert carrying only the new key env.
  await pressLabel(tree, 'Bind to GROQ_API_KEY');
  await waitFor(
    () =>
      sentFrames().some(
        f => f.type === 'providers.upsert' && f.key === 'litellm' && f.apiKeyEnv === 'GROQ_API_KEY',
      ),
    60,
  );
  await emit(envResult());

  // And the unbind is its own explicit row.
  await pressLabel(tree, 'Stop using the env variable');
  await waitFor(
    () =>
      sentFrames().some(
        f => f.type === 'providers.upsert' && f.key === 'litellm' && f.apiKeyEnv === '',
      ),
    60,
  );

  await settleAndUnmount(tree);
});

test('back walks env, edit, models, list, index, chat', async () => {
  const tree = await bootToProviders();
  await emit(envResult());
  await pressLabel(tree, 'Open provider litellm');
  await waitFor(() => labelsOf(tree).includes('Edit provider'));
  await pressLabel(tree, 'Edit provider');
  await waitFor(() => labelsOf(tree).includes('Open environment settings'));
  await pressLabel(tree, 'Open environment settings');
  await waitFor(() => labelsOf(tree).includes('Rename the variable'));

  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Save provider'));
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Edit provider'));
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Open provider litellm'));
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Open providers'));
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Message to send'));
  expect(backHandler().exitApp).not.toHaveBeenCalled();

  await settleAndUnmount(tree);
});
