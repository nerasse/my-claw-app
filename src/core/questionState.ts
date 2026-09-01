/**
 * Pure transitions over one ask's draft answers.
 *
 * The form is flat: the N questions are drawn one under the other inside the conversation, each
 * with its options and its own free-text field, and one button sends the batch. The stepper this
 * replaces (one question per step, then a recap) only existed because a modal sheet is narrow --
 * and that sheet is what made a question block the whole app.
 *
 * Every function is pure and returns the same object when nothing changes, so the store can skip
 * the notification and React can bail out of the render.
 */

import type { QuestionInfoFrame } from './protocol';
import type { QuestionDraft } from './questionStore';

export interface QuestionAskLike {
  id: string;
  questions: QuestionInfoFrame[];
}

function replace<T>(list: readonly T[], index: number, value: T, fill: T): T[] {
  const next = [...list];
  while (next.length <= index) next.push(fill);
  next[index] = value;
  return next;
}

/** The labels picked for one question. */
export function draftPicked(draft: QuestionDraft, index: number): string[] {
  return draft.answers[index] ?? [];
}

export function draftHas(draft: QuestionDraft, index: number, label: string): boolean {
  return draftPicked(draft, index).includes(label);
}

/** The free text of one question, whether or not it counts as an answer yet. */
export function draftText(draft: QuestionDraft, index: number): string {
  return draft.custom[index] ?? '';
}

export function draftEditing(draft: QuestionDraft, index: number): boolean {
  return draft.editing[index] ?? false;
}

/** Whether the custom field is offered for this question (default true). */
export function questionAllowsCustom(question: QuestionInfoFrame | undefined): boolean {
  return question?.custom !== false;
}

/**
 * Picks an option. Single-choice replaces the selection and drops the free text (picking an
 * option is how you change your mind about typing one); multiple toggles it.
 */
export function draftSelect(
  draft: QuestionDraft,
  question: QuestionInfoFrame | undefined,
  index: number,
  label: string,
): QuestionDraft {
  const current = draftPicked(draft, index);
  if (question?.multiple === true) {
    const next = current.includes(label) ? current.filter(entry => entry !== label) : [...current, label];
    return { ...draft, answers: replace(draft.answers, index, next, []) };
  }
  if (current.length === 1 && current[0] === label) return draft;
  return {
    ...draft,
    answers: replace(draft.answers, index, [label], []),
    editing: replace(draft.editing, index, false, false),
  };
}

/** Opens or closes the free-text field of one question. Closing keeps the text. */
export function draftToggleCustom(draft: QuestionDraft, index: number, open: boolean): QuestionDraft {
  if (draftEditing(draft, index) === open) return draft;
  return { ...draft, editing: replace(draft.editing, index, open, false) };
}

/**
 * Stores what is being typed. The text counts as the answer of a single-choice question right
 * away -- there is no "validate" step in a flat form, and a field left unconfirmed is exactly
 * how an answer gets lost. A multiple-choice question keeps its ticked options beside it.
 */
export function draftWriteCustom(
  draft: QuestionDraft,
  question: QuestionInfoFrame | undefined,
  index: number,
  text: string,
): QuestionDraft {
  const custom = replace(draft.custom, index, text, '');
  if (question?.multiple === true) return { ...draft, custom };
  return { ...draft, custom, answers: replace(draft.answers, index, [], []) };
}

/** One array per question: the options ticked, plus the free text when there is one. */
export function draftAnswers(draft: QuestionDraft, request: QuestionAskLike): string[][] {
  return request.questions.map((question, index) => {
    const picked = draftPicked(draft, index);
    const text = draftText(draft, index).trim();
    if (!text || !questionAllowsCustom(question)) return picked;
    if (picked.includes(text)) return picked;
    return [...picked, text];
  });
}

/** How many questions have something to send, for the "3/4 answered" line. */
export function draftAnsweredCount(draft: QuestionDraft, request: QuestionAskLike): number {
  return draftAnswers(draft, request).filter(answer => answer.length > 0).length;
}

export function draftSubmitting(draft: QuestionDraft): QuestionDraft {
  return draft.submitting ? draft : { ...draft, submitting: true };
}
