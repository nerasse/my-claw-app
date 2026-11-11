import { dayLabel, dayOf } from './day';

/**
 * The hour of a thing, in the reader's own zone: `14:06`.
 *
 * One formatter, because the same stamp closes several blocks now -- a message, an expanded call,
 * an opened segment -- and each one typing its own would drift a digit at a time.
 */
export function clockTime(ts: number): string {
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * A stamp as the thread prints it: the clock alone for today, the day in front of it past that.
 *
 * A bubble opened three days later said `14:06` and nothing else, so a conversation read back
 * looked like one endless afternoon (owner, 2026-11-11: "à chaque fois qu'on écrit l'heure je
 * voudrais qu'il y ait la date et l'heure"). Today needs no date -- the divider above already says
 * which day it is -- and everything older borrows the app's one ladder: `Yesterday 14:06`,
 * `3 days ago 14:06`, `Last week 14:06`, then `05/03 14:06` (core/day.ts).
 */
export function dayAndTime(ts: number, now = Date.now()): string {
  const day = dayOf(ts);
  return day === dayOf(now) ? clockTime(ts) : `${dayLabel(day, now)} ${clockTime(ts)}`;
}
