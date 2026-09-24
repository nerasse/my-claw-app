/**
 * A delimited file, read into rows -- a CSV is the one text format whose shape is the point.
 *
 * The separator is not assumed: a French export uses `;` and a tab-separated file uses a tab, so
 * the first line decides (whichever of `,`, `;`, `\t`, `|` appears most, outside quotes). Quoted
 * fields are handled the way every writer means them: a `"` inside a quoted field is doubled, and
 * a separator or a newline inside quotes is part of the value.
 *
 * Rows are capped: this is a reader, and a 200k-line export has to open on a phone. The cap is
 * announced by the caller, which is the honest half of a truncation.
 */

const CANDIDATES = [",", ";", "\t", "|"] as const;

export interface DelimitedTable {
  rows: string[][];
  separator: string;
  /** True when the file held more rows than the cap allowed through. */
  truncated: boolean;
}

/** Which of the candidates the first line uses most, ignoring anything inside quotes. */
export function detectSeparator(text: string): string {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  let best = ",";
  let bestCount = -1;
  for (const candidate of CANDIDATES) {
    let count = 0;
    let quoted = false;
    for (let index = 0; index < firstLine.length; index++) {
      const char = firstLine[index];
      if (char === '"') quoted = !quoted;
      else if (char === candidate && !quoted) count += 1;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function parseDelimited(text: string, maxRows = 400): DelimitedTable {
  const separator = detectSeparator(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let truncated = false;
  let index = 0;

  const endField = (): void => {
    row.push(field);
    field = "";
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = true;
      index += 1;
      continue;
    }
    if (char === separator) {
      endField();
      index += 1;
      continue;
    }
    if (char === "\r") {
      index += 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      if (rows.length >= maxRows) {
        truncated = true;
        break;
      }
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }
  // A file that does not end on a newline still has a last row.
  if (!truncated && (field !== "" || row.length > 0)) endRow();

  return { rows, separator, truncated };
}
