/**
 * The shell gives up exactly one keyboard's worth of room, however many times the keyboard
 * announces itself.
 *
 * The bug this locks: coming back to the app and tapping the composer flashed the whole
 * conversation away, leaving the header and the input as a strip at the top of the screen over a
 * band of background. `behavior="height"` renders `height: _initialFrameHeight - bottom` and
 * derives `bottom` from `state.bottom + frame.height - keyboardY`, adding the shrink it has
 * already applied. That only cancels out if a layout pass lands between two keyboard events --
 * and on resume the IME is restored and the field focused back to back, so the keyboard was
 * counted twice against a frame that had not been re-measured yet.
 *
 * See docs/keyboard-avoidance.md.
 *
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter, KeyboardAvoidingView, StyleSheet } from 'react-native';
import { renderAppHome, unmount, type Tree } from '../../../test-utils/render';

const SCREEN = 2340;
const KEYBOARD = 1050;

/** The host View the KeyboardAvoidingView styles and lays out: what the platform talks to. */
function shellOf(tree: Tree): ReactTestRenderer.ReactTestInstance {
  const kav = tree.root.findAllByType(KeyboardAvoidingView)[0];
  if (!kav) throw new Error('no KeyboardAvoidingView in the shell');
  const host = kav.findAll(node => typeof node.type === 'string' && typeof node.props.onLayout === 'function', {
    deep: true,
  })[0];
  if (!host) throw new Error('the KeyboardAvoidingView rendered no laid-out host view');
  return host;
}

/** Room left for the conversation, whichever way the avoidance is spelled. */
function roomFor(host: ReactTestRenderer.ReactTestInstance): number {
  const style = StyleSheet.flatten(host.props.style) as { height?: number; paddingBottom?: number };
  return (style.height ?? SCREEN) - (style.paddingBottom ?? 0);
}

function measured(host: ReactTestRenderer.ReactTestInstance, height: number): Promise<void> {
  return ReactTestRenderer.act(async () => {
    host.props.onLayout({ persist() {}, nativeEvent: { layout: { x: 0, y: 0, width: 1080, height } } });
  });
}

/** Both spellings: the component subscribes to `will` on iOS and `did` on Android, never both. */
function keyboardShows(): Promise<void> {
  const event = {
    endCoordinates: { screenX: 0, screenY: SCREEN - KEYBOARD, width: 1080, height: KEYBOARD },
    duration: 0,
    easing: 'keyboard',
  };
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('keyboardWillShow', event);
    DeviceEventEmitter.emit('keyboardDidShow', event);
  });
}

test('the keyboard is counted once, even when it announces itself twice without a layout', async () => {
  const tree = await renderAppHome();
  try {
    const host = shellOf(tree);
    await measured(host, SCREEN);

    await keyboardShows();
    expect(roomFor(host)).toBe(SCREEN - KEYBOARD);

    // The resume sequence: the IME comes back, the field takes focus, and the layout pass for the
    // first shrink has not landed yet. Counting the keyboard again here is what left the shell a
    // strip at the top -- 240px of 2340 for this geometry.
    await keyboardShows();
    expect(roomFor(host)).toBe(SCREEN - KEYBOARD);
  } finally {
    await unmount(tree);
  }
}, 60000);

test('a keyboard that reopens taller does not stack on the one before it', async () => {
  const tree = await renderAppHome();
  try {
    const host = shellOf(tree);
    await measured(host, SCREEN);
    await keyboardShows();

    // A suggestion bar appearing, or a switch to another IME: Android re-announces a different
    // height on a frame it has not re-laid-out.
    const taller = KEYBOARD + 180;
    await ReactTestRenderer.act(async () => {
      const event = {
        endCoordinates: { screenX: 0, screenY: SCREEN - taller, width: 1080, height: taller },
        duration: 0,
        easing: 'keyboard',
      };
      DeviceEventEmitter.emit('keyboardWillShow', event);
      DeviceEventEmitter.emit('keyboardDidShow', event);
    });

    expect(roomFor(host)).toBe(SCREEN - taller);
  } finally {
    await unmount(tree);
  }
}, 60000);

test('the shell takes its height back when the keyboard goes down', async () => {
  const tree = await renderAppHome();
  try {
    const host = shellOf(tree);
    await measured(host, SCREEN);
    await keyboardShows();
    expect(roomFor(host)).toBe(SCREEN - KEYBOARD);

    await ReactTestRenderer.act(async () => {
      DeviceEventEmitter.emit('keyboardWillHide', {});
      DeviceEventEmitter.emit('keyboardDidHide', {});
    });

    expect(roomFor(host)).toBe(SCREEN);
  } finally {
    await unmount(tree);
  }
}, 60000);
