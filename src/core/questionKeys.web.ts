/// <reference lib="dom" />
import { useEffect, useRef } from 'react';

export interface QuestionKeyHandlers {
  onPrev: () => void;
  onNext: () => void;
}

export type QuestionKeyIntent = 'prev' | 'next' | null;

/** The part of a keyboard event this reads. Narrow on purpose, so a test can build one. */
export interface QuestionKeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
}

/**
 * What an arrow key means for a question form, once the field under the cursor has had its say.
 *
 * Bare arrows, and that is the whole difficulty: the same key moves the caret inside a text
 * field. `editable` decides, and it wins -- a form that steals Left while its own free-text
 * answer is being typed is worse than one with no shortcut at all. Modifiers are left alone too:
 * Alt+Left is the browser's Back, Shift+Left is a selection.
 */
export function questionKeyIntent(event: QuestionKeyEvent, editable: boolean): QuestionKeyIntent {
  if (editable) return null;
  // An IME candidate window uses the arrows to pick a character.
  if (event.isComposing) return null;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;
  if (event.key === 'ArrowLeft') return 'prev';
  if (event.key === 'ArrowRight') return 'next';
  return null;
}

/** Whether the focus is somewhere a caret lives, in which case the arrows are not ours. */
export function isEditableTarget(element: Element | null): boolean {
  if (!element) return false;
  const tag = element.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return (element as HTMLElement).isContentEditable === true;
}

/**
 * One card owns the arrows at a time, the oldest mounted.
 *
 * Two pending asks on screen would otherwise both step on the same keystroke, and the second
 * form would page under a reader who is looking at the first. The claim is a module-level list
 * rather than a prop from the screen: the card is drawn from two places (inside its tool row,
 * and loose above the list when its row never arrived), and neither knows about the other.
 */
const claims: symbol[] = [];

export function useQuestionKeys(enabled: boolean, handlers: QuestionKeyHandlers): void {
  // Bound once, read fresh: the handlers are rebuilt on every render of the card.
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    const claim = Symbol('question-keys');
    claims.push(claim);

    const onKey = (event: KeyboardEvent): void => {
      if (claims[0] !== claim) return;
      const editable = isEditableTarget(document.activeElement);
      const intent = questionKeyIntent(event, editable);
      if (!intent) return;
      // The arrows would otherwise scroll the conversation under the form.
      event.preventDefault();
      event.stopPropagation();
      if (intent === 'prev') latest.current.onPrev();
      else latest.current.onNext();
    };

    // Capture: react-native-web's TextInput calls stopPropagation on key events, so a listener
    // waiting for the bubble never fires while the composer has focus.
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      const index = claims.indexOf(claim);
      if (index >= 0) claims.splice(index, 1);
    };
  }, [enabled]);
}
