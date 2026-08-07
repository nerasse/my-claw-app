import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

    return () => {
      show.remove();
      hide.remove();
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
