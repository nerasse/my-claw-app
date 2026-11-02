import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { NotificationsScreen } from '../NotificationsScreen.ios';
import { deviceBridge } from '../../core/nativeBridge';
import { ThemeContext } from '../../theme';
import { darkPalette } from '../../theme/palettes';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
let tree: ReactTestRenderer.ReactTestRenderer;

afterEach(async () => {
  if (tree) await ReactTestRenderer.act(async () => tree.unmount());
});

async function render(onBack: () => void, onEnableNotifications: () => Promise<void>): Promise<void> {
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: darkPalette, dark: true, mode: 'dark', themeId: 'sable' }}>
        <NotificationsScreen onBack={onBack} onEnableNotifications={onEnableNotifications} onChannelsChange={() => {}} />
      </ThemeContext.Provider>,
    );
  });
}

function button(label: string): ReactTestRenderer.ReactTestInstance {
  return tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
}

beforeEach(() => {
  bridge.getAPNsState.mockResolvedValue({ permission: 'granted', status: 'permissionRequired' });
});

// Regression: ISSUE-001 — notifications must return to settings without closing them.
// Found by /qa on 2026-10-10.
test('the notifications page returns to its parent settings page', async () => {
  let returned = false;
  await render(() => { returned = true; }, async () => {});
  const back = button('Back to settings');
  expect(back).toBeDefined();
  await ReactTestRenderer.act(async () => back.props.onPress());
  expect(returned).toBe(true);
});

// Regression: ISSUE-002 — a failed notification action must remain visible and retryable.
// Found by /qa on 2026-10-10.
test('a failed notification request shows an error and leaves retry available', async () => {
  await render(() => {}, async () => { throw new Error('Synthetic relay failure'); });
  await ReactTestRenderer.act(async () => button('Allow notifications').props.onPress());
  const alert = tree.root.findAllByType(Text).find(node => node.props.accessibilityRole === 'alert');
  expect(alert?.props.children).toBeTruthy();
  expect(button('Allow notifications').props.disabled).toBe(false);
});
