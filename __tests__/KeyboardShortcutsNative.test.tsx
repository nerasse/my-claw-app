/**
 * The shortcuts from a physical keyboard on Android reach the shell as `claw:hotkey`
 * (HardwareKeys.kt, docs/keyboard.md). The case found on the emulator: ⇧S on the home screen
 * opened the slide-over drawer on top of the home list and focused the slide-over's search,
 * which nobody could see.
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter, TextInput } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { press as pressLabel, renderApp, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

function hotkey(combo: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:hotkey', { combo });
  });
}

/** The conversation searches focused, by the panel each one sits in. */
function focusedSearches(tree: Tree, calls: unknown[]): string[] {
  const home = tree.root.findAll(node => node.props.testID === 'home-screen', { deep: true })[0];
  const homeFields = home ? home.findAll(node => node.type === TextInput, { deep: true }).map(node => node.instance) : [];
  return calls
    .filter(instance => (instance as { props?: { accessibilityLabel?: string } }).props?.accessibilityLabel === 'Search conversations')
    .map(instance => (homeFields.includes(instance) ? 'home list' : 'slide-over'));
}

let focusCalls: unknown[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  chatStore.clearAll();
  bridge.sendMessage.mockResolvedValue(true);
  focusCalls = [];
  jest.spyOn(TextInput.prototype as { focus: () => void }, 'focus').mockImplementation(function (this: unknown) {
    focusCalls.push(this);
  });
});

afterEach(() => jest.restoreAllMocks());

beforeEach(() => {
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: 't-kb' });
});

test('the shell registers its combos with the activity', async () => {
  const tree = await renderApp();
  await waitFor(() => bridge.setHotkeys.mock.calls.length > 0);
  const combos = bridge.setHotkeys.mock.calls.at(-1)![0];
  expect(combos).toEqual(expect.arrayContaining(['escape', 'shift+s', 'shift+n', 'mod+,']));
  await unmount(tree);
});

test('⇧S on the home screen puts the caret in the list on screen, and opens nothing over it', async () => {
  const tree = await renderApp();
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Home');
  await waitFor(() => tree.root.findAll(node => node.props.testID === 'home-screen', { deep: true }).length > 0);
  focusCalls = [];
  await hotkey('shift+s');
  expect(focusedSearches(tree, focusCalls)).toEqual(['home list']);
  await unmount(tree);
});

test('⇧S in a conversation opens the list and focuses its search', async () => {
  const tree = await renderApp();
  focusCalls = [];
  await hotkey('shift+s');
  expect(focusedSearches(tree, focusCalls)).toEqual(['slide-over']);
  await unmount(tree);
});
