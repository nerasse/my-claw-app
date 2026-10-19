/**
 * ChatGPT and Claude plans are providers like the keyed ones (owner, 2026-10-04): listed among the
 * providers on Settings -> Models, added from its +, several of a kind, each named, each with its own
 * sign-in and its own Sign out (server docs/subscription-accounts.md). Rewritten from the one-of-each
 * Subscriptions section; the sign-in flows they test are the same.
 *
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import { chatStore } from '../src/core/chat';
import { accountsStore } from '../src/core/accounts';
import { modelStore } from '../src/core/model';
import { labelsOf, press, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function sent(): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls.map(([frame]) => JSON.parse(String(frame)) as Record<string, unknown>);
}

function typeInto(tree: Tree, label: string, value: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    tree.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onChangeText === 'function').props.onChangeText(value);
  });
}

type View = Record<string, unknown>;
const OUT = { connected: false };
const chatgpt = (over: View = OUT): View => ({ provider: 'chatgpt', kind: 'codex', name: 'ChatGPT perso', ...over });
const claude = (over: View = OUT): View => ({ provider: 'anthropic', kind: 'claude', name: 'Claude', ...over });
const accounts = (list: View[] = [chatgpt(), claude()], extra = {}) => ({ type: 'accounts.result', accounts: list, ...extra });

const plan = (key: string, account: 'codex' | 'claude', group: string, keyPresent = false) => ({
  key,
  type: account === 'codex' ? 'codex' : 'anthropic',
  group,
  discover: true,
  models: 3,
  keyPresent,
  account,
});

/** The providers snapshot: the plans are in it, marked `account`, beside a keyed provider. */
function providers(extra: unknown[] = []) {
  return {
    type: 'agents.config.result',
    defaultModel: 'fast-1',
    defaultEffort: '',
    effortLevels: [],
    fallback: '',
    providers: [
      plan('chatgpt', 'codex', 'ChatGPT perso'),
      plan('anthropic', 'claude', 'Claude'),
      { key: 'openrouter', type: 'openai', discover: true, models: 9, keyEnv: 'OPENROUTER_API_KEY', keyPresent: true },
      ...extra,
    ],
    agents: [],
  };
}

/** A configured server: the launch's first catalogue (seeded) has a model, nothing gates the app. */
async function openProviders(extra: unknown[] = []): Promise<Tree> {
  const tree = await renderApp();
  await press(tree, 'Open conversations');
  await press(tree, 'Open settings');
  await press(tree, 'Open models');
  await emit(providers(extra));
  return tree;
}

beforeEach(() => {
  chatStore.clearAll();
  accountsStore.reset();
  modelStore.reset();
  bridge.sendMessage.mockResolvedValue(true);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: 't-default' });
});

test('ChatGPT: Sign in shows the code to enter and the page to open, then the account once approved', async () => {
  const tree = await openProviders();
  await waitFor(() => sent().some(frame => frame.type === 'accounts.get'));
  await emit(accounts());
  await press(tree, 'Open account ChatGPT perso');

  bridge.sendMessage.mockClear();
  await press(tree, 'Sign in with ChatGPT');
  expect(sent()).toContainEqual({ type: 'accounts.login', provider: 'chatgpt' });

  await emit(accounts([chatgpt({ connected: false, login: { url: 'https://auth.openai.com/codex/device', code: 'WXYZ-1234', expiresAt: Date.now() + 900_000 } }), claude()]));
  expect(labelsOf(tree)).toContain('Sign-in code WXYZ-1234');
  expect(labelsOf(tree)).toContain('Open the sign-in page');
  expect(labelsOf(tree)).toContain('Copy the sign-in code');

  // The approval happens on another device, minutes later: the server pushes it. The model it
  // had is gone (signed out elsewhere): the page offers to choose one, without the setup taking over.
  await emit({ type: 'model.list.result', models: [], defaultModel: '' });
  await emit(accounts([chatgpt({ connected: true, email: 'owner@example.com', plan: 'plus' }), claude()]));
  expect(labelsOf(tree)).toContain('Account status Connected · owner@example.com · Plus');
  expect(labelsOf(tree)).toContain('Choose the default model');
  await press(tree, 'Choose the default model');
  await waitFor(() => labelsOf(tree).includes('Back to the agents list'));
  await press(tree, 'Back to the agents list');
  await waitFor(() => labelsOf(tree).includes('Sign out'));
  await unmount(tree);
});

