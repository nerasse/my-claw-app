import { createQuestionBodyState, questionNext, questionSaveCustom, questionSelectOption, questionSteps, questionSubmit, questionSync, questionToggle } from '../questionState';

const request = {
  id: 'que_1',
  questions: [
    { header: 'Langue', question: 'FR ou EN ?', options: [{ label: 'fr' }, { label: 'en' }] },
    { header: 'Fenetres', question: 'Combien ?', options: [{ label: '1' }, { label: '2' }], multiple: true },
  ],
};

describe('questionState', () => {
  test('a new ask resets the sheet state', () => {
    const a = createQuestionBodyState('que_1');
    const b = questionSync({ ...a, tab: 2 }, 'que_2');
    expect(b.requestID).toBe('que_2');
    expect(b.tab).toBe(0);
    expect(b.answers).toEqual([]);
  });

  test('a single question submits immediately on pick', () => {
    const single = { id: 'q', questions: [{ header: 'h', question: 'q', options: [{ label: 'a' }] }] };
    const state = createQuestionBodyState('q');
    const step = questionSelectOption(state, single, { label: 'a' });
    expect(step.answers).toEqual([['a']]);
  });

  test('a multi-question flow records the pick, and Next advances to the recap', () => {
    let state = createQuestionBodyState(request.id);
    state = questionSelectOption(state, request, { label: 'fr' }).state;
    expect(state.tab).toBe(0, 'a pick never jumps ahead on its own');
    expect(state.answers[0]).toEqual(['fr']);
    state = questionNext(state, request).state;
    expect(state.tab).toBe(1);
    state = questionToggle(state, '1');
    state = questionToggle(state, '2');
    const next = questionNext(state, request);
    expect(next.state.tab).toBe(2);
    expect(questionSteps(request)).toBe(3);
    // On the recap, Next submits.
    const submit = questionNext(next.state, request);
    expect(submit.answers).toEqual([['fr'], ['1', '2']]);
  });

  test('a pick can be changed on the same step before Next', () => {
    let state = createQuestionBodyState(request.id);
    state = questionSelectOption(state, request, { label: 'fr' }).state;
    state = questionSelectOption(state, request, { label: 'en' }).state;
    expect(state.answers[0]).toEqual(['en']);
    expect(state.tab).toBe(0);
  });

  test('questionSubmit builds the full answer array even when some are missing', () => {
    const state = { ...createQuestionBodyState(request.id), answers: [['fr']] };
    expect(questionSubmit(request, state)).toEqual([['fr'], []]);
  });

  test('custom answers are stored per question', () => {
    let state = createQuestionBodyState(request.id);
    state = questionSaveCustom(state, request, 'autre chose').state;
    expect(state.custom[0]).toBe('autre chose');
    expect(state.answers[0]).toEqual(['autre chose']);
  });
});
