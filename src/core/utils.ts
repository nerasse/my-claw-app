export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r % 4) + 8;
    return v.toString(16);
  });
}

export function httpOrigin(wsUrl: string, fallback = 'http://10.10.20.10:8080'): string {
  try {
    const url = new URL(wsUrl);
    return `${url.protocol === 'wss:' ? 'https' : 'http'}://${url.host}`;
  } catch {
    return fallback;
  }
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const sameDay =
    date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
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