test('sign-out asks a second tap; a failed ChatGPT sign-in says why', async () => {
  const tree = await openProviders();
  await emit(accounts([chatgpt({ connected: true, email: 'owner@example.com', plan: 'pro' }), claude()]));
  await press(tree, 'Open account ChatGPT perso');
  bridge.sendMessage.mockClear();
  await press(tree, 'Sign out');
  expect(sent().some(frame => frame.type === 'accounts.logout')).toBe(false);
  await press(tree, 'Confirm sign out');
  expect(sent()).toContainEqual({ type: 'accounts.logout', provider: 'chatgpt' });

  await emit(accounts(undefined, { error: 'Codex device authorization timed out' }));
  expect(labelsOf(tree)).toContain('Account error Codex device authorization timed out');
  expect(labelsOf(tree)).toContain('Sign in with ChatGPT');
  await unmount(tree);
});

test('Claude: the code its page shows is pasted back; a token goes through its own field; it signs out like ChatGPT', async () => {
  const tree = await openProviders();
  await emit(accounts());
  await press(tree, 'Open account Claude');
  await press(tree, 'Sign in with Claude');
  await emit(accounts([chatgpt(), claude({ connected: false, login: { url: 'https://platform.claude.com/oauth/authorize?x=1', expiresAt: Date.now() + 600_000 } })]));

  bridge.sendMessage.mockClear();
  await typeInto(tree, 'Claude sign-in code', 'abc#def');
  await press(tree, 'Connect Claude');
  expect(sent()).toContainEqual({ type: 'accounts.code', provider: 'anthropic', code: 'abc#def' });
  await emit({ type: 'error', scope: 'accounts', message: 'State mismatch: this code belongs to another login attempt.' });
  expect(labelsOf(tree)).toContain('Account error State mismatch: this code belongs to another login attempt.');

  await press(tree, 'Use a long-lived token instead');
  await typeInto(tree, 'Claude long-lived token', 'sk-ant-oat01-abc');
  await press(tree, 'Save the Claude token');
  expect(sent()).toContainEqual({ type: 'accounts.token', provider: 'anthropic', token: 'sk-ant-oat01-abc' });

  // The token that came from .env is the account's own now: Sign out is there, as for ChatGPT.
  await emit(accounts([chatgpt(), claude({ connected: true, source: 'token' })]));
  expect(labelsOf(tree)).toContain('Account status Connected · long-lived token');
  // Who is signed in, when the server read an identity (0.7.118+): two Claude plans are the same
  // account page without it.
  await emit(accounts([chatgpt(), claude({ connected: true, source: 'token', email: 'perso@example.com' })]));
  expect(labelsOf(tree)).toContain('Account status Connected · perso@example.com · long-lived token');
  await press(tree, 'Sign out');
  await press(tree, 'Confirm sign out');
  expect(sent()).toContainEqual({ type: 'accounts.logout', provider: 'anthropic' });
  await unmount(tree);
});

test('the + is a page: the plans, then the services that take a key, then Custom', async () => {
  const tree = await openProviders();
  await press(tree, 'New provider');
  await waitFor(() => labelsOf(tree).includes('Custom'));
  const rows = ['ChatGPT plan', 'Claude plan', 'OpenRouter', 'OpenCode Go', 'OpenCode Zen', 'Claude API', 'OpenAI', 'Groq', 'Mistral', 'DeepSeek', 'Google Gemini', 'xAI (Grok)', 'Custom'];
  expect([...new Set(labelsOf(tree).filter(label => rows.includes(label)))]).toEqual(rows);
  expect(textsOf(tree)).toEqual(expect.arrayContaining(['sign in, no key', 'paste an API key', 'other']));

  // The Claude API sits with the keys, beside the plan: an Anthropic provider that takes its key.
  await press(tree, 'Claude API');
  await waitFor(() => labelsOf(tree).includes('Provider name'));
  await press(tree, 'Advanced settings');
  const field = (label: string) => tree.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onChangeText === 'function').props.value;
  expect(field('Provider name')).toBe('Claude API');
  expect(field('Provider key')).toBe('claude-api');
  expect(field('Provider env name')).toBe('ANTHROPIC_API_KEY');
  expect(labelsOf(tree)).toContain('Engine anthropic');
  await unmount(tree);
});

