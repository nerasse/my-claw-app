/**
 * The cross of a page: one press leaves the whole stack (settings, jobs) for the conversation,
 * where Back walks it a level at a time -- docs/keyboard.md.
 *
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter, useWindowDimensions } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { labelsOf, press, renderApp, unmount, waitFor, type Tree } from '../test-utils/render';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions');

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

function windowIs(width: number): void {
  (useWindowDimensions as unknown as jest.Mock).mockReturnValue({ width, height: 900, scale: 2, fontScale: 1 });
}

beforeEach(() => {
  windowIs(412);
  chatStore.clearAll();
  bridge.sendMessage.mockResolvedValue(true);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: 't-default' });
});

async function openSettings(tree: Tree): Promise<void> {
  await press(tree, 'Open conversations');
  await press(tree, 'Open settings');
  // The providers page lists what the server's agents config names: here, only its tags row.
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({
        type: 'agents.config.result',
        defaultModel: 'test-default',
        defaultEffort: '',
        fallback: '',
        effortLevels: [],
        providers: [{ key: 'tags', type: 'tags', discover: false, models: 1, keyPresent: true }],
        agents: [],
      }),
    });
  });
}

test('three levels into settings, the cross lands on the conversation in one press; the index has none', async () => {
  const tree = await renderApp();
  await openSettings(tree);
  // The index's own Back already goes to the conversation: a cross there would be a second one.
  expect(labelsOf(tree)).not.toContain('Close settings');

  await press(tree, 'Open models');
  expect(labelsOf(tree)).toContain('Close settings');
  await press(tree, 'Open tags');
  await waitFor(() => labelsOf(tree).includes('Back to models'));

  await press(tree, 'Close settings');
  await waitFor(() => !labelsOf(tree).includes('Back to models'));
  expect(labelsOf(tree)).not.toContain('Open models');
  expect(labelsOf(tree)).toContain('Message to send');

  // Settings open again at their index, not on the page the cross left.
  await openSettings(tree);
  expect(labelsOf(tree)).toContain('Open models');
  expect(labelsOf(tree)).not.toContain('Back to models');
  await unmount(tree);
});

test('the cross of a jobs page leaves jobs, and only jobs', async () => {
  // A desktop: the list stays beside the settings page, so jobs can open over it.
  windowIs(1600);
  const tree = await renderApp();
  await press(tree, 'Open settings');
  await press(tree, 'Open models');
  await press(tree, 'More');
  await press(tree, 'Jobs');
  await press(tree, 'Add job');
  await waitFor(() => labelsOf(tree).includes('Leave jobs'));

  await press(tree, 'Leave jobs');
  await waitFor(() => !labelsOf(tree).includes('Add job'));
  // The settings page under the jobs layer is still there: its cross is its own.
  expect(labelsOf(tree)).toContain('Close settings');
  await unmount(tree);
});
