/**
 * The way back into the app with a keyboard that left while it was away.
 *
 * Owner, 2026-10-12: back in the app without the keyboard, a band of empty space at the bottom,
 * gone only once the field was focused and the keyboard dropped. The shell asked the platform once,
 * at `active`, which fires before the window has its focus back: the insets could still describe
 * the keyboard it left with, so the shell kept that height. RN sends no hide for a keyboard that
 * goes without a layout pass, so nothing else corrected it. These pin the answers given once the
 * window is settled.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { RESUME_CHECKS_MS, onKeyboardResume, useKeyboardHeight } from '../keyboard';
import { deviceBridge } from '../nativeBridge';

const mockHandlers: Array<(state: string) => void> = [];

jest.mock('react-native/Libraries/AppState/AppState', () => ({
  __esModule: true,
  default: {
    currentState: 'active',
    addEventListener: jest.fn((_type: string, handler: (state: string) => void) => {
      mockHandlers.push(handler);
      return { remove: () => mockHandlers.splice(mockHandlers.indexOf(handler), 1) };
    }),
  },
}));

const platform = deviceBridge.keyboardVisible as jest.Mock;

function appState(state: string): void {
  for (const handler of [...mockHandlers]) handler(state);
}

/** Lets the timer due now fire and the bridge's promise land. */
async function advance(ms: number): Promise<void> {
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function Probe(): React.JSX.Element {
  return <Text>{String(useKeyboardHeight())}</Text>;
}

let tree: ReactTestRenderer.ReactTestRenderer | null = null;

function shown(): string {
  return tree!.root.findByType(Text).props.children as string;
}

beforeEach(() => {
  jest.useFakeTimers();
  platform.mockReset();
});

afterEach(() => {
  if (tree) ReactTestRenderer.act(() => tree?.unmount());
  tree = null;
  jest.useRealTimers();
  platform.mockImplementation(() => Promise.resolve({ visible: false, height: 0 }));
});

async function mountWithKeyboard(height: number): Promise<void> {
  // Up when the app left: what the shell is padded by.
  platform.mockResolvedValue({ visible: true, height });
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<Probe />);
  });
  appState('active');
  await advance(0);
  expect(shown()).toBe(String(height));
}

test('a keyboard still in the insets at resume, gone once the window settles, leaves no band', async () => {
  await mountWithKeyboard(300);
  appState('background');

  // Back: at `active` the insets still hold the keyboard the window left with...
  platform.mockResolvedValueOnce({ visible: true, height: 300 });
  // ...and once the window has its focus back they do not.
  platform.mockResolvedValue({ visible: false, height: 0 });
  appState('active');
  await advance(0);
  expect(shown()).toBe('300');

  await advance(RESUME_CHECKS_MS[1]);
  expect(shown()).toBe('0');
});

test('a keyboard really there on the way back keeps the shell padded by it', async () => {
  await mountWithKeyboard(300);
  appState('background');

  platform.mockResolvedValue({ visible: true, height: 320 });
  appState('active');
  await advance(RESUME_CHECKS_MS[2]);
  expect(shown()).toBe('320');
});

test('leaving again drops the answers still to come', async () => {
  const seen: number[] = [];
  const stop = onKeyboardResume((_now, attempt) => seen.push(attempt));
  platform.mockResolvedValue({ visible: false, height: 0 });

  appState('active');
  await advance(0);
  appState('background');
  await advance(RESUME_CHECKS_MS[2]);
  expect(seen).toEqual([0]);

  appState('active');
  await advance(RESUME_CHECKS_MS[2]);
  expect(seen).toEqual([0, 0, 1, 2]);

  stop();
  appState('active');
  await advance(RESUME_CHECKS_MS[2]);
  expect(seen).toEqual([0, 0, 1, 2]);
});
