/**
 * @format
 */

import { deviceBridge } from '../src/core/nativeBridge';
import { labelsOf, press, renderApp, textsOf, unmount } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 't-default';

beforeEach(() => {
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

test('boots on the chat screen with a composer and a drawer handle', async () => {
  const tree = await renderApp();
  const labels = labelsOf(tree);
  expect(labels).toContain('Message to send');
  expect(labels).toContain('Open conversations');
  // Nothing typed yet, so the corner offers the microphone rather than a dead send arrow.
  expect(labels).toContain('Record voice message');
  expect(labels).not.toContain('Send message');
  await unmount(tree);
});

test('the drawer holds the conversations and leads to the settings', async () => {
  const tree = await renderApp();
  await press(tree, 'Open conversations');

  expect(labelsOf(tree)).toContain('Open settings');
  expect(textsOf(tree)).toContain('MyClaw');
  expect(textsOf(tree)).toContain('Settings');
  await unmount(tree);
});

test('the settings expose the three theme modes', async () => {
  const tree = await renderApp();
  await press(tree, 'Open conversations');
  await press(tree, 'Open settings');
  await press(tree, 'Open other');

  const labels = labelsOf(tree);
  expect(labels).toContain('Theme System');
  expect(labels).toContain('Theme Light');
  expect(labels).toContain('Theme Dark');
  expect(labels).toContain('Open diagnostics');
  await unmount(tree);
});

test('the token is masked by default and can be revealed or copied whole', async () => {
  const tree = await renderApp();
  await press(tree, 'Open conversations');
  await press(tree, 'Open settings');
  await press(tree, 'Open general');

  // Masked: only the last four characters are visible, never the full value.
  expect(textsOf(tree).join('|')).not.toContain('token-test');
  expect(textsOf(tree).join('|')).toContain('••••••test');

  await press(tree, 'Show token');
  expect(textsOf(tree).join('|')).toContain('token-test');

  await press(tree, 'Copy device and token');
  const Clipboard = require('@react-native-clipboard/clipboard').default;
  expect(Clipboard.setString).toHaveBeenCalledWith('device: dev-test\ntoken: token-test');

  await press(tree, 'Hide token');
  expect(textsOf(tree).join('|')).not.toContain('token-test');
  await unmount(tree);
});
