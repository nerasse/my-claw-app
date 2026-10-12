import { useEffect, useState } from 'react';
import { AppState, Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deviceBridge, type KeyboardStateNative } from './nativeBridge';

/**
 * Ask the platform whether the IME is on screen, and what it covers. Right now, not as remembered.
 *
 * Every other keyboard answer in this app is a listener, and a listener can miss the hide: RN keeps
 * `_currentlyShowing` for `Keyboard.isVisible()`, its `KeyboardAvoidingView` keeps its last event,
 * and `ReactRootView.checkForKeyboardEvents()` only re-decides on a layout pass. Android hides the
 * IME as part of the window losing focus -- background the app and there may be no layout pass
 * while the app can still see it, so all of them keep believing a keyboard that is gone. This one
 * reads the live insets, which cannot be out of date because there is no date to them.
 */
export function keyboardNow(): Promise<KeyboardStateNative> {
  return deviceBridge.keyboardVisible().catch(() => ({ visible: false, height: 0 }));
}

/**
 * What the keyboard height should be after a return to the foreground.
 *
 * The layout is a memory of a keyboard, and the trip to the background is what erases the
 * keyboard without erasing the memory. So the height is re-asked instead of assumed, and the
 * platform's answer is used whole -- it knows both whether the IME is up and how tall it is.
 */
export function heightAfterResume(state: KeyboardStateNative, previous: number): number {
  if (!state.visible) return 0;
  // Visible with no usable geometry: keep what we had rather than drop the pad under a keyboard
  // that is really there.
  return state.height > 0 ? state.height : previous;
}

/**
 * When a return to the foreground asks the platform, counted from `active`.
 *
 * Once was not enough. `active` fires at the activity's resume, before its window has focus back,
 * and at that instant the insets can still describe the keyboard the window had when it left: the
 * shell kept that height, the IME was in fact gone, and nothing told it so. RN's own hide comes
 * from a layout pass (`ReactRootView.checkForKeyboardEvents`), and a window whose insets change
 * without anything changing size gets none -- the band stayed until the owner focused the field
 * and dropped the keyboard, which is what finally sent `keyboardDidHide` (2026-10-12). The later
 * answers are the ones given once the window is settled.
 */
export const RESUME_CHECKS_MS = [0, 300, 1000] as const;

/**
 * Calls `check` with the platform's answer at every `RESUME_CHECKS_MS` after each return to the
 * foreground; a trip back to the background drops the ones still to come. Returns the unsubscribe.
 */
export function onKeyboardResume(check: (now: KeyboardStateNative, attempt: number) => void): () => void {
  let timers: Array<ReturnType<typeof setTimeout>> = [];
  const cancel = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };
  const subscription = AppState.addEventListener('change', state => {
    cancel();
    if (state !== 'active') return;
    timers = RESUME_CHECKS_MS.map((delay, attempt) =>
      setTimeout(() => {
        keyboardNow()
          .then(now => check(now, attempt))
          .catch(() => {});
      }, delay),
    );
  });
  return () => {
    cancel();
    subscription.remove();
  };
}

/**
 * Whether a return to the foreground has something worth writing to the diagnostics.
 *
 * Silent by default: the normal resume finds no keyboard and nothing to undo, and a line per
 * resume would drown everything else. It speaks when a keyboard-derived layout was still applied
 * (the pad that pushed the end of a thread up with nothing under it), or when RN still believes a
 * keyboard the platform says is gone -- the two readings that name this bug from the device
 * instead of from a screenshot.
 */
export function keyboardResumeMismatch(pad: number, believed: boolean, imeVisible: boolean): boolean {
  if (pad > 0) return true;
  return believed && !imeVisible;
}

/**
 * How much of the screen the keyboard currently covers, 0 when it is down.
 *
 * The bottom sheets are absolute layers rendered outside the KeyboardAvoidingView, so nothing
 * lifts them on its own, and `adjustResize` no longer helps: Android draws edge to edge and
 * hands the keyboard over as an inset instead of resizing the window. A sheet that opens a
 * focused field therefore has to pad itself.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // iOS announces the keyboard before it moves, which rides the same curve; Android only
    // reports it once it is up, and the `will` events never fire there.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, event => {
      setHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      setHeight(0);
    });
    // The way back into the foreground re-asks: a keyboard-derived layout outlives the keyboard
    // itself, and coming back to a shell still padded by one is what this hook is for. See
    // `keyboardNow` -- the platform is the only source that cannot be stale -- and
    // `RESUME_CHECKS_MS` for why it is asked more than once.
    const unsubscribe = onKeyboardResume(now => setHeight(current => heightAfterResume(now, current)));

    return () => {
      show.remove();
      hide.remove();
      unsubscribe();
    };
  }, []);

  return height;
}

/**
 * Whether the two insets stack, which is the whole subtlety and differs by platform.
 *
 * Android hands over `imeInsets.bottom - barInsets.bottom` (ReactRootView.checkForKeyboardEvents),
 * so the gesture bar is missing from the number and has to be added back. iOS measures the
 * keyboard from the bottom of the screen, home indicator included, so adding would double it.
 *
 * Exported for the test: jest resolves the platform to iOS, which would never exercise the
 * Android branch through the hook.
 */
export function combineBottomInset(safeBottom: number, keyboard: number, ios: boolean): number {
  if (keyboard <= 0) return safeBottom;
  return ios ? Math.max(keyboard, safeBottom) : safeBottom + keyboard;
}

/** Bottom padding for a sheet floating over the app, clearing whatever is currently down there. */
export function useSheetBottomInset(extra: number): number {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  return combineBottomInset(insets.bottom, keyboard, Platform.OS === 'ios') + extra;
}

/**
 * Drops the keyboard when a surface with nothing to type into takes the screen. React Native
 * has no automatic behaviour here (the bottom-sheet libraries call `dismiss` by hand too), and
 * a keyboard left up from the composer costs twice: it covers the lower half of a menu, and on
 * Android it swallows the first back press, which is what made a back walk out of settings feel
 * like the app closing at random.
 *
 * Pass `open` for a surface that stays mounted and toggles (the drawer); leave it out for one
 * that is mounted only while it shows, where mounting is the opening.
 *
 * Never use this on a surface that owns a focused field: it would fight its own autofocus.
 */
export function useDismissKeyboard(open = true): void {
  useEffect(() => {
    if (open) Keyboard.dismiss();
  }, [open]);
}
