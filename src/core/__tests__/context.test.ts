import { contextPercent, contextTiers, contextSummary } from '../context';

const labels = (tiers: ReturnType<typeof contextTiers>): string[] => tiers.map(tier => tier.label);

test('the list runs from the full window down, and never above it', () => {
  expect(labels(contextTiers(1_048_576, undefined, undefined))).toEqual([
    'Full: 1.0M',
    '512k',
    '256k',
    '128k',
    '64k',
  ]);
  // A small window drops every graduation at or above it.
  expect(labels(contextTiers(200_000, undefined, undefined))).toEqual(['Full: 200k', '128k', '64k']);
});

test('the standing cap is offered and named, wherever it falls in the scale', () => {
  const tiers = contextTiers(1_048_576, 256_000, undefined);
  expect(labels(tiers)).toEqual(['Full: 1.0M', '512k', '256k (cap)', '128k', '64k']);
  // Nothing was picked for this conversation, so the cap is what is in force.
  expect(tiers.find(tier => tier.selected)?.label).toBe('256k (cap)');
});

test('the choice in force is the one marked', () => {
  expect(contextTiers(1_048_576, 256_000, 'full').find(tier => tier.selected)?.label).toBe('Full: 1.0M');
  expect(contextTiers(1_048_576, 256_000, 128_000).find(tier => tier.selected)?.label).toBe('128k');
});

test('a window with nothing under it is not a choice at all', () => {
  expect(contextTiers(40_000, undefined, undefined)).toEqual([]);
  expect(contextTiers(undefined, undefined, undefined)).toEqual([]);
  expect(contextTiers(0, undefined, undefined)).toEqual([]);
});

test('the share of the window is a whole percent of what the run may use, not of the full one', () => {
  expect(contextPercent({ effective: 200_000, used: 50_000 })).toBe(25);
  expect(contextPercent({ effective: 128_000, used: 1 })).toBe(0);
  // A tenth of a percent: on a 1M window one turn is a few hundred tokens, and the header has to
  // move with the reading the server pushes after every model call, not once every twenty turns.
  expect(contextPercent({ effective: 1_000_000, used: 124_202 })).toBe(12.4);
  expect(contextPercent({ effective: 1_000_000, used: 125_300 })).toBe(12.5);
  // Over its ceiling is exactly the reading worth showing: it is not folded back to 100.
  expect(contextPercent({ effective: 100_000, used: 130_000 })).toBe(130);
});

test('nothing to measure shows nothing rather than a confident zero', () => {
  expect(contextPercent(null)).toBeNull();
  expect(contextPercent(undefined)).toBeNull();
  // A thread with no session yet, and a server that predates the field.
  expect(contextPercent({ effective: 200_000 })).toBeNull();
  expect(contextPercent({ used: 10 })).toBeNull();
  expect(contextPercent({ effective: 0, used: 10 })).toBeNull();
});

test('the summary names the full window only when the effective one differs', () => {
  expect(contextSummary(1_048_576, 1_048_576)).toBe('context: 1.0M');
  expect(contextSummary(1_048_576, 128_000)).toBe('context: 128k / full 1.0M');
  expect(contextSummary(undefined, undefined)).toBe('');
});
