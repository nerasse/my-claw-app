import { dayLabel, dayOf } from '../day';

const at = (year: number, month: number, day: number, hour = 12): number =>
  new Date(year, month - 1, day, hour).getTime();

describe('dayOf', () => {
  test('two moments of one calendar day share a stamp', () => {
    expect(dayOf(at(2026, 11, 10, 0))).toBe(dayOf(at(2026, 11, 10, 23)));
    expect(dayOf(at(2026, 11, 10, 0))).toBe(at(2026, 11, 10, 0));
  });

  test('the last instant of a day is still that day', () => {
    const last = at(2026, 11, 10, 23) + 59 * 60_000 + 59_000;
    expect(dayOf(last)).toBe(at(2026, 11, 10, 0));
    expect(dayOf(last + 1000)).toBe(at(2026, 11, 11, 0));
  });
});

describe('dayLabel', () => {
  const now = at(2026, 11, 10, 15);

  test('today and yesterday have names', () => {
    expect(dayLabel(at(2026, 11, 10, 0), now)).toBe('Today');
    expect(dayLabel(at(2026, 11, 9, 0), now)).toBe('Yesterday');
  });

  test('older days are dates, with the year only when it is another one', () => {
    const thisYear = dayLabel(at(2026, 3, 5), now);
    expect(thisYear).not.toBe('Today');
    expect(thisYear).not.toBe('Yesterday');
    expect(thisYear).not.toContain('2026');

    const lastYear = dayLabel(at(2025, 12, 31), now);
    expect(lastYear).toContain('2025');
  });

  test('the day the clock crosses midnight changes the names, not the stamps', () => {
    const late = at(2026, 11, 10, 23);
    const after = at(2026, 11, 11, 0);
    expect(dayLabel(dayOf(late), late)).toBe('Today');
    expect(dayLabel(dayOf(late), after)).toBe('Yesterday');
    expect(dayLabel(dayOf(after), after)).toBe('Today');
  });
});
