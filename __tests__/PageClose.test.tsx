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

  // Settings come back where they were left: the cross puts the settings away, it does not throw
  // away where the owner was (owner, 2026-10-26: "tu gardes ce qu'il y a à droite"). A transient
  // editor (a tag, a provider form) comes back as its parent instead, since its draft is gone.
  await openSettings(tree);
  expect(labelsOf(tree)).toContain('Back to models');
  await unmount(tree);
});

test('a page replaces the one on screen: opening jobs from settings does not stack them', async () => {
  // A desktop: the list stays beside the page, which is why two pages could be built at once.
  windowIs(1600);
  const tree = await renderApp();
  await press(tree, 'Open settings');
  await press(tree, 'Open models');
  await press(tree, 'More');
  await press(tree, 'Jobs');
  await press(tree, 'Add job');
  await waitFor(() => labelsOf(tree).includes('Leave jobs'));

  // One page at a time. The settings page used to stay mounted under the jobs page: invisible,
  // and still clickable behind it (owner, 2026-10-26).
  expect(labelsOf(tree)).not.toContain('Close settings');
  expect(labelsOf(tree)).not.toContain('Open models');

  await press(tree, 'Leave jobs');
  await waitFor(() => !labelsOf(tree).includes('Add job'));
  expect(labelsOf(tree)).toContain('Message to send');
  await unmount(tree);
});
