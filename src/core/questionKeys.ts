/**
 * Arrow keys walking the pages of a question form. A no-op on Android: nothing to bind.
 *
 * The web counterpart is where the rules are, and they matter enough to be pinned by their own
 * tests -- an arrow key belongs to the text field the owner is typing in, always.
 */

export interface QuestionKeyHandlers {
  onPrev: () => void;
  onNext: () => void;
}

export function useQuestionKeys(_enabled: boolean, _handlers: QuestionKeyHandlers): void {
  // Android: a phone has no arrow keys, and a hardware keyboard on one is not worth the claim.
}
