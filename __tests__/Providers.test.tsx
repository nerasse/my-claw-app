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
  await pressLabel(tree, 'Open models');
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

test('the provider pages ask for the snapshot themselves, with no detour through Agents', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');

  // The index counts the providers for its setup banner, from that same snapshot: it asks on entry.
  await waitFor(() => sentFrames().some(f => f.type === 'agents.config.get'));
  await emit(providersConfig());
  const asked = sentFrames().filter(f => f.type === 'agents.config.get').length;

  // And the list asks again on entry: config.llm.providers hot-reloads under it. Without this
  // request, reaching Providers from the index (instead of through the Agents page, which was
  // the only asker) rendered "0 configured" over an empty list.
  await pressLabel(tree, 'Open models');
  await waitFor(() => sentFrames().filter(f => f.type === 'agents.config.get').length > asked);
  await waitFor(() => labelsOf(tree).includes('Open provider litellm'));

  await settleAndUnmount(tree);
});

test('creating a provider writes the env value in the same save and returns to the list', async () => {
  const tree = await bootToProviders();
  await emit(envResult({ names: ['LITELLM_API_KEY'], present: ['LITELLM_API_KEY'] }));

  await pressLabel(tree, 'New provider');
  // The + offers the plans first; the form is "Custom".
  await pressLabel(tree, 'Custom');
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
  // The + offers the plans first; the form is "Custom".
  await pressLabel(tree, 'Custom');
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

test('a second account of a service: the preset numbers its key and its variable, a taken key cannot be saved', async () => {
  const tree = await bootToProviders();
  await emit(envResult());
  await pressLabel(tree, 'New provider');
  await pressLabel(tree, 'Custom');
  await waitFor(() => labelsOf(tree).includes('Create provider'));
  const field = (label: string) =>
    tree.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onChangeText === 'function').props.value;

  // A first OpenRouter account takes the preset as it is.
  await pressLabel(tree, 'Preset OpenRouter');
  expect(field('Provider key')).toBe('openrouter');
  expect(field('Provider env name')).toBe('OPENROUTER_API_KEY');

  // "litellm" is declared: saving it from here would overwrite that provider.
  await typeInto(tree, 'Provider key', 'litellm');
  expect(textsOf(tree)).toContain('a provider with this key already exists · pick another');
  const save = () => tree.root.find(node => node.props.accessibilityLabel === 'Create provider' && node.props.accessibilityState);
  expect(save().props.accessibilityState).toEqual({ disabled: true });
  await typeInto(tree, 'Provider key', 'openrouter');
  expect(save().props.accessibilityState).toEqual({ disabled: false });
  await settleAndUnmount(tree);

  // With an OpenRouter account there, the preset is a second one: its own key, its own variable,
  // so its key is asked for instead of reusing the first account's.
  const second = await bootToProviders();
  const config = providersConfig() as { providers: Array<Record<string, unknown>> };
  config.providers.push({ key: 'openrouter', type: 'openai', discover: true, models: 3, baseUrl: 'https://openrouter.ai/api/v1', keyEnv: 'OPENROUTER_API_KEY', keyPresent: true });
  await emit(config);
  await emit(envResult({ names: ['LITELLM_API_KEY', 'OPENROUTER_API_KEY'], present: ['LITELLM_API_KEY', 'OPENROUTER_API_KEY'] }));
  await pressLabel(second, 'New provider');
  await pressLabel(second, 'Custom');
  await waitFor(() => labelsOf(second).includes('Create provider'));
  await pressLabel(second, 'Preset OpenRouter');
  const field2 = (label: string) =>
    second.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onChangeText === 'function').props.value;
  expect(field2('Provider key')).toBe('openrouter2');
  expect(field2('Provider env name')).toBe('OPENROUTER2_API_KEY');
  await waitFor(() => labelsOf(second).includes('Provider env value'));
  await settleAndUnmount(second);
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

test('the provider model list searches, and back clears the search first', async () => {
  const tree = await bootToProviders();
  const config = providersConfig();
  // Enough models to earn the search row (same threshold as the model picker).
  const many = Array.from({ length: 14 }, (_, i) => ({
    id: `provider-${i < 10 ? `0${i}` : i}`,
    label: `Provider ${i < 10 ? `0${i}` : i}`,
    provider: 'litellm',
  }));
  await emit({
    type: 'model.list.result',
    models: many,
    defaultModel: (config.providers as Array<Record<string, unknown>>)[0].key,
  });
  await emit({ ...config, providers: [{ ...(config.providers as Array<Record<string, unknown>>)[0], models: 14 }] });
  await pressLabel(tree, 'Open provider litellm');
  await waitFor(() => labelsOf(tree).includes('Search models'));

  // A short query narrows the list; the others are gone.
  await typeInto(tree, 'Search models', 'provider 05');
  await waitFor(() => labelsOf(tree).some(label => label.includes('Provider 05')));
  expect(labelsOf(tree).some(label => label.includes('Provider 00'))).toBe(false);

  // The hardware back key clears the search instead of leaving the page.
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).some(label => label.includes('Provider 00')));
  expect(labelsOf(tree)).toContain('Edit provider');

  // With no match, the empty state says so.
  await typeInto(tree, 'Search models', 'nothing matches this');
  await waitFor(() => textsOf(tree).some(text => text.includes('no model matches the search')));

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
  await waitFor(() => labelsOf(tree).includes('Open models'));
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('Message to send'));
  expect(backHandler().exitApp).not.toHaveBeenCalled();

  await settleAndUnmount(tree);
});

