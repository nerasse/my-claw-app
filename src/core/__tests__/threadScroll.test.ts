import { threadCells } from '../threadScroll';
import { buildRows, withDaySeparators } from '../runRows';
import { ask, answer, folded } from '../../../test-utils/scenario';

function project(items: Parameters<typeof buildRows>[0]) {
  return threadCells(withDaySeparators(buildRows(items)));
}

test('a prepend within one day does not give the oldest message the divider identity', () => {
  const kept = ask('kept', 'The paragraph being read');
  const newer = answer('newer', 'The most recent reply');
  const older = ask('older', 'A previous question');
  const before = project([kept, newer]);
  const after = project([older, kept, newer]);
  expect(before[0]).toMatchObject({ day: { kind: 'day' }, row: { item: { id: 'kept' } } });
  expect(after[0]).toMatchObject({ day: { kind: 'day' }, row: { item: { id: 'older' } } });
  expect(after[1]?.day).toBeUndefined();
  expect(after[1]?.row).toEqual(before[0]?.row);
});

test('a collapsed run is a single cell, between the question and the answer', () => {
  const rows = project([ask('q', 'Question'), folded('run-a', { itemCount: 300 }), answer('a', 'Answer')]);
  expect(rows.map(({ row }) => row.kind)).toEqual(['item', 'folded', 'item']);
  expect(rows[1]?.row).toMatchObject({ summaries: [{ itemCount: 300, hydration: 'idle' }] });
});
