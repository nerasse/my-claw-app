import {
  draftAnsweredCount,
  draftAnswers,
  draftEditing,
  draftHas,
  draftSelect,
  draftSubmitting,
  draftText,
  draftToggleCustom,
  draftWriteCustom,
  questionAllowsCustom,
} from '../questionState';
import { EMPTY_DRAFT } from '../questionStore';

const request = {
  id: 'que_1',
  questions: [
    { header: 'Langue', question: 'FR ou EN ?', options: [{ label: 'fr' }, { label: 'en' }] },
    { header: 'Fenetres', question: 'Combien ?', options: [{ label: '1' }, { label: '2' }], multiple: true },
  ],
};

const single = request.questions[0]!;
const multiple = request.questions[1]!;

describe('questionState', () => {
  test('a single-choice pick replaces the previous one', () => {
    let draft = draftSelect(EMPTY_DRAFT, single, 0, 'fr');
    expect(draftHas(draft, 0, 'fr')).toBe(true);
    draft = draftSelect(draft, single, 0, 'en');
    expect(draftHas(draft, 0, 'fr')).toBe(false);
    expect(draftHas(draft, 0, 'en')).toBe(true);
    // Picking the same option again is a no-op, not a deselect: the same object comes back.
    expect(draftSelect(draft, single, 0, 'en')).toBe(draft);
  });

  test('a multiple-choice pick toggles and keeps the others', () => {
    let draft = draftSelect(EMPTY_DRAFT, multiple, 1, '1');
    draft = draftSelect(draft, multiple, 1, '2');
    expect(draftAnswers(draft, request)[1]).toEqual(['1', '2']);
    draft = draftSelect(draft, multiple, 1, '1');
    expect(draftAnswers(draft, request)[1]).toEqual(['2']);
  });

  test('every question is answered independently, in one draft', () => {
    let draft = draftSelect(EMPTY_DRAFT, single, 0, 'fr');
    draft = draftSelect(draft, multiple, 1, '2');
    expect(draftAnswers(draft, request)).toEqual([['fr'], ['2']]);
    expect(draftAnsweredCount(draft, request)).toBe(2);
  });

  test('a question left alone is sent empty rather than blocking the batch', () => {
    const draft = draftSelect(EMPTY_DRAFT, single, 0, 'fr');
    expect(draftAnswers(draft, request)).toEqual([['fr'], []]);
    expect(draftAnsweredCount(draft, request)).toBe(1);
  });

  test('typed text is an answer as soon as it is typed, with no validation step', () => {
    let draft = draftToggleCustom(EMPTY_DRAFT, 0, true);
    expect(draftEditing(draft, 0)).toBe(true);
    draft = draftWriteCustom(draft, single, 0, 'occitan');
    expect(draftText(draft, 0)).toBe('occitan');
    expect(draftAnswers(draft, request)[0]).toEqual(['occitan']);
  });

  test('typing on a single-choice question drops the option that was picked', () => {
    let draft = draftSelect(EMPTY_DRAFT, single, 0, 'fr');
    draft = draftWriteCustom(draft, single, 0, 'occitan');
    expect(draftAnswers(draft, request)[0]).toEqual(['occitan']);
  });

  test('typing on a multiple-choice question rides beside the ticked options', () => {
    let draft = draftSelect(EMPTY_DRAFT, multiple, 1, '1');
    draft = draftWriteCustom(draft, multiple, 1, '42');
    expect(draftAnswers(draft, request)[1]).toEqual(['1', '42']);
  });

  test('picking an option closes the custom field of that question', () => {
    let draft = draftToggleCustom(EMPTY_DRAFT, 0, true);
    draft = draftSelect(draft, single, 0, 'fr');
    expect(draftEditing(draft, 0)).toBe(false);
  });

  test('blank text is not an answer, and custom:false ignores it entirely', () => {
    const blank = draftWriteCustom(EMPTY_DRAFT, single, 0, '   ');
    expect(draftAnswers(blank, request)[0]).toEqual([]);

    const closed = { header: 'h', question: 'q', options: [{ label: 'a' }], custom: false };
    expect(questionAllowsCustom(closed)).toBe(false);
    const typed = draftWriteCustom(EMPTY_DRAFT, closed, 0, 'smuggled');
    expect(draftAnswers(typed, { id: 'x', questions: [closed] })[0]).toEqual([]);
  });

  test('submitting is recorded once', () => {
    const busy = draftSubmitting(EMPTY_DRAFT);
    expect(busy.submitting).toBe(true);
    expect(draftSubmitting(busy)).toBe(busy);
  });
});
