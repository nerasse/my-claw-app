/**
 * A tool output that is really a table, read as one.
 *
 * `ls`, `search` and `web_search` all answer with a list: a path and its line, a file and its
 * count, a site and its title. Drawn as one monospace block the eye has to find the columns
 * itself, which is the one thing a fixed-width block is worst at. The POC gives them a two-column
 * table and it is the densest, fastest form of the four it defines.
 *
 * Nothing here is validated against the server: each parser is a shape, the result is only used
 * when enough of the output actually has it, and everything else keeps the plain block. A tool
 * whose format changes, an MCP tool, an engine fallback banner, a paged result with its trailing
 * note -- all of it falls through to the block that already works.
 */

export interface ToolRow {
  /** The identifying end, in the faint ink: a file name, a host, a kind. */
  left: string;
  /** The row itself: a line of content, a title, a path. */
  text: string;
  /** The number that belongs on the right: a line number, a count. */
  right?: string;
  /** A second, quieter line under `text` (a search result's snippet). */
  sub?: string;
  /** Drawn in the monospace face: a line of code, a path. */
  mono?: boolean;
}

/** Last segment of a path. `/a/b/c.ts` -> `c.ts`, and a bare name is left alone. */
function baseName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : path;
}

/** How many of the candidate lines a parser must claim before the table is worth drawing. */
const MIN_ROWS = 2;
/** ...and what share of the output they must be, so a banner or a note cannot fake a table. */
const MIN_SHARE = 0.5;

/**
 * The rows a set of parsed lines justifies, or null.
 *
 * A `total` is what the parser was offered, not what it matched: a search answer is a header, the
 * hits and a trailing `[showing results 1-250 of 300]`, and only the hits are rows. Requiring two
 * of them keeps a two-line error from being dressed as a table, and the share check keeps a wall
 * of prose with one path in it from losing its block.
 */
function settle(rows: ToolRow[], total: number): ToolRow[] | null {
  if (rows.length < MIN_ROWS) return null;
  if (rows.length / Math.max(total, rows.length) < MIN_SHARE) return null;
  return rows;
}

/** `d src` / `f src/tools/bash.ts`, one entry per line. The server's `ls`. */
function parseListing(output: string): ToolRow[] | null {
  const lines = output.split('\n').filter(line => line !== '');
  if (lines.length === 0) return null;
  const rows: ToolRow[] = [];
  for (const line of lines) {
    const match = /^([df]) (.+)$/.exec(line);
    if (!match) return null;
    rows.push({ left: match[1] === 'd' ? 'dir' : 'file', text: match[2]!, mono: true });
  }
  return rows;
}

/**
 * `search`, in its three modes.
 *
 * Content mode prints `path:line:text` (ripgrep with `-n`), count mode `path:count`, and files
 * mode one path per line. The header the server puts above them (`12 matching line(s)`) and the
 * note it puts below (`[showing results 1-250 of 300. Continue with offset 250.]`) match none of
 * the three, which is exactly why the share check exists.
 */
function parseSearch(output: string): ToolRow[] | null {
  const lines = output.split('\n').filter(line => line.trim() !== '');
  if (lines.length === 0) return null;

  const content: ToolRow[] = [];
  const counted: ToolRow[] = [];
  const files: ToolRow[] = [];
  for (const line of lines) {
    const hit = /^(.+?):(\d+):(.*)$/.exec(line);
    if (hit) {
      content.push({ left: baseName(hit[1]!), text: hit[3]!.trim() || '(empty line)', right: hit[2], mono: true });
      continue;
    }
    const count = /^(.+?):(\d+)$/.exec(line);
    if (count) {
      counted.push({ left: baseName(count[1]!), text: count[1]!, right: count[2], mono: true });
      continue;
    }
    // A bare path: no colon, no bracket, and it looks like something a filesystem answered.
    if (!line.startsWith('[') && !/\s/.test(line.trim()) && line.includes('.')) {
      files.push({ left: baseName(line.trim()), text: line.trim(), mono: true });
    }
  }
  return settle(content, lines.length) ?? settle(counted, lines.length) ?? settle(files, lines.length);
}

/**
 * `web_search`: numbered results, each a title, its URL, then a snippet.
 *
 * The server prints `1. Title` / `   URL: https://…` / `   snippet`, blank line between results.
 * The host is the identifying end -- the same title can come from three sites, and that is the
 * one thing a reader picks a result by.
 */
function parseWebResults(output: string): ToolRow[] | null {
  if (!/^\d+\.\s/m.test(output)) return null;
  const blocks = output.split(/\n\s*\n/).filter(block => block.trim() !== '');
  const rows: ToolRow[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const head = /^(\d+)\.\s+(.*)$/.exec(lines[0] ?? '');
    if (!head) continue;
    const urlLine = lines.find(line => line.trim().startsWith('URL:'));
    const rest = lines
      .slice(1)
      .filter(line => !line.trim().startsWith('URL:'))
      .map(line => line.trim())
      .filter(Boolean);
    const host = urlLine ? /^https?:\/\/([^/?#]+)/i.exec(urlLine.trim().slice(4).trim())?.[1] ?? '' : '';
    rows.push({
      left: host,
      text: head[2]!.trim(),
      ...(rest.length > 0 ? { sub: rest.join(' ') } : {}),
    });
  }
  return settle(rows, blocks.length);
}

/**
 * The rows of one call, or null when its output is not a list.
 *
 * Keyed by tool name rather than sniffed across every tool: `bash echo 'a\nb'` is two lines that
 * happen to have no colon, and a `search` is a list by contract. The sniffing stays inside each
 * parser, where the shape is known.
 */
export function toolRows(name: string, output: string): ToolRow[] | null {
  if (!output.trim()) return null;
  if (name === 'ls') return parseListing(output);
  if (name === 'search') return parseSearch(output);
  if (name === 'web_search') return parseWebResults(output);
  return null;
}
