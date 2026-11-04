/**
 * A tool output that is a list, read as a table.
 *
 * `ls`, `search` and `web_search` all answer with rows, and the POC draws them as two columns
 * rather than as one monospace block the eye has to align itself. What matters here is the other
 * half: anything the parser does not recognise must keep the plain block, because a table that
 * invents rows out of a header or an error is worse than no table at all.
 */

import { toolRows } from '../toolRows';

describe('ls', () => {
  it('reads the kind and the path', () => {
    const rows = toolRows('ls', 'd src\nd src/llm\nf src/llm/resolver.ts\nf package.json');
    expect(rows).toEqual([
      { left: 'dir', text: 'src', mono: true },
      { left: 'dir', text: 'src/llm', mono: true },
      { left: 'file', text: 'src/llm/resolver.ts', mono: true },
      { left: 'file', text: 'package.json', mono: true },
    ]);
  });

  it('leaves a one-line answer alone: an empty directory is not a table', () => {
    expect(toolRows('ls', '(empty directory)')).toBeNull();
    expect(toolRows('ls', 'Directory not found: /nope. Check the path exists.')).toBeNull();
  });
});

describe('search', () => {
  // ripgrep prints `path:line:text`, and the server brackets the whole answer with a count above
  // and a paging note below. Only the hits are rows.
  it('reads content hits as file, line number and text', () => {
    const output = [
      '3 matching line(s)',
      'src/llm/resolver.ts:220:function mergedLimit(model?: ModelDef)',
      'src/llm/resolver.ts:245:  return model?.limit ?? merged.limit',
      'src/llm/limits.ts:88:const merged = pick(model, global)',
    ].join('\n');
    expect(toolRows('search', output)).toEqual([
      { left: 'resolver.ts', text: 'function mergedLimit(model?: ModelDef)', right: '220', mono: true },
      { left: 'resolver.ts', text: 'return model?.limit ?? merged.limit', right: '245', mono: true },
      { left: 'limits.ts', text: 'const merged = pick(model, global)', right: '88', mono: true },
    ]);
  });

  it('reads count mode as file and count', () => {
    const output = ['3 file(s) contain "mergedLimit"', 'src/a.ts:4', 'src/b.ts:6', 'src/c.ts:2'].join('\n');
    expect(toolRows('search', output)).toEqual([
      { left: 'a.ts', text: 'src/a.ts', right: '4', mono: true },
      { left: 'b.ts', text: 'src/b.ts', right: '6', mono: true },
      { left: 'c.ts', text: 'src/c.ts', right: '2', mono: true },
    ]);
  });

  it('reads files mode as one path per row', () => {
    const output = ['3 file(s) contain "mergedLimit"', 'src/a.ts', 'src/b.ts', 'docs/context.md'].join('\n');
    const rows = toolRows('search', output);
    expect(rows?.map(row => row.text)).toEqual(['src/a.ts', 'src/b.ts', 'docs/context.md']);
  });

  it('leaves a single hit alone, and a no-match sentence alone', () => {
    expect(toolRows('search', '1 matching line(s)\nsrc/a.ts:4:only')).toBeNull();
    expect(toolRows('search', 'No matches for "zzz" in src')).toBeNull();
  });
});

describe('web_search', () => {
  it('reads a numbered result as host, title and snippet', () => {
    const output = [
      '1. Rate limits · claude docs',
      '   URL: https://docs.anthropic.com/limits',
      '   Everything about limits',
      '',
      '2. usage_limit_reached exposes resets_at · #412',
      '   URL: https://github.com/x/y/issues/412',
      '   The header carries the reset',
    ].join('\n');
    expect(toolRows('web_search', output)).toEqual([
      { left: 'docs.anthropic.com', text: 'Rate limits · claude docs', sub: 'Everything about limits' },
      { left: 'github.com', text: 'usage_limit_reached exposes resets_at · #412', sub: 'The header carries the reset' },
    ]);
  });

  it('leaves the empty answer alone', () => {
    expect(toolRows('web_search', 'No results found for this query.')).toBeNull();
  });
});

describe('everything else', () => {
  it('is not sniffed: a tool with no rows renderer keeps its block', () => {
    // Two lines, no colon: this looks like a path list and must not become a table, because a
    // `bash` output is a shape we do not know.
    expect(toolRows('bash', 'hello\nworld')).toBeNull();
    expect(toolRows('read', 'src/a.ts\nsrc/b.ts')).toBeNull();
    expect(toolRows('ls', '')).toBeNull();
  });
});
