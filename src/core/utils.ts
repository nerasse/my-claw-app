import { DEFAULT_HTTP_ORIGIN } from './serverUrl';
import { dayLabel, dayOf } from './day';
import { kindForName, type FileKind } from './fileKind';
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r % 4) + 8;
    return v.toString(16);
  });
}

/**
 * ws(s):// -> http(s):// origin, by hand on purpose. RN's URL is a partial polyfill whose
 * `host` getter only matches http(s) urls, so `new URL('ws://host:8080/x').host` is '' on the
 * device (and correct under Node in tests): that silently produced 'http:///media', which
 * OkHttp parses as the host "media". No URL here, same result everywhere.
 */
export function httpOrigin(wsUrl: string, fallback = DEFAULT_HTTP_ORIGIN): string {
  const match = /^(wss|ws|https|http):\/\/([^/?#]+)/i.exec(wsUrl.trim());
  if (!match) return fallback;
  const secure = match[1].toLowerCase() === 'wss' || match[1].toLowerCase() === 'https';
  return `${secure ? 'https' : 'http'}://${match[2]}`;
}

/**
 * The same media URL, asked for a different rendering of it: `?view=text` for a document's words,
 * `?view=list` for an archive's entries. The separator is decided here because a native client's
 * URL already carries the device and its token, and the web's carries nothing.
 */
export function withView(url: string, view: 'text' | 'list'): string {
  return `${url}${url.includes('?') ? '&' : '?'}view=${view}`;
}

/**
 * Which full-screen viewer opens a file, in the explorer and in a chat bubble alike. Anything
 * else falls back to the download card: one rule, so every entry point agrees.
 *
 * `kind` is the server's verdict when the file came over the wire (docs/file-preview.md); a file
 * picked but not yet sent, and a turn replayed from a log older than `kind`, have only a name, and
 * `kindForName` reads it. The coarse `type` is the last resort, which is all any caller had before.
 */
export type ViewerKind = 'image' | 'svg' | 'text' | 'code' | 'video' | 'audio' | 'pdf' | 'html' | 'office' | 'archive' | 'file';

export function viewerFor(
  type: 'image' | 'audio' | 'video' | 'file',
  filename: string | undefined,
  kind?: FileKind,
): ViewerKind | null {
  const resolved = kind ?? kindForName(filename);
  switch (resolved) {
    case 'image':
      return 'image';
    case 'svg':
      return 'svg';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'markdown':
    case 'text':
      return 'text';
    // Everything readable that is not prose or markdown opens in the code reader, coloured by
    // its language. A CSV is read there too until it earns a table of its own.
    case 'code':
    case 'json':
    case 'csv':
      return 'code';
    // A page gets a preview rather than its source: the sandboxed WebView, no scripts, and the
    // server's own CSP behind it (2026-09-23).
    case 'html':
      return 'html';
    // Both travel as something the app can read: the server extracts a document's text and lists
    // an archive's entries (docs/file-preview.md).
    case 'office':
      return 'office';
    case 'archive':
      return 'archive';
    case 'binary':
      return null;
    case 'pdf':
      return 'pdf';
    default:
      break;
  }
  if (type === 'image') return 'image';
  if (type === 'video') return 'video';
  if (type === 'audio') return 'audio';
  const name = (filename ?? '').toLowerCase();
  if (name.endsWith('.md') || name.endsWith('.txt')) return 'text';
  return null;
}

// Built once. `toLocaleTimeString` builds a fresh Intl.DateTimeFormat on every call, and this runs
// once per visible row of every session, file and job list — it was the most expensive thing a row
// did. Locale changes need an app restart anyway, so there is nothing to invalidate.
const clockFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * A stamp as a row reads it: the clock for today, the shared day ladder past that.
 *
 * One ladder for the whole app (`dayLabel`, core/day.ts), so a session row, a file's date and a
 * day divider in the thread say the same thing: `Yesterday`, `3 days ago`, `Last week`, then the
 * date. It used to be a bare dd/MM here and nothing between today and the date.
 */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (dayOf(date.getTime()) === dayOf(Date.now())) return clockFormat.format(date);
  return dayLabel(dayOf(date.getTime()));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}



/**
 * How long something took, for whichever line in the thread says it.
 *
 * The one formater every counter shares: thinking spans, compaction, run spans, command waits,
 * tool cards, sub-agent cards. There were four, and the thread showed the same operation in a
 * different shape depending on where it was drawn -- the thinking one kept two decimals forever,
 * so a long compaction read `1m 19.68s` and a thirty-minute one `30m 12.53s`. The owner called
 * those "des chiffres après la virgule alors que le truc a duré 30 minutes" (2026-09-22).
 *
 * Decimals are a sub-ten-second tool: `2.3 s` tells a short phase from a rounding error, and past
 * that the fraction is noise. Past the hour the seconds go too, which is what `2 h 33 min` means.
 *
 * Under a second, milliseconds are the honest unit: a tool call that took 4 ms must not read
 * `0.1 s`, which overstates it twentyfold. And a tenth that says nothing is not printed at all:
 * `2 s`, never `2.0 s` -- the trailing zero was the "0-0" the owner called ugly (2026-09-22).
 */
export function formatSpan(ms: number): string {
  const safe = Math.max(0, ms);
  if (safe < 1_000) return `${Math.round(safe)} ms`;
  const seconds = safe / 1000;
  if (seconds < 10) {
    const tenths = Math.round(seconds * 10) / 10;
    return `${Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1)} s`;
  }
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole} s`;
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  if (whole < 3600) return rest > 0 ? `${minutes} min ${rest} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `${hours} h ${restMinutes} min` : `${hours} h`;
}

/**
 * How much of a one-line preview is worth building.
 *
 * Not a visual limit: the row that draws it is `flex: 1` with `numberOfLines={1}`, so the layout
 * clips at the pixel and adds its own ellipsis. This only keeps a tool called with a whole file as
 * its first argument from being flattened and measured in full. Far past what any row can show.
 */
export const PREVIEW_GUARD = 512;

/**
 * What a collapsed card knows about a call it has no table entry for.
 *
 * Two fields rather than one string, and that is the whole point: `text` is clipped by the row
 * that draws it, the count must not be. It used to be a ` +N` suffix appended past the guard,
 * so the very cut that shortened the preview also erased how much it was hiding. See
 * `docs/tool-preview.md`.
 */
export interface ArgsPreview {
  /** The first argument, flattened to one line. Where it ends is the layout's business. */
  text: string;
  /** How many arguments `text` does not show. Zero when it shows them all. */
  extraArgs: number;
}

/** One-line preview of tool arguments for the collapsed card. */
export function summarizeArgs(args: Record<string, unknown>): ArgsPreview {
  // The type says this is always an object; the wire does not. A tool card whose `args` never
  // arrived used to throw here and take the whole conversation down with it.
  if (!args || typeof args !== 'object') return { text: '', extraArgs: 0 };
  const entries = Object.entries(args);
  if (entries.length === 0) return { text: '', extraArgs: 0 };
  const first = entries[0]!;
  const value = typeof first[1] === 'string' ? first[1] : JSON.stringify(first[1]);
  const preview = (value ?? '').replace(/\s+/g, ' ').trim();
  return { text: preview.slice(0, PREVIEW_GUARD), extraArgs: entries.length - 1 };
}
