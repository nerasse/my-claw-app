/**
 * @format
 */

import { labelsOf, press, renderApp, textsOf, unmount } from '../test-utils/render';

test('boots on the chat screen with a composer and a drawer handle', async () => {
  const tree = await renderApp();
  const labels = labelsOf(tree);
  expect(labels).toContain('Message to send');
  expect(labels).toContain('Open conversations');
  expect(labels).toContain('Send message');
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

  const labels = labelsOf(tree);
  expect(labels).toContain('Theme System');
  expect(labels).toContain('Theme Light');
  expect(labels).toContain('Theme Dark');
  expect(labels).toContain('Server address');
  await unmount(tree);
});
