import type React from 'react';
import { KeyboardAvoidingView, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { useKeyboardHeight } from '../core/keyboard';

/**
 * The shell: the whole app inset by whatever the keyboard currently covers. Driven, not remembered.
 *
 * This replaces `KeyboardAvoidingView` on Android, and the reason is a bug of memory rather than of
 * arithmetic. That component keeps the last keyboard *event* in its instance state
 * (`_keyboardEvent`, feeding `_relativeKeyboardHeight`) and has no path back to the truth: it
 * guards once, in `componentDidMount`, with `if (!Keyboard.isVisible())`, which is the tell -- the
 * truth is askable, it was just never asked again. Background the app with the keyboard up and
 * Android hides the IME as part of the window losing focus, delivering no `keyboardDidHide` if no
 * layout pass happens while the app can still see it. The component then keeps padding the shell
 * by a keyboard that is gone: the conversation and the composer squeezed into the top half, a band
 * of background under them (owner's screenshot, 2026-09-15: "quand on reviens sur l'app ca garde
 * comme si le clavier est ouvert").
 *
 * So the inset comes from `useKeyboardHeight()`, which re-asks the platform on every return to the
 * foreground (`keyboardNow`), and this view pads by it. Same value as the 'padding' behaviour it
 * replaces on Android: the platform reports the IME inset minus the bar inset it shares with the
 * navigation bar (`ReactRootView.checkForKeyboardEvents`), which is exactly what a view already
 * sitting above the gesture bar has to add. Derived from the live answer alone, so a stale one can
 * cost a frame of overshoot and never compound -- on any platform, never RN's 'height' behaviour,
 * which renders `height: initialFrameHeight - bottom` with `flex: 0` against an initial frame
 * measured once, forever. See `docs/keyboard-avoidance.md`.
 *
 * iOS keeps the platform component: `keyboardWillHide` is delivered there when the app resigns
 * active, and its LayoutAnimation rides the keyboard's own curve.
 */
export function KeyboardShell({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}): React.JSX.Element {
  const height = useKeyboardHeight();

  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView style={style} behavior="padding">
        {children}
      </KeyboardAvoidingView>
    );
  }

  return <View style={[style, height > 0 ? { paddingBottom: height } : null]}>{children}</View>;
}
