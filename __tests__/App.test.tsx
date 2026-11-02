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

test('keeps the chat inside the bottom system safe area', async () => {
  const tree = await renderApp();
  const safeAreas = tree.root.findAll(node => Array.isArray(node.props.edges), { deep: true });

  expect(safeAreas.some(node => node.props.edges.includes('bottom'))).toBe(true);
  await unmount(tree);
});

test('the drawer holds the conversations and leads to the settings', async () => {
  const tree = await renderApp();
  await press(tree, 'Open conversations');

  expect(labelsOf(tree)).toContain('More');
  expect(textsOf(tree)).toContain('MyClaw');
  expect(textsOf(tree)).toContain('More');
  await unmount(tree);
});

test('the settings expose the palettes and the four modes', async () => {
  const tree = await renderApp();
  await press(tree, 'Open conversations');
  await press(tree, 'Open settings');
  await press(tree, 'Open appearance');

  const labels = labelsOf(tree);
  // The theme is a palette (ten of them) and a mode (four), and both live in Appearance: the
  // switch left the title bar, where it was the busiest control of the busiest strip.
  expect(labels).toContain('Theme Sable');
  expect(labels).toContain('Theme Catppuccin');
  expect(labels).toContain('Mode System');
  expect(labels).toContain('Mode Light');
  expect(labels).toContain('Mode Dark');
  expect(labels).toContain('Mode AMOLED');
  await unmount(tree);
});

test('the token is masked by default and can be revealed or copied whole', async () => {
  const tree = await renderApp();
  await press(tree, 'Open conversations');
  await press(tree, 'Open settings');
  // A value for diagnosing, not a setting: it lives on Advanced.
  await press(tree, 'Open advanced');

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