test('the refresh button asks the server to discover, and the answer is reported in place', async () => {
  const tree = await bootToProviders();
  bridge.sendMessage.mockClear();

  await pressLabel(tree, 'Refresh the model discovery');

  expect(bridge.sendMessage.mock.calls.map(([frame]) => String(frame))).toContain(
    JSON.stringify({ type: 'model.refresh' }),
  );
  // While it runs the button says so, and it cannot be pressed twice into two discoveries.
  await waitFor(() => labelsOf(tree).includes('Discovering models'));
  expect(textsOf(tree)).toContain('asking every provider that discovers...');

  await emit({ type: 'model.refresh.result', models: 412, failed: [], enabled: true });

  await waitFor(() => textsOf(tree).includes('412 models in the catalogue'));
  expect(labelsOf(tree)).toContain('Refresh the model discovery');
  await settleAndUnmount(tree);
});

test('a provider that did not answer is named, because its models are only the last known ones', async () => {
  const tree = await bootToProviders();
  await pressLabel(tree, 'Refresh the model discovery');

  await emit({ type: 'model.refresh.result', models: 12, failed: ['groq', 'openrouter'], enabled: true });

  await waitFor(() => textsOf(tree).includes('12 models in the catalogue'));
  expect(textsOf(tree)).toContain('no answer from groq, openrouter · their models are the last known ones');
  await settleAndUnmount(tree);
});

test('a server that refuses the refresh stops the spinner and says why', async () => {
  const tree = await bootToProviders();
  await pressLabel(tree, 'Refresh the model discovery');
  await waitFor(() => labelsOf(tree).includes('Discovering models'));

  await emit({ type: 'error', scope: 'model', message: 'model discovery unavailable' });

  await waitFor(() => labelsOf(tree).includes('Refresh the model discovery'));
  expect(textsOf(tree)).toContain('discovery failed · model discovery unavailable');
  await settleAndUnmount(tree);
});

test('the button is on the provider page too, where the models are actually read', async () => {
  const tree = await bootToProviders();
  await pressLabel(tree, 'Open provider litellm');
  await waitFor(() => labelsOf(tree).includes('Edit provider'));

  expect(labelsOf(tree)).toContain('Refresh the model discovery');
  await settleAndUnmount(tree);
});

/**
 * Declarations are the hand-written half of the catalogue. They used to be JSON nobody could see
 * from the app, which is how three entries survived their gateway renaming its whole catalogue:
 * the picker filtered them out for being stale, correctly, and a filtered list cannot say what it
 * removed. So the management view shows them, badged, and deleting one is a tap.
 */
test('a stale declaration is shown with its reason, and deleting it is one tap', async () => {
  const tree = await bootToProviders();
  await emit({
    type: 'model.list.result',
    models: [{ id: 'litellm/alive', label: 'Alive', provider: 'litellm' }],
    defaultModel: 'litellm/alive',
    unavailable: [
      {
        id: 'litellm/gone',
        label: 'Gone',
        provider: 'litellm',
        declared: true,
        state: 'stale',
        reason: 'litellm no longer lists it',
      },
    ],
  });
  await pressLabel(tree, 'Open provider litellm');
  await waitFor(() => labelsOf(tree).includes('Edit provider'));

  // Shown, with the server's own words, and never in the list a picker reads.
  expect(textsOf(tree)).toContain('litellm no longer lists it');
  expect(textsOf(tree)).toContain('not runnable (1)');

  await pressLabel(tree, 'Gone, unavailable: litellm no longer lists it');
  await waitFor(() => labelsOf(tree).includes('Delete model'));
  await pressLabel(tree, 'Delete model');

  await waitFor(() => sentFrames().some(f => f.type === 'models.remove'));
  expect(sentFrames().find(f => f.type === 'models.remove')).toEqual({
    type: 'models.remove',
    id: 'litellm/gone',
  });
  await settleAndUnmount(tree);
});

