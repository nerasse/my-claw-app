import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { DeviceEventEmitter, Keyboard, Platform, StyleSheet, View } from 'react-native';
import { KeyboardShell } from '../KeyboardShell';

test('the browser renders without the native keyboard metrics API', async () => {
  const originalOS = Platform.OS;
  Platform.OS = 'web';
  const metrics = jest.spyOn(Keyboard, 'metrics').mockImplementation(() => {
    throw new TypeError('Keyboard.metrics is unavailable on web');
  });
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    await act(async () => { tree = ReactTestRenderer.create(<KeyboardShell><View /></KeyboardShell>); });
    expect(tree!.root.findAllByType(View)).toHaveLength(2);
    expect(metrics).not.toHaveBeenCalled();
  } finally {
    await act(async () => { tree?.unmount(); });
    metrics.mockRestore();
    Platform.OS = originalOS;
  }
});

describe('Android keyboard room', () => {
  let tree: ReactTestRenderer.ReactTestRenderer;
  let bottom: number;
  const originalOS = Platform.OS;

  beforeEach(async () => {
    Platform.OS = 'android';
    bottom = 1000;
    jest.spyOn(View.prototype, 'measureInWindow').mockImplementation(callback => callback(0, 24, 400, bottom - 24));
    await act(async () => { tree = ReactTestRenderer.create(<KeyboardShell><View /></KeyboardShell>); });
  });
  afterEach(async () => {
    await act(async () => { tree.unmount(); });
    Platform.OS = originalOS;
    jest.restoreAllMocks();
  });
  function shell(): ReactTestRenderer.ReactTestInstance { return tree.root.findAllByType(View)[0]; }
  function padding(): number { return StyleSheet.flatten(shell().props.style)?.paddingBottom ?? 0; }
  async function show(): Promise<void> {
    await act(async () => {
      DeviceEventEmitter.emit('keyboardDidShow', {
        endCoordinates: { screenY: 700, screenX: 0, width: 400, height: 300 },
        duration: 0, easing: 'keyboard',
      });
    });
  }
  async function layout(): Promise<void> {
    await act(async () => {
      shell().props.onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: bottom - 24 } } });
    });
  }
  test('a resized Android 14 window does not give up the keyboard room twice', async () => {
    bottom = 700;
    await layout(); await show();
    expect(padding()).toBe(0);
  });
  test('an edge-to-edge window gives up only its overlap with the keyboard', async () => {
    await layout(); await show();
    expect(padding()).toBe(300);
    bottom = 850;
    await layout();
    expect(padding()).toBe(150);
  });
  test('hiding the keyboard restores the room even if its metrics are stale', async () => {
    await layout(); await show();
    expect(Keyboard.metrics()?.screenY).toBe(700);
    await act(async () => { DeviceEventEmitter.emit('keyboardDidHide', {}); });
    expect(padding()).toBe(0);
  });
});
