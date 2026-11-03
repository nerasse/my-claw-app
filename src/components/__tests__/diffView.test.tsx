/**
 * Unified-diff rendering for apply_patch results.
 *
 * The server appends a `--- a/...` / `+++ b/...` / `@@ -a,b +c,d @@` block to the tool output.
 * The card must render that block colour-coded (green additions, red removals) instead of a flat
 * monospace blob, and keep the `Patched ...` preamble plus the `edits[i]: ...` tail as plain text.
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { DiffView, diffCounts, splitDiff } from '../DiffView';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';

const DIFF_OUTPUT = [
  'Patched /home/neras/dev/x.ts (1 edit, with 4 added lines and 2 removed lines)',
  '--- a/home/neras/dev/x.ts',
  '+++ b/home/neras/dev/x.ts',
  '@@ -10,3 +10,5 @@',
  ' export const a = 1;',
  '-export const b = 2;',
  '+export const b = 3;',
  '+export const c = 4;',
  ' export const d = 5;',
  'edits[0]: 1 occurrence replaced',
].join('\n');

function render(node: React.ReactNode): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
        {node}
      </ThemeContext.Provider>,
    );
  });
  return tree;
}

describe('splitDiff', () => {
  it('keeps the preamble and the tail separate from the diff body', () => {
    const { preamble, diff, tail } = splitDiff(DIFF_OUTPUT);
    expect(preamble).toContain('Patched /home/neras/dev/x.ts');
    expect(tail).toContain('edits[0]: 1 occurrence replaced');
    expect(diff.map(d => d.kind)).toEqual([
      'file',
      'file',
      'hunk',
      'ctx',
      'del',
      'add',
      'add',
      'ctx',
    ]);
    expect(diff[4]!.text).toBe('export const b = 2;');
    expect(diff[5]!.text).toBe('export const b = 3;');
  });

  // git appends the enclosing function to a hunk header, and so does every diff copied out of a
  // terminal. Anchored on a trailing `@@` the header matched only our own patcher's output: a real
  // patch ended at its first hunk, so the card drew it as plain grey text with no counter -- which
  // is exactly what the owner saw on a patch that had applied fine.
  it('recognises a hunk header that names the enclosing function', () => {
    const output = [
      '--- a/src/llm/resolver.ts',
      '+++ b/src/llm/resolver.ts',
      '@@ -243,8 +243,14 @@ function mergedLimit',
      '   const merged = { ...config.llm.limit }',
      '-  return model?.limit ?? merged.limit',
      '+  if (model?.limit?.context) merged.context = model.limit.context',
      '+  return merged',
    ].join('\n');
    const { diff } = splitDiff(output);
    expect(diff.map(d => d.kind)).toEqual(['file', 'file', 'hunk', 'ctx', 'del', 'add', 'add']);
    expect(diffCounts(diff)).toEqual({ added: 2, removed: 1 });
  });

  it('returns an empty diff for an output without a diff', () => {
    const { diff, preamble } = splitDiff('nothing to see here');
    expect(diff).toHaveLength(0);
    expect(preamble).toBe('nothing to see here');
  });

  it('does not mistake a lone leading --- for a diff', () => {
    const { diff } = splitDiff('---\nsome text\n---\nmore');
    expect(diff).toHaveLength(0);
  });
});

describe('DiffView', () => {
  it('renders additions and removals with the diff colours', () => {
    const tree = render(<DiffView parts={splitDiff(DIFF_OUTPUT)} />);
    const texts = tree.root
      .findAllByType(Text)
      .map(t => t.props.children)
      .filter((v): v is string => typeof v === 'string');
    expect(texts).toContain('+export const c = 4;');
    expect(texts).toContain('-export const b = 2;');
    const add = tree.root.findAllByType(Text).find(t => t.props.children === '+export const c = 4;');
    const del = tree.root.findAllByType(Text).find(t => t.props.children === '-export const b = 2;');
    expect(add?.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: lightPalette.diffAdd })]),
    );
    expect(del?.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: lightPalette.diffDel })]),
    );
  });

  it('renders nothing when the output has no diff', () => {
    const tree = render(<DiffView parts={splitDiff('plain text')} />);
    expect(tree.root.findAllByType(Text)).toHaveLength(0);
  });
});