test('declaring a model sends only the fields that were filled in', async () => {
  const tree = await bootToProviders();
  await emit({
    type: 'model.list.result',
    models: [{ id: 'litellm/alive', label: 'Alive', provider: 'litellm' }],
    defaultModel: 'litellm/alive',
    unavailable: [],
  });
  await pressLabel(tree, 'Open provider litellm');
  await waitFor(() => labelsOf(tree).includes('Edit provider'));

  await pressLabel(tree, 'Add a model');
  await waitFor(() => labelsOf(tree).includes('Create model'));
  await typeInto(tree, 'Model id', 'litellm/zai-glm-5-2');
  await typeInto(tree, 'Context window', '200000');
  await pressLabel(tree, 'Create model');

  await waitFor(() => sentFrames().some(f => f.type === 'models.upsert'));
  // Nothing else travels: the server merges over discovery field by field, so an absent field
  // keeps following the provider instead of freezing a copy of it.
  expect(sentFrames().find(f => f.type === 'models.upsert')).toEqual({
    type: 'models.upsert',
    id: 'litellm/zai-glm-5-2',
    provider: 'litellm',
    context: 200000,
  });
  await settleAndUnmount(tree);
});

test('an override opens on the effective values and offers a reset, not a delete', async () => {
  const tree = await bootToProviders();
  await emit({
    type: 'model.list.result',
    models: [
      {
        id: 'litellm/pinned',
        label: 'Pinned',
        provider: 'litellm',
        context: 262144,
        declared: true,
        discovered: true,
      },
    ],
    defaultModel: 'litellm/pinned',
    unavailable: [],
  });
  await pressLabel(tree, 'Open provider litellm');
  await waitFor(() => labelsOf(tree).includes('Edit provider'));

  // The badge says which kind of declaration it is, because that decides what deleting does.
  expect(textsOf(tree)).toContain('override');

  await pressLabel(tree, 'Edit Pinned');
  await waitFor(() => labelsOf(tree).includes('Save model'));
  expect(labelsOf(tree)).toContain('Reset to discovered');
  expect(labelsOf(tree)).not.toContain('Delete model');
  await settleAndUnmount(tree);
});

/**
 * The Claude Code version lever, on the anthropic provider page (owner, 2026-09-22): a new model
 * is gated on the client version the subscription request claims, and a release must not be the
 * only way to move it. The card writes one .env line and shows where the number comes from; the
 * server re-broadcasts the claim right after the write, hot from the next request.
 */
test('the anthropic provider page steers the claimed client version through .env', async () => {
  const tree = await bootToProviders();
  await emit({ ...providersConfig(), providers: [{ key: 'claude', type: 'anthropic', discover: true, models: 1 }] });
  await emit(envResult({ claudeClaim: { version: '2.1.280', pinned: '2.1.280', overridden: false } }));
  await pressLabel(tree, 'Open provider claude');
  await waitFor(() => labelsOf(tree).includes('Edit provider'));
  await pressLabel(tree, 'Edit provider');
  await waitFor(() => labelsOf(tree).includes('Claude Code version'));

  // The claim is on screen, and says it is the captured client while nothing is steering.
  expect(textsOf(tree).join('\n')).toContain('claims 2.1.280');

  await typeInto(tree, 'Claude Code version', '2.1.300');
  const before = sentFrames().length;
  await pressLabel(tree, 'Save Claude Code version');
  await waitFor(() => sentFrames().length > before, 60);
  expect(sentFrames()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'providers.env.set', name: 'ANTHROPIC_CLI_VERSION', value: '2.1.300' }),
    ]),
  );

  // The write is answered with a fresh claim: the page now knows the line is steering it, and
  // offers the way back to the pin. A removal is its own frame on the .env line, never an upsert.
  await emit(envResult({ claudeClaim: { version: '2.1.300', pinned: '2.1.280', overridden: true } }));
  await waitFor(() => labelsOf(tree).includes('Use the pinned Claude Code version'), 60);
  await pressLabel(tree, 'Use the pinned Claude Code version');
  await waitFor(
    () => sentFrames().some(f => f.type === 'providers.env.remove' && f.name === 'ANTHROPIC_CLI_VERSION'),
    60,
  );

  await settleAndUnmount(tree);
});

test('a provider that is not anthropic gets no version card', async () => {
  const tree = await bootToProviders();
  await emit(envResult({ claudeClaim: { version: '2.1.280', pinned: '2.1.280', overridden: false } }));
  await pressLabel(tree, 'Open provider litellm');
  await waitFor(() => labelsOf(tree).includes('Edit provider'));
  await pressLabel(tree, 'Edit provider');
  await waitFor(() => labelsOf(tree).includes('Save provider'));
  expect(labelsOf(tree)).not.toContain('Claude Code version');

  await settleAndUnmount(tree);
});