test('a second ChatGPT account: named, declared, then its page opens with its sign-in started', async () => {
  const tree = await openProviders();
  await press(tree, 'New provider');
  await press(tree, 'ChatGPT plan');
  // The name is asked over the + page, which a cancel comes back to.
  await waitFor(() => labelsOf(tree).includes('Name this ChatGPT account'));
  bridge.sendMessage.mockClear();
  await typeInto(tree, 'Name this ChatGPT account', 'ChatGPT boulot');
  await press(tree, 'Add');
  expect(sent()).toContainEqual({ type: 'accounts.add', kind: 'codex', name: 'ChatGPT boulot' });

  const boulot = { provider: 'chatgpt-boulot', kind: 'codex', name: 'ChatGPT boulot', connected: false };
  await emit(providers([plan('chatgpt-boulot', 'codex', 'ChatGPT boulot')]));
  await emit(accounts([chatgpt({ connected: true }), claude(), boulot], { added: 'chatgpt-boulot' }));
  await waitFor(() => sent().some(frame => frame.type === 'accounts.login'));
  expect(sent()).toContainEqual({ type: 'accounts.login', provider: 'chatgpt-boulot' });
  expect(labelsOf(tree)).toContain('Rename this account');

  // Renamed from its page: the name is the owner's, the id stays.
  await press(tree, 'Rename this account');
  await typeInto(tree, 'Rename this account', 'Work');
  bridge.sendMessage.mockClear();
  await press(tree, 'Rename');
  expect(sent()).toContainEqual({ type: 'accounts.rename', provider: 'chatgpt-boulot', name: 'Work' });
  await unmount(tree);
});

test('a plan cannot take a name another provider already reads as, on the way in or by a rename', async () => {
  const tree = await openProviders();
  await press(tree, 'New provider');
  await press(tree, 'Claude plan');
  await waitFor(() => labelsOf(tree).includes('Name this Claude account'));
  const confirm = (label: string) =>
    tree.root.find(node => node.props.accessibilityLabel === label && node.props.accessibilityState).props.accessibilityState;
  // Case aside: "chatgpt perso" is the ChatGPT plan's name, "openrouter" the keyed one's key.
  for (const taken of ['chatgpt perso', 'OpenRouter']) {
    await typeInto(tree, 'Name this Claude account', taken);
    expect(labelsOf(tree)).toContain('Problem a provider already has this name · pick another');
    expect(confirm('Add')).toEqual({ disabled: true });
  }
  bridge.sendMessage.mockClear();
  await press(tree, 'Add');
  expect(sent().some(frame => frame.type === 'accounts.add')).toBe(false);
  await typeInto(tree, 'Name this Claude account', 'Claude boulot');
  expect(confirm('Add')).toEqual({ disabled: false });
  await press(tree, 'Cancel');
  // The cancel leaves the + page standing: back to the list from it.
  await press(tree, 'Back to models');

  // Renaming a plan to its own name is not a clash; to another provider's is.
  await press(tree, 'Open account ChatGPT perso');
  // The page draws its rename once the server has said how the account stands.
  await emit(accounts());
  await waitFor(() => labelsOf(tree).includes('Rename this account'));
  await press(tree, 'Rename this account');
  await waitFor(() => labelsOf(tree).includes('Rename'));
  await typeInto(tree, 'Rename this account', 'ChatGPT Perso');
  expect(confirm('Rename')).toEqual({ disabled: false });
  await typeInto(tree, 'Rename this account', 'claude');
  expect(confirm('Rename')).toEqual({ disabled: true });
  await unmount(tree);
});

test('another window adding an account does not take this one to its page', async () => {
  const tree = await openProviders();
  await emit(accounts([chatgpt(), claude(), { provider: 'claude-2', kind: 'claude', name: 'Claude 2', connected: false }], { added: 'claude-2' }));
  expect(labelsOf(tree)).toContain('Open account ChatGPT perso');
  expect(labelsOf(tree)).not.toContain('Rename this account');
  await unmount(tree);
});
