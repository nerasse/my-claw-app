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

/**
 * How a divider names its day: relative while a relative name still helps, then a date.
 *
 * This is the WhatsApp reading the owner asked for (2026-11-10): a thread scrolled past today
 * says "Yesterday", not just a clock. Past that a relative name stops helping -- counting days
 * back is work -- and the date itself is what the reader wants.
 */
export function dayLabel(day: number, now = Date.now()): string {
  const today = dayOf(now);
  if (day === today) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === yesterday.getTime()) return 'Yesterday';
  const date = new Date(day);
  const sameYear = date.getFullYear() === new Date(today).getFullYear();
  return sameYear ? dayMonthFormat.format(date) : dayMonthYearFormat.format(date);
}
