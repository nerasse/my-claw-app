import { clockTime, dayAndTime } from '../clock';

const at = (year: number, month: number, day: number, hour = 14, minute = 6): number =>
  new Date(year, month - 1, day, hour, minute).getTime();

describe('clockTime', () => {
  test('the hour of the thing, zero-padded', () => {
    expect(clockTime(at(2026, 11, 11, 9, 5))).toBe('09:05');
  });
});

describe('dayAndTime', () => {
  // The thread prints a stamp that is not today's with its day in front of the clock: a bubble
  // read back three days later said `14:06` and nothing else, so the conversation looked like one
  // endless afternoon (owner, 2026-11-11).
  const now = at(2026, 11, 11, 15, 0);

  test('today is the clock alone, because the divider above already says the day', () => {
    expect(dayAndTime(at(2026, 11, 11, 9, 5), now)).toBe('09:05');
  });

  test('another day carries the app ladder in front of the clock', () => {
    expect(dayAndTime(at(2026, 11, 10, 22, 41), now)).toBe('Yesterday 22:41');
    expect(dayAndTime(at(2026, 11, 8, 14, 6), now)).toBe('3 days ago 14:06');
    expect(dayAndTime(at(2026, 11, 2, 14, 6), now)).toBe('Last week 14:06');
  });

  test('past two weeks it is the date and the clock', () => {
    const stamp = at(2026, 10, 20, 14, 6);
    // The order of day and month is the device's: the formatter is the app's, not this test's.
    const date = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit' }).format(new Date(stamp));
    expect(dayAndTime(stamp, now)).toBe(`${date} 14:06`);
  });

  test('the year joins the date when it is not the current one', () => {
    expect(dayAndTime(at(2025, 12, 31, 23, 59), now)).toContain('2025');
  });
});
