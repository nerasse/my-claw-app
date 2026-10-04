/**
 * A ChatGPT or Claude plan, signed in from Settings -> Providers -> Subscriptions instead of the
 * `/codex` and `/claude` commands (server docs/subscription-accounts.md).
 *
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import { chatStore } from '../src/core/chat';
import { accountsStore } from '../src/core/accounts';
import { modelStore } from '../src/core/model';
import { labelsOf, press, renderApp, unmount, waitFor, type Tree } from '../test-utils/render';

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

const OUT = { connected: false };
const accounts = (codex: Record<string, unknown> = OUT, claude: Record<string, unknown> = OUT, extra = {}) => ({
  type: 'accounts.result',
  codex,
  claude,
  ...extra,
});

/** A configured server: the launch's first catalogue (seeded) has a model, nothing gates the app. */
async function openProviders(): Promise<Tree> {
  const tree = await renderApp();
  await press(tree, 'Open conversations');
  await press(tree, 'Open settings');
  await press(tree, 'Open providers');
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
  await press(tree, 'Open account ChatGPT');

  bridge.sendMessage.mockClear();
  await press(tree, 'Sign in with ChatGPT');
  expect(sent()).toContainEqual({ type: 'accounts.login', provider: 'codex' });

  await emit(accounts({ connected: false, login: { url: 'https://auth.openai.com/codex/device', code: 'WXYZ-1234', expiresAt: Date.now() + 900_000 } }));
  expect(labelsOf(tree)).toContain('Sign-in code WXYZ-1234');
  expect(labelsOf(tree)).toContain('Open the sign-in page');
  expect(labelsOf(tree)).toContain('Copy the sign-in code');

  // The approval happens on another device, minutes later: the server pushes it. The model it
  // had is gone (signed out elsewhere): the page offers to choose one, without the setup taking over.
  await emit({ type: 'model.list.result', models: [], defaultModel: '' });
  await emit(accounts({ connected: true, email: 'owner@example.com', plan: 'plus' }));
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
  await emit(accounts({ connected: true, email: 'owner@example.com', plan: 'pro' }));
  await press(tree, 'Open account ChatGPT');
  bridge.sendMessage.mockClear();
  await press(tree, 'Sign out');
  expect(sent().some(frame => frame.type === 'accounts.logout')).toBe(false);
  await press(tree, 'Confirm sign out');
  expect(sent()).toContainEqual({ type: 'accounts.logout', provider: 'codex' });

  await emit(accounts(OUT, OUT, { error: 'Codex device authorization timed out' }));
  expect(labelsOf(tree)).toContain('Account error Codex device authorization timed out');
  expect(labelsOf(tree)).toContain('Sign in with ChatGPT');
  await unmount(tree);
});

test('Claude: the code its page shows is pasted back; a token goes through its own field', async () => {
  const tree = await openProviders();
  await emit(accounts());
  await press(tree, 'Open account Claude');
  await press(tree, 'Sign in with Claude');
  await emit(accounts(OUT, { connected: false, login: { url: 'https://platform.claude.com/oauth/authorize?x=1', expiresAt: Date.now() + 600_000 } }));

  bridge.sendMessage.mockClear();
  await typeInto(tree, 'Claude sign-in code', 'abc#def');
  await press(tree, 'Connect Claude');
  expect(sent()).toContainEqual({ type: 'accounts.code', code: 'abc#def' });
  await emit({ type: 'error', scope: 'accounts', message: 'State mismatch: this code belongs to another login attempt.' });
  expect(labelsOf(tree)).toContain('Account error State mismatch: this code belongs to another login attempt.');

  await press(tree, 'Use a long-lived token instead');
  await typeInto(tree, 'Claude long-lived token', 'sk-ant-oat01-abc');
  await press(tree, 'Save the Claude token');
  expect(sent()).toContainEqual({ type: 'accounts.token', token: 'sk-ant-oat01-abc' });

  // A token in the server's .env cannot be signed out from here: the page says where it lives.
  await emit(accounts(OUT, { connected: true, source: 'env' }));
  expect(labelsOf(tree)).not.toContain('Sign out');
  expect(labelsOf(tree)).toContain('Account status Connected · token in the server .env');
  await unmount(tree);
});

test('a server without the accounts frames shows no Subscriptions section', async () => {
  const tree = await openProviders();
  await waitFor(() => sent().some(frame => frame.type === 'accounts.get'));
  expect(labelsOf(tree)).not.toContain('Open account ChatGPT');
  await unmount(tree);
});
