/**
 * Pure state machine for the question sheet, ported from opencode's question.shared.ts.
 *
 * One sheet, N questions, tap-friendly: each question is a step with a pick list (single or
 * multiple) and an optional custom answer; the last step is the recap, where "Send answers"
 * submits the whole batch. A single-question sheet submits immediately on selection.
 *
 * State transitions:
 *   select(option)   -> single: submits; multiple: toggles and stays
 *   next()           -> moves to the next question (or the recap)
 *   back()           -> previous question
 *   saveCustom(text) -> stores the custom answer for the current question
 *   submit()         -> builds the final answers, one array per question
 *
 * All state transitions are pure; the sheet component just renders and dispatches.
 */

import type { QuestionInfoFrame } from './protocol';

export interface QuestionBodyState {
  /** The ask frame id: a new ask resets the sheet. */
  requestID: string;
  /** Index of the current question step; questions.length is the recap. */
  tab: number;
  /** Selected labels per question, indexed by question. */
  answers: string[][];
  /** Custom free-form answer per question, indexed by question. */
  custom: string[];
  /** Whether the custom TextInput is open for the current question. */
  editing: boolean;
  /** A submit is in flight: the sheet is read-only until it settles. */
  submitting: boolean;
}

export interface QuestionStep {
  state: QuestionBodyState;
  /** Set when the transition completes the flow: the sheet sends this. */
  answers?: string[][];
}

export function createQuestionBodyState(requestID: string): QuestionBodyState {
  return {
    requestID,
    tab: 0,
    answers: [],
    custom: [],
    editing: false,
    submitting: false,
  };
}

/** A new ask replaces the state of the previous one. */
export function questionSync(state: QuestionBodyState, requestID: string): QuestionBodyState {
  if (state.requestID === requestID) return state;
  return createQuestionBodyState(requestID);
}

/** Total steps: the questions plus the recap. */
export function questionSteps(request: QuestionAskLike): number {
  return request.questions.length + 1;
}

export interface QuestionAskLike {
  id: string;
  questions: QuestionInfoFrame[];
}

/** The question currently on screen; undefined on the recap. */
export function questionInfo(request: QuestionAskLike, state: QuestionBodyState): QuestionInfoFrame | undefined {
  return request.questions[state.tab];
}

/** Whether the current step is the recap. */
export function questionConfirm(request: QuestionAskLike, state: QuestionBodyState): boolean {
  return state.tab === request.questions.length;
}

/** A single-question sheet has no recap: it submits on pick. */
export function questionSingle(request: QuestionAskLike): boolean {
  return request.questions.length === 1 && request.questions[0]?.multiple !== true;
}

/** The custom option is offered for this question (default true). */
export function questionCustom(request: QuestionAskLike, state: QuestionBodyState): boolean {
  return questionInfo(request, state)?.custom !== false;
}

/** The value of the custom input for the current question. */
export function questionInput(state: QuestionBodyState): string {
  return state.custom[state.tab] ?? '';
}

/** Whether the current custom value has been selected. */
export function questionPicked(state: QuestionBodyState): boolean {
  const value = questionInput(state);
  if (!value) return false;
  return state.answers[state.tab]?.includes(value) ?? false;
}

/** Whether the selection is a custom value. */
export function questionOther(request: QuestionAskLike, state: QuestionBodyState): boolean {
  const info = questionInfo(request, state);
  if (!info) return false;
  if (info.custom === false) return false;
  return state.answers[state.tab]?.some((a) => !info.options.some((o) => o.label === a)) ?? false;
}

/** Total choices of the current question: options plus the custom one. */
export function questionTotal(request: QuestionAskLike, state: QuestionBodyState): number {
  const info = questionInfo(request, state);
  if (!info) return 0;
  return info.options.length + (questionCustom(request, state) ? 1 : 0);
}

/** One array per question, filled from the working state. */
export function questionAnswers(state: QuestionBodyState, count: number): string[][] {
  return Array.from({ length: count }, (_, idx) => state.answers[idx] ?? []);
}

/** The question answered so far? Used for progress dots. */
export function questionAnswered(request: QuestionAskLike, state: QuestionBodyState, index: number): boolean {
  return (state.answers[index]?.length ?? 0) > 0;
}

export function questionSetTab(state: QuestionBodyState, tab: number): QuestionBodyState {
  return { ...state, tab, editing: false };
}

