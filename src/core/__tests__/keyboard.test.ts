import { combineBottomInset, heightAfterResume, keyboardResumeMismatch } from '../keyboard';

describe('combineBottomInset', () => {
  test('keyboard down: only the gesture bar has to be cleared', () => {
    expect(combineBottomInset(48, 0, false)).toBe(48);
    expect(combineBottomInset(34, 0, true)).toBe(34);
  });

  test('android stacks them, because the reported height excludes the system bars', () => {
    expect(combineBottomInset(48, 320, false)).toBe(368);
  });

  test('ios does not, because the reported height already covers the home indicator', () => {
    expect(combineBottomInset(34, 320, true)).toBe(320);
  });

  test('a keyboard shorter than the safe area never shrinks the padding', () => {
    expect(combineBottomInset(48, 20, true)).toBe(48);
  });
});

/**
 * Coming back to the app is where a keyboard-derived layout outlives its keyboard.
 *
 * Owner, 2026-09-15: "de temps en temps quand on reviens sur l'app ca garde comme si le clavier
 * est ouvert". Every memory of the keyboard in the app (RN's `Keyboard.isVisible()`, its
 * KeyboardAvoidingView, our own height) can miss the hide, so the answer is asked again instead of
 * trusted -- and these are the two rules that say what the answer does.
 */
describe('heightAfterResume', () => {
  test('the keyboard left while the app was away: the height goes with it', () => {
    expect(heightAfterResume({ visible: false, height: 0 }, 680)).toBe(0);
  });

  test('still up: the platform geometry replaces whatever the last event said', () => {
    expect(heightAfterResume({ visible: true, height: 640 }, 680)).toBe(640);
  });

  test('up but unmeasured: keep the height rather than drop the pad under it', () => {
    expect(heightAfterResume({ visible: true, height: 0 }, 680)).toBe(680);
    expect(heightAfterResume({ visible: true, height: 0 }, 0)).toBe(0);
  });

  test('a stale nonzero height is dropped, never carried into a keyboard-less screen', () => {
    expect(heightAfterResume({ visible: false, height: 0 }, 1234)).toBe(0);
  });
});

describe('keyboardResumeMismatch', () => {
  test('silent when there is nothing to undo and nothing to contradict', () => {
    expect(keyboardResumeMismatch(0, false, false)).toBe(false);
    expect(keyboardResumeMismatch(0, true, true)).toBe(false);
  });

  test('speaks when a layout was still applied for a keyboard that is gone', () => {
    expect(keyboardResumeMismatch(212, true, false)).toBe(true);
  });

  test('speaks when RN still believes a keyboard the platform says is down', () => {
    expect(keyboardResumeMismatch(0, true, false)).toBe(true);
  });
});
