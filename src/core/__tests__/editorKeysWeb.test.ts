import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { editorIntent as nativeIntent } from '../editorKeys';
import { editorIntent as webIntent } from '../editorKeys.web';

/**
 * The composer's keyboard is the one place where the two platforms deliberately disagree: Enter
 * sends in a browser and breaks the line on a phone, so both implementations are pinned here.
 */

interface FakeKey {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  composing?: boolean;
}

function event(spec: FakeKey): {
  event: NativeSyntheticEvent<TextInputKeyPressEventData>;
  prevented: () => boolean;
} {
  let prevented = false;
  const synthetic = {
    key: spec.key,
    shiftKey: spec.shiftKey ?? false,
    altKey: spec.altKey ?? false,
    ctrlKey: spec.ctrlKey ?? false,
    metaKey: spec.metaKey ?? false,
    preventDefault: () => {
      prevented = true;
    },
    nativeEvent: { key: spec.key, isComposing: spec.composing ?? false },
  };
  return {
    event: synthetic as unknown as NativeSyntheticEvent<TextInputKeyPressEventData>,
    prevented: () => prevented,
  };
}

const idle = { menuOpen: false, empty: false };

test('Enter sends, and the newline it would have typed is cancelled', () => {
  const { event: press, prevented } = event({ key: 'Enter' });
  expect(webIntent(press, idle)).toBe('submit');
  // Without preventDefault the message is sent *and* a line break is left in the field.
  expect(prevented()).toBe(true);
});

test('Shift+Enter is a line break, not a send', () => {
  const { event: press, prevented } = event({ key: 'Enter', shiftKey: true });
  expect(webIntent(press, idle)).toBeNull();
  expect(prevented()).toBe(false);
});

test('an IME validating a candidate with Enter is not sending a message', () => {
  expect(webIntent(event({ key: 'Enter', composing: true }).event, idle)).toBeNull();
});

test('Tab completes the highlighted command, and does nothing without a menu', () => {
  expect(webIntent(event({ key: 'Tab' }).event, { menuOpen: true, empty: false })).toBe('complete');
  expect(webIntent(event({ key: 'Tab' }).event, idle)).toBeNull();
});

test('the arrows drive the command menu when it is open', () => {
  expect(webIntent(event({ key: 'ArrowUp' }).event, { menuOpen: true, empty: true })).toBe('menu-up');
  expect(webIntent(event({ key: 'ArrowDown' }).event, { menuOpen: true, empty: false })).toBe('menu-down');
});

test('Up on an empty field recalls the last message, and leaves a written one alone', () => {
  expect(webIntent(event({ key: 'ArrowUp' }).event, { menuOpen: false, empty: true })).toBe('recall');
  // Mid-draft the caret is moving through the text: stealing that key would be maddening.
  expect(webIntent(event({ key: 'ArrowUp' }).event, idle)).toBeNull();
});

test('a phone keeps Enter as a line break and only answers the arrows for the menu', () => {
  expect(nativeIntent(event({ key: 'Enter' }).event, idle)).toBeNull();
  expect(nativeIntent(event({ key: 'ArrowUp' }).event, { menuOpen: true, empty: false })).toBe('menu-up');
  expect(nativeIntent(event({ key: 'ArrowUp' }).event, { menuOpen: false, empty: true })).toBeNull();
});
