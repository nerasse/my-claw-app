/**
 * The settings index, regrouped (owner, 2026-10-04: "trop de catégories et de trucs dans tous les
 * sens"). Four groups, one page per subject, a search, and nothing lost on the way: what General
 * and Other held each has one home now.
 */
import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import { labelsOf, press, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

beforeEach(() => {
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: 't-default' });
});

async function openSettings(tree: Tree): Promise<void> {
  await press(tree, 'Open conversations');
  await press(tree, 'Open settings');
  await waitFor(() => labelsOf(tree).includes('Search settings'));
}

async function type(tree: Tree, label: string, text: string): Promise<void> {
  await ReactTestRenderer.act(async () => {
    tree.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onChangeText === 'function').props.onChangeText(text);
  });
}

/** Opens a page from the index, checks it holds every label given, and comes back. */
async function holds(tree: Tree, page: string, labels: string[]): Promise<void> {
  await press(tree, page);
  try {
    await waitFor(() => labels.every(label => labelsOf(tree).includes(label)), 3000);
  } catch {
    throw new Error(`${page} lacks ${labels.filter(label => !labelsOf(tree).includes(label)).join(', ')}`);
  }
  await press(tree, 'Back to settings');
  await waitFor(() => labelsOf(tree).includes('Search settings'));
}

test('the index is four groups, one row per subject', async () => {
  const tree = await renderApp();
  await openSettings(tree);
  expect(textsOf(tree)).toEqual(expect.arrayContaining(['this app', 'the agent', 'what the agent can use', 'connection']));
  expect(textsOf(tree)).not.toContain('security');
  const rows = labelsOf(tree).filter(label => label.startsWith('Open ') && label !== 'Open conversations');
  expect(rows).toEqual(
    expect.arrayContaining([
      'Open appearance', 'Open notifications', 'Open updates',
      'Open models', 'Open agents', 'Open services',
      'Open workspaces', 'Open skills', 'Open tools',
      'Open server', 'Open devices', 'Open advanced',
    ]),
  );
  // The catch-alls are gone: their settings moved to the page of their subject.
  expect(labelsOf(tree)).not.toContain('Open general');
  expect(labelsOf(tree)).not.toContain('Open other');
  await unmount(tree);
});

test('what General and Other held is each on the page of its subject', async () => {
  const tree = await renderApp();
  await openSettings(tree);
  await holds(tree, 'Open appearance', ['Theme Dark', 'Message size 100%', 'Always expand tool cards', 'Always expand reasoning']);
  // The server is its own page; the devices page is about adding and revoking devices; this
  // device's credential is a value for diagnosing, on Advanced.
  await holds(tree, 'Open server', ['Server address', 'Connect', 'Join with an invitation']);
  await holds(tree, 'Open devices', ['Add a device', 'Approve a request']);
  await holds(tree, 'Open updates', ['Update the server now']);
  await holds(tree, 'Open advanced', ['Open diagnostics', 'Open config', 'Open get started', 'Copy device and token']);
  await holds(tree, 'Open tools', ['Open MCPs', 'Open tool approvals']);
  // The defaults are drawn from the agents snapshot the server answers with.
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({ type: 'agents.config.result', defaultModel: 'fast-1', defaultEffort: '', effortLevels: [], fallback: '', providers: [], agents: [] }),
    });
  });
  await holds(tree, 'Open models', ['Default model', 'Fallback model', 'Open tags']);
  await unmount(tree);
});

test('the search finds a setting by a French word and opens its page', async () => {
  const tree = await renderApp();
  await openSettings(tree);
  await type(tree, 'Search settings', 'thème');
  await waitFor(() => labelsOf(tree).includes('Go to Theme'));
  // The results replace the groups while a word is typed.
  expect(labelsOf(tree)).not.toContain('Open models');
  await press(tree, 'Go to Theme');
  await waitFor(() => labelsOf(tree).includes('Theme Dark'));
  await unmount(tree);
});

test('a search that finds nothing says so, and clearing it brings the groups back', async () => {
  const tree = await renderApp();
  await openSettings(tree);
  await type(tree, 'Search settings', 'zzz');
  await waitFor(() => textsOf(tree).some(text => text.includes('No setting matches')));
  await press(tree, 'Clear the search');
  await waitFor(() => labelsOf(tree).includes('Open models'));
  await unmount(tree);
});

test('the setup opened from Advanced goes back to Advanced', async () => {
  const tree = await renderApp();
  await openSettings(tree);
  await press(tree, 'Open advanced');
  await press(tree, 'Open get started');
  await waitFor(() => labelsOf(tree).includes('Back to settings'));
  await press(tree, 'Back to settings');
  await waitFor(() => labelsOf(tree).includes('Open diagnostics'));
  await unmount(tree);
});
