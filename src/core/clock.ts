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
