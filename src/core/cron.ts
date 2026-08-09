import cronstrue from 'cronstrue';

/**
 * Schedule grammar of the server (src/cron/store.ts), mirrored so an invalid value can be
 * painted red before the save is even sent — the server refuses it, so this is the one field
 * that blocks, unlike the catalog membership of a model or a scope name.
 */
const EVERY_RE = /^every\s+(\d+)\s*(m|min|mins?|minutes?|h|hr|hrs?|hours?|d|days?)$/i;
const DURATION_RE = /^(\d+)\s*(m|min|mins?|minutes?|h|hr|hrs?|hours?|d|days?)$/i;
const CRON_RE = /^([\d*,/-]+\s+){4}[\d*,/-]+$/;

export function scheduleInvalid(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (EVERY_RE.test(trimmed)) return false;
  if (CRON_RE.test(trimmed)) return false;
  if (trimmed.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return isNaN(new Date(trimmed).getTime());
  }
  return !DURATION_RE.test(trimmed);
}

/** One-tap schedules, the same template row every visual cron builder offers. */
export const CRON_PRESETS: ReadonlyArray<{ label: string; expr: string }> = [
  { label: 'Every minute', expr: '* * * * *' },
  { label: 'Every 5 min', expr: '*/5 * * * *' },
  { label: 'Every 10 min', expr: '*/10 * * * *' },
  { label: 'Every 15 min', expr: '*/15 * * * *' },
  { label: 'Every 30 min', expr: '*/30 * * * *' },
  { label: 'Hourly', expr: '0 * * * *' },
  { label: 'Daily', expr: '0 0 * * *' },
  { label: 'Weekly', expr: '0 0 * * 1' },
  { label: 'Monthly', expr: '0 0 1 * *' },
  { label: 'Yearly', expr: '0 0 1 1 *' },
];

/** The tokens a fresh repeat mode starts from, so an accidental save is never "every minute". */
export const DAILY_TOKENS: string[] = ['0', '0', '*', '*', '*'];

const TOKEN_RE = /^[\d*,/-]+$/;

/** Splits a cron expression into its five fields, or null when it is not one. */
export function cronTokens(expr: string): string[] | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5 || !parts.every(part => TOKEN_RE.test(part))) return null;
  return parts;
}

export function cronFromTokens(tokens: string[]): string {
  return tokens.join(' ');
}

/** Human description of an expression ("At 09:00 AM, only on Monday"), raw on failure. */
export function describeCron(expr: string): string {
  try {
    return cronstrue.toString(expr);
  } catch {
    return expr;
  }
}

export interface CronField {
  key: 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek';
  label: string;
  /** Unit name for the "every N" chips; absent on weekday, where steps make no sense. */
  everyUnit: string;
  everySteps: number[];
  values: Array<{ token: string; label: string }>;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The five cron fields in expression order: minute, hour, day of month, month, day of week. */
export const CRON_FIELDS: CronField[] = [
  {
    key: 'minute',
    label: 'Minute',
    everyUnit: 'min',
    everySteps: [2, 5, 10, 15, 30],
    values: Array.from({ length: 12 }, (_, i) => ({ token: String(i * 5), label: String(i * 5) })),
  },
  {
    key: 'hour',
    label: 'Hour',
    everyUnit: 'hrs',
    everySteps: [2, 4, 6, 12],
    values: Array.from({ length: 12 }, (_, i) => ({ token: String(i * 2), label: String(i * 2) })),
  },
  {
    key: 'dayOfMonth',
    label: 'Day',
    everyUnit: 'days',
    everySteps: [2, 5, 10],
    values: Array.from({ length: 31 }, (_, i) => ({ token: String(i + 1), label: String(i + 1) })),
  },
  {
    key: 'month',
    label: 'Month',
    everyUnit: 'months',
    everySteps: [2, 3, 6],
    values: MONTH_NAMES.map((name, i) => ({ token: String(i + 1), label: name })),
  },
  {
    key: 'dayOfWeek',
    label: 'Weekday',
    everyUnit: '',
    everySteps: [],
    values: WEEKDAY_NAMES.map((name, i) => ({ token: String(i), label: name })),
  },
];

export function tokenSummary(field: CronField, token: string): string {
  if (token === '*' || token === '') return 'any';
  if (token.startsWith('*/')) return `every ${token.slice(2)} ${field.everyUnit || 'units'}`;
  const named = field.values.find(value => value.token === token);
  return named ? named.label : token;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** The ISO string the server parses as a one-shot schedule, built from local parts. */
export function localIsoString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

export function dateFromIso(iso: string): Date | null {
  if (!iso.includes('T') && !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const date = new Date(iso);
  return isNaN(date.getTime()) ? null : date;
}

export function formatDateShort(date: Date): string {
  return `${pad(date.getDate())} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatTimeShort(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
