import { combineBottomInset } from '../keyboard';

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
