/**
 * Pure transitions over one ask's draft answers.
 *
 * The form is a wizard: one question per page inside the conversation, then a recap that is the
 * only place the batch can be sent. A single question skips both -- no pager, no recap, just the
 * question and Send.
 *
 * This is a stepper again, and the flat form it replaces was itself a reaction to one. The
 * difference is where it lives: the original stepper was a modal sheet, and paging was the only
 * way to fit anything in it; the flat form fixed the modal, not the wall of six questions it
 * left in the middle of a conversation. Paging inside the card keeps both -- the thread stays
 * readable underneath, and one question is on screen at a time.
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
  if (draft.submitting && !draft.failed) return draft;
  return { ...draft, submitting: true, failed: false };
}

/**
 * The reply did not make it. The card comes back to life so the send can be tried again.
 *
 * A no-op when nothing was in flight: a stale watchdog firing on a card that was never sent would
 * otherwise mark it failed for nothing.
 */
export function draftReplyFailed(draft: QuestionDraft): QuestionDraft {
  if (!draft.submitting) return draft;
  return { ...draft, submitting: false, failed: true };
}

/**
 * How many pages the form has: one per question, plus the recap.
 *
 * A lone question has no recap. Reviewing one answer that is one tap above the button is
 * ceremony, and the page it would add is a page nobody asked for.
 */
export function pageCount(request: QuestionAskLike): number {
  const total = request.questions.length;
  return total > 1 ? total + 1 : 1;
}

/** Whether the form pages at all: two questions or more. */
export function isPaged(request: QuestionAskLike): boolean {
  return request.questions.length > 1;
}

/** The page currently shown, clamped: an ask can be re-sent with fewer questions. */
export function draftPage(draft: QuestionDraft, request: QuestionAskLike): number {
  const last = pageCount(request) - 1;
  return Math.min(Math.max(draft.page ?? 0, 0), last);
}

/** Whether that page is the recap rather than a question. */
export function isRecapPage(request: QuestionAskLike, page: number): boolean {
  return isPaged(request) && page >= request.questions.length;
}

/** Moves to a page, clamped to the form. Out of range is a no-op, never a crash. */
export function draftGoto(draft: QuestionDraft, request: QuestionAskLike, page: number): QuestionDraft {
  const last = pageCount(request) - 1;
  const next = Math.min(Math.max(page, 0), last);
  if (next === draftPage(draft, request)) return draft;
  // Leaving a question closes its field: the text is kept, and coming back to a page whose
  // keyboard pops open on its own is how an owner loses sight of what he is answering.
  return { ...draft, page: next, editing: draft.editing.map(() => false) };
}

/** One step forward or back, for the buttons and the arrow keys alike. */
export function draftStep(draft: QuestionDraft, request: QuestionAskLike, delta: number): QuestionDraft {
  return draftGoto(draft, request, draftPage(draft, request) + delta);
}

/**
 * Whether picking an option on this question should carry the owner forward on its own.
 *
 * Single choice only: a pick is the whole answer, and the tap that would follow is a tap that
 * only exists to say "yes, that one". A multiple-choice question is still being built after the
 * first tick, and moving would throw away the second one.
 */
export function advancesOnPick(question: QuestionInfoFrame | undefined): boolean {
  return question?.multiple !== true;
}

/** One line of the recap: what was asked, and what is going to be sent for it. */
export interface AnswerSummary {
  header: string;
  /** The answers joined for display; empty when the question is going out unanswered. */
  text: string;
  answered: boolean;
}

export function draftSummary(draft: QuestionDraft, request: QuestionAskLike): AnswerSummary[] {
  return draftAnswers(draft, request).map((answer, index) => ({
    header: request.questions[index]?.header ?? `Question ${index + 1}`,
    text: answer.join(', '),
    answered: answer.length > 0,
  }));
}
