import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { Palette } from '../theme';
import { useThemedStyles } from '../theme';

/**
 * Minimal unified-diff renderer, opencode-v2 style: added lines green, removed lines red,
 * context lines muted, `---`/`+++` file headers and `@@` hunk headers as faint label rows.
 *
 * The server appends the diff to the apply_patch output after the `Patched ...` summary line,
 * so the parser only recognises a diff when it sees a `--- a/...` header, a `+++ b/...` header
 * and then hunk lines. Anything before the first `---` (the summary) is rendered as plain
 * monospace text, and anything after the diff that is not a diff line is appended as plain text.
 */

type DiffKind = 'add' | 'del' | 'ctx' | 'hunk' | 'file' | 'plain';

interface DiffLine {
  kind: DiffKind;
  text: string;
}

const HUNK_RE = /^@@ .* @@$/;

/** Split a tool output into the plain-text preamble, an optional diff body, and the tail. */
export function splitDiff(output: string): { preamble: string; diff: DiffLine[]; tail: string } {
  const lines = output.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.startsWith('--- a/') || l.startsWith('--- ')) {
      // Make sure a `+++ b/` header follows (a path could theoretically start with three dashes
      // in some unrelated output, but an apply_patch result is always a full diff).
      if (i + 1 < lines.length && lines[i + 1]!.startsWith('+++ ')) {
        start = i;
        break;
      }
    }
  }
  if (start < 0) return { preamble: output, diff: [], tail: '' };

  const diff: DiffLine[] = [];
  let tailStart = lines.length;
  for (let i = start; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.startsWith('--- ') || l.startsWith('+++ ')) {
      diff.push({ kind: 'file', text: l });
    } else if (HUNK_RE.test(l)) {
      diff.push({ kind: 'hunk', text: l });
    } else if (l.startsWith('+')) {
      diff.push({ kind: 'add', text: l.slice(1) });
    } else if (l.startsWith('-')) {
      diff.push({ kind: 'del', text: l.slice(1) });
    } else if (l.startsWith(' ')) {
      diff.push({ kind: 'ctx', text: l.slice(1) });
    } else {
      // First non-diff line terminates the diff body; the rest is a plain tail (e.g. the
      // `edits[i]: N occurrence(s) replaced` lines).
      tailStart = i;
      break;
    }
  }
  return {
    preamble: lines.slice(0, start).join('\n'),
    diff,
    tail: lines.slice(tailStart).join('\n'),
  };
}

export type DiffParts = {
  preamble: string;
  diff: DiffLine[];
  tail: string;
};

export const DiffView: React.FC<{ parts: DiffParts }> = ({ parts }) => {
  const styles = useThemedStyles(createStyles);
  const { preamble, diff, tail } = parts;
  if (diff.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        {preamble ? (
          <Text style={styles.plain}>{preamble}</Text>
        ) : null}
        {diff.map((line, idx) => {
          switch (line.kind) {
            case 'add':
              return (
                <Text key={idx} style={[styles.line, styles.add]}>
                  {`+${line.text}`}
                </Text>
              );
            case 'del':
              return (
                <Text key={idx} style={[styles.line, styles.del]}>
                  {`-${line.text}`}
                </Text>
              );
            case 'hunk':
              return (
                <Text key={idx} style={[styles.line, styles.hunk]}>
                  {line.text}
                </Text>
              );
            case 'file':
              return (
                <Text key={idx} style={[styles.line, styles.file]}>
                  {line.text}
                </Text>
              );
            default:
              return (
                <Text key={idx} style={[styles.line, styles.ctx]}>
                  {line.text}
                </Text>
              );
          }
        })}
        {tail ? <Text style={styles.plain}>{tail}</Text> : null}
      </View>
    </ScrollView>
  );
};

const createStyles = (palette: Palette) => ({
  plain: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: palette.textMuted,
    paddingHorizontal: 10,
    paddingTop: 6,
  },
  line: {
    fontFamily: 'monospace',
    fontSize: 12,
    paddingHorizontal: 10,
    lineHeight: 17,
  },
  add: {
    color: palette.diffAdd,
    backgroundColor: palette.diffAddBg,
  },
  del: {
    color: palette.diffDel,
    backgroundColor: palette.diffDelBg,
  },
  ctx: {
    color: palette.textMuted,
  },
  hunk: {
    color: palette.textMuted,
    backgroundColor: palette.diffHunkBg,
  },
  file: {
    color: palette.textMuted,
    backgroundColor: palette.diffHunkBg,
    fontWeight: '600' as const,
  },
});
