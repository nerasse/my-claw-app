/**
 * A physical keyboard on Android: the activity takes the combos the shell registers and sends them
 * back as `claw:hotkey` (HardwareKeys.kt). What is tested here is the JS half of that contract.
 */

import React, { createRef } from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter, type TextInput } from 'react-native';
import { useHotkeys, type HotkeyMap } from '../hotkeys';
import { focusField, keyField } from '../keyNav';
import { deviceBridge } from '../nativeBridge';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

function Shell({ map }: { map: HotkeyMap }): null {
  useHotkeys(map);
  return null;
}

beforeEach(() => {
  bridge.setHotkeys.mockClear();
});

test('the combos bound are registered with the activity, and the one it sends back runs', () => {
  const opened: string[] = [];
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<Shell map={{ 'shift+s': () => opened.push('sessions'), escape: () => opened.push('back') }} />);
  });
  expect(bridge.setHotkeys).toHaveBeenLastCalledWith(['escape', 'shift+s']);

  ReactTestRenderer.act(() => {
    DeviceEventEmitter.emit('claw:hotkey', { combo: 'shift+s' });
    DeviceEventEmitter.emit('claw:hotkey', { combo: 'shift+x' });
  });
  expect(opened).toEqual(['sessions']);

  // A handler that changed since is the one that runs, without registering anything again.
  ReactTestRenderer.act(() => {
    tree.update(<Shell map={{ 'shift+s': () => opened.push('sessions again'), escape: () => opened.push('back') }} />);
  });
  ReactTestRenderer.act(() => {
    DeviceEventEmitter.emit('claw:hotkey', { combo: 'shift+s' });
  });
  expect(opened).toEqual(['sessions', 'sessions again']);
  expect(bridge.setHotkeys).toHaveBeenCalledTimes(1);

  // Gone with the shell: the activity takes no key for a page that is not there.
  ReactTestRenderer.act(() => tree.unmount());
  expect(bridge.setHotkeys).toHaveBeenLastCalledWith([]);
  DeviceEventEmitter.emit('claw:hotkey', { combo: 'shift+s' });
  expect(opened).toHaveLength(2);
});

test('`/` puts the caret in the field registered under its label, and nowhere once it is gone', () => {
  const focus = jest.fn();
  const ref = createRef<TextInput>() as React.MutableRefObject<TextInput | null>;
  ref.current = { focus } as unknown as TextInput;
  const release = keyField('Message to send', ref);
  expect(focusField('Message to send')).toBe(true);
  expect(focus).toHaveBeenCalledTimes(1);
  expect(focusField('Search')).toBe(false);
  release();
  expect(focusField('Message to send')).toBe(false);
});
