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
export function httpOrigin(wsUrl: string, fallback = 'http://10.10.20.10:8080'): string {
  const match = /^(wss|ws|https|http):\/\/([^/?#]+)/i.exec(wsUrl.trim());
  if (!match) return fallback;
  const secure = match[1].toLowerCase() === 'wss' || match[1].toLowerCase() === 'https';
  return `${secure ? 'https' : 'http'}://${match[2]}`;
}

/**
 * Which full-screen viewer opens a file, in the explorer and in a chat bubble alike. Anything
 * else falls back to the download card: one rule, so both entry points agree.
 */
export function viewerFor(
  type: 'image' | 'audio' | 'video' | 'file',
  filename: string | undefined,
): 'image' | 'text' | 'video' | null {
  if (type === 'image') return 'image';
  if (type === 'video') return 'video';
  const name = (filename ?? '').toLowerCase();
  if (name.endsWith('.md') || name.endsWith('.txt')) return 'text';
  return null;
}

// Built once. `toLocaleTimeString` builds a fresh Intl.DateTimeFormat on every call, and this runs
// once per visible row of every session, file and job list — it was the most expensive thing a row
// did. Locale changes need an app restart anyway, so there is nothing to invalidate.
const clockFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit' });

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const sameDay =
    date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  return sameDay ? clockFormat.format(date) : dayFormat.format(date);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms?: number): string {
  if (typeof ms !== 'number') return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  return `${Math.floor(ms / 60_000)}m${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}s`;
}

/** One-line preview of tool arguments for the collapsed card. */
export function summarizeArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  const first = entries[0]!;
  const value = typeof first[1] === 'string' ? first[1] : JSON.stringify(first[1]);
  const preview = (value ?? '').replace(/\s+/g, ' ').trim();
  const suffix = entries.length > 1 ? ` +${entries.length - 1}` : '';
  return `${preview.slice(0, 60)}${preview.length > 60 ? '…' : ''}${suffix}`;
}
