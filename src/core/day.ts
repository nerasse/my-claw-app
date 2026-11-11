/**
 * The local calendar day a timestamp belongs to, as the instant of its midnight.
 *
 * A stamp rather than a `Date` because it is the identity of a divider: two messages an hour
 * apart share one, and a run that crosses midnight does not.
 */
export function dayOf(ts: number): number {
  const date = new Date(ts);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// Built once, like every other formatter in the app: `Intl.DateTimeFormat` constructs its
// locale data on every call. A locale change needs a restart anyway.
const dayMonthFormat = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit' });
const dayMonthYearFormat = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How far back a relative name still helps: two to six days, then a week, then the date.
 *
 * A calendar day is not 24 hours (a DST switch bends it), so the distance is counted in stamps,
 * rounded: `dayOf` gives local midnights, and the gap between two of them is a whole number of
 * days as the reader counts them.
 */
function daysBack(day: number, today: number): number {
  return Math.round((today - day) / MS_PER_DAY);
}

/**
 * How a day is named: relative while a relative name still helps, then a date.
 *
 * This is the WhatsApp reading the owner asked for (2026-11-10): a thread scrolled past today says
 * "Yesterday", then "3 days ago", then "Last week", and only past that a date -- counting further
 * back is work, and the date itself is what the reader wants.
 */
export function dayLabel(day: number, now = Date.now()): string {
  const today = dayOf(now);
  const back = daysBack(day, today);
  if (back <= 0) return 'Today';
  if (back === 1) return 'Yesterday';
  if (back < 7) return `${back} days ago`;
  if (back < 14) return 'Last week';
  const date = new Date(day);
  const sameYear = date.getFullYear() === new Date(today).getFullYear();
  return sameYear ? dayMonthFormat.format(date) : dayMonthYearFormat.format(date);
}