export function questionSetEditing(state: QuestionBodyState, editing: boolean): QuestionBodyState {
  return { ...state, editing };
}

export function questionSetSubmitting(state: QuestionBodyState, submitting: boolean): QuestionBodyState {
  return { ...state, submitting };
}

function storeAnswers(state: QuestionBodyState, tab: number, list: string[]): QuestionBodyState {
  const answers = [...state.answers];
  answers[tab] = list;
  return { ...state, answers };
}

export function questionStoreCustom(state: QuestionBodyState, tab: number, text: string): QuestionBodyState {
  const custom = [...state.custom];
  custom[tab] = text;
  return { ...state, custom };
}

/** Toggles one option for a multiple question. */
export function questionToggle(state: QuestionBodyState, answer: string): QuestionBodyState {
  const list = [...(state.answers[state.tab] ?? [])];
  const idx = list.indexOf(answer);
  if (idx === -1) list.push(answer);
  else list.splice(idx, 1);
  return storeAnswers(state, state.tab, list);
}

/** A single question picked an option: submit immediately, no recap. */
function questionPick(state: QuestionBodyState, request: QuestionAskLike, answer: string, custom = false): QuestionStep {
  const answers = [...state.answers];
  answers[state.tab] = [answer];
  let next: QuestionBodyState = { ...state, answers, editing: false };
  if (custom) {
    const list = [...state.custom];
    list[state.tab] = answer;
    next = { ...next, custom: list };
  }
  if (questionSingle(request)) {
    return { state: next, answers: questionAnswers(next, request.questions.length) };
  }
  next = questionSetTab(next, state.tab + 1);
  return { state: next };
}

/** An option was picked (or toggled): moves to the next step for multi-question flows. */
export function questionSelectOption(state: QuestionBodyState, request: QuestionAskLike, option: { label: string }): QuestionStep {
  const picked = questionPick(state, request, option.label);
  return picked;
}

/** "Type your own answer" tapped: opens the editor. */
export function questionBeginCustom(state: QuestionBodyState): QuestionStep {
  return { state: questionSetEditing(state, true) };
}

/** The custom input was saved: single submits, multi stays on this question with the value stored. */
export function questionSaveCustom(state: QuestionBodyState, request: QuestionAskLike, text: string): QuestionStep {
  const value = text.trim();
  const info = questionInfo(request, state);
  if (!info) return { state };
  const prev = state.custom[state.tab];
  if (!value) {
    if (!prev) return { state: questionSetEditing(state, false) };
    const next = questionStoreCustom(state, state.tab, '');
    return { state: questionSetEditing(storeAnswers(next, state.tab, (state.answers[state.tab] ?? []).filter((item) => item !== prev)), false) };
  }
  if (info.multiple) {
    const answers = [...(state.answers[state.tab] ?? [])];
    if (prev) {
      const idx = answers.indexOf(prev);
      if (idx !== -1) answers.splice(idx, 1);
    }
    if (!answers.includes(value)) answers.push(value);
    const next = questionStoreCustom(state, state.tab, value);
    return { state: questionSetEditing(storeAnswers(next, state.tab, answers), false) };
  }
  return questionPick(state, request, value, true);
}

/** Moves to the next step (or submits the recap when it was already there). */
export function questionNext(state: QuestionBodyState, request: QuestionAskLike): QuestionStep {
  if (questionConfirm(request, state)) {
    return { state, answers: questionAnswers(state, request.questions.length) };
  }
  return { state: questionSetTab(state, state.tab + 1) };
}

/** Moves back, never below the first question. */
export function questionBack(state: QuestionBodyState): QuestionBodyState {
  return questionSetTab(state, Math.max(0, state.tab - 1));
}

/** Builds the full reply: the recap's Send button. */
export function questionSubmit(request: QuestionAskLike, state: QuestionBodyState): string[][] {
  return questionAnswers(state, request.questions.length);
}

/** Whether the current step can move on: single needs a pick, multi needs at least one. */
export function questionCanProceed(request: QuestionAskLike, state: QuestionBodyState): boolean {
  if (questionConfirm(request, state)) return true;
  const info = questionInfo(request, state);
  if (!info) return false;
  return (state.answers[state.tab]?.length ?? 0) > 0;
}
