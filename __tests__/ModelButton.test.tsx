/**
 * One action, one door.
 *
 * The model picker can be reached from the title bar or from the command menu, and never from both
 * at once: the owner asked for the button where there is room, and for the menu entry to leave when
 * it appears ("on le vire de la liste du menu ... quand il est affiché", 2026-11-04). Two predicates
 * would eventually disagree and leave the picker in both places on one window and in neither on the
 * next, so both readers take `showsModelButton`.
 *
 * Pinned at both ends of the threshold: wide, the button is drawn and the entry is gone; narrow, the
 * entry is back and the button is not.
 *
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter, useWindowDimensions } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { MODEL_BUTTON_MIN_WIDTH } from '../src/app/modelButton';
import { labelsOf, press, renderApp, unmount, waitFor, type Tree } from '../test-utils/render';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions');

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 't-model-button';

/**
 * Set before `renderApp`: the layout is read once, at mount, and the header decides from it.
 * `lastThreadId` is how a suite starts inside a conversation instead of on the list.
 */
async function openConversation(width: number): Promise<Tree> {
  (useWindowDimensions as unknown as jest.Mock).mockReturnValue({ width, height: 900, scale: 2, fontScale: 1 });
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
  const tree = await renderApp();
  await waitFor(() => labelsOf(tree).includes('Commands'));
  return tree;
}

beforeEach(() => {
  chatStore.clearAll();
});

test('wide, the picker is a button of the title bar and leaves the menu', async () => {
  const tree = await openConversation(MODEL_BUTTON_MIN_WIDTH + 120);

  expect(labelsOf(tree)).toContain('Change model');

  await press(tree, 'Commands');
  // The menu is open, and still carries the actions that have no control of their own.
  await waitFor(() => labelsOf(tree).includes('Instructions'));
  expect(labelsOf(tree)).not.toContain('Model…');
  // The tune sheet is not the picker: it keeps its entry at every width.
  expect(labelsOf(tree)).toContain('Effort / window…');

  await unmount(tree);
});

test('narrow, the button goes and the menu keeps the entry', async () => {
  const tree = await openConversation(MODEL_BUTTON_MIN_WIDTH - 80);

  expect(labelsOf(tree)).not.toContain('Change model');

  await press(tree, 'Commands');
  await waitFor(() => labelsOf(tree).includes('Model…'));

  await unmount(tree);
});

test('the button opens the picker, which lists the catalogue the server answers', async () => {
  const tree = await openConversation(MODEL_BUTTON_MIN_WIDTH + 120);

  await press(tree, 'Change model');
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({ type: 'model.list.result', models: [{ id: 'm1', label: 'M1' }], defaultModel: 'm1' }),
    });
  });
  // The sheet is open and holds the catalogue: that is the button reaching the same picker the
  // menu entry used to. Which frame asked for it is the picker's business, not this test's.
  await waitFor(() => labelsOf(tree).includes('M1'));

  await unmount(tree);
});
