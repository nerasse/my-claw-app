import {
  FILTER_CHIPS,
  chipValue,
  choicesOf,
  filterCount,
  filterSummary,
  hostLabel,
  isChoice,
  modelLabel,
  noFilter,
  sameFilter,
  sessionChoiceLabel,
  toggleFlag,
  withChoice,
} from '../statsFilter';
import type { StatsFacets, StatsFilter } from '../protocol';

const FACETS: StatsFacets = {
  models: ['z-ai/glm-5.2@streamlake/fp8', 'vendor/model-small'],
  providers: ['https://api.vendor.test/v1', 'https://openrouter.ai/api/v1'],
  callers: ['browser', 'orchestrator'],
  sessions: [
    { sessionId: 'fixture/alive', label: 'Plan de travail', labelSource: 'title', deleted: false },
    { sessionId: 'fixture/gone', label: 'fixture/gone-7f3c1d', labelSource: 'id', deleted: true },
  ],
};

describe('what makes two filters the same report', () => {
  it('treats an absent flag and a flag set to false as one request', () => {
    // Neither narrows, and the server echoes back the object it rebuilt: a store that compared
    // them by value or by JSON would refuse its own answer.
    expect(sameFilter({ errorsOnly: false }, {})).toBe(true);
    expect(sameFilter({}, { errorsOnly: true })).toBe(false);
  });

  it('compares every dimension, not the first one that differs', () => {
    const one: StatsFilter = { model: 'a', caller: 'orchestrator' };
    expect(sameFilter(one, { model: 'a', caller: 'orchestrator' })).toBe(true);
    expect(sameFilter(one, { model: 'a' })).toBe(false);
    expect(sameFilter(one, { model: 'b', caller: 'orchestrator' })).toBe(false);
    expect(sameFilter(one, { model: 'a', caller: 'subagent' })).toBe(false);
  });
});

describe('editing a filter', () => {
  it('sets a choice without touching the others, and does not edit the one it was given', () => {
    const before: StatsFilter = { caller: 'orchestrator' };
    const after = withChoice(before, 'model', 'vendor/model-small');
    expect(after).toEqual({ caller: 'orchestrator', model: 'vendor/model-small' });
    expect(before).toEqual({ caller: 'orchestrator' });
  });

  it('clears a choice with undefined rather than storing an empty string', () => {
    const cleared = withChoice({ model: 'a', caller: 'browser' }, 'model', undefined);
    expect(cleared).toEqual({ caller: 'browser' });
    expect(chipValue(cleared, 'model', FACETS)).toBe('');
  });

  it('toggles a flag both ways', () => {
    expect(toggleFlag({}, 'errorsOnly')).toEqual({ errorsOnly: true });
    expect(toggleFlag({ errorsOnly: true }, 'errorsOnly')).toEqual({});
  });

  it('counts what narrows, and not a flag that was declined', () => {
    expect(filterCount({})).toBe(0);
    expect(filterCount({ errorsOnly: false })).toBe(0);
    expect(filterCount({ errorsOnly: true, model: 'a', sessionId: 'b' })).toBe(3);
  });
});

describe('naming a dimension', () => {
  it('shortens a host to its name and a model to its last segment', () => {
    expect(hostLabel('https://api.vendor.test/v1')).toBe('api.vendor.test');
    expect(hostLabel('http://192.168.7.100:8080/v1/')).toBe('192.168.7.100:8080');
    expect(modelLabel('z-ai/glm-5.2@streamlake/fp8')).toBe('glm-5.2@streamlake/fp8');
    expect(modelLabel('glm-5.3')).toBe('glm-5.3');
  });

  it('says which conversation a chip holds, and marks a deleted one', () => {
    expect(sessionChoiceLabel(FACETS, 'fixture/alive')).toBe('Plan de travail');
    expect(sessionChoiceLabel(FACETS, 'fixture/gone')).toBe('fixture/gone-7f3c1d · deleted');
    // A filter can name a session this window does not show: the id stands rather than `undefined`.
    expect(sessionChoiceLabel(FACETS, 'fixture/unknown')).toBe('fixture/unknown');
  });

  it('shows a value once the dimension is set, and nothing while it is open', () => {
    const filter: StatsFilter = { model: 'z-ai/glm-5.2@streamlake/fp8', provider: 'https://api.vendor.test/v1', errorsOnly: true };
    expect(chipValue(filter, 'model', FACETS)).toBe('glm-5.2@streamlake/fp8');
    expect(chipValue(filter, 'provider', FACETS)).toBe('api.vendor.test');
    expect(chipValue(filter, 'errorsOnly', FACETS)).toBe('on');
    expect(chipValue(filter, 'sessionId', FACETS)).toBe('');
    expect(chipValue(noFilter(), 'unpricedOnly', FACETS)).toBe('');
  });

  it('never asks a chip for a choice it does not take', () => {
    for (const chip of FILTER_CHIPS) {
      expect(isChoice(chip.key)).toBe(chip.sheet !== undefined);
    }
  });
});

describe('the rows a sheet offers', () => {
  it('draws hosts without their scheme and marks the conversations that are gone', () => {
    expect(choicesOf(FACETS, 'provider')[0]).toEqual({ value: 'https://api.vendor.test/v1', label: 'api.vendor.test' });
    expect(choicesOf(FACETS, 'sessionId')[1]).toEqual({ value: 'fixture/gone', label: 'fixture/gone-7f3c1d · deleted' });
    // The value that travels is the one the server matches on, never the label.
    expect(choicesOf(FACETS, 'caller')).toEqual([
      { value: 'browser', label: 'browser' },
      { value: 'orchestrator', label: 'orchestrator' },
    ]);
  });

  it('offers nothing rather than a guess when the server sent no facets', () => {
    expect(choicesOf(undefined, 'model')).toEqual([]);
  });
});

describe('the sentence an empty screen owes', () => {
  it('names every dimension that is narrowing, in the order of the row', () => {
    expect(filterSummary({}, FACETS)).toBe('');
    expect(filterSummary({ model: 'vendor/model-small', errorsOnly: true }, FACETS)).toBe(
      'model model-small · failed only',
    );
    expect(filterSummary({ provider: 'https://openrouter.ai/api/v1', sessionId: 'fixture/gone' }, FACETS)).toBe(
      'host openrouter.ai · conversation fixture/gone-7f3c1d · deleted',
    );
  });
});
