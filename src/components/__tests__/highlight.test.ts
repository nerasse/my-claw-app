/**
 * Fenced blocks are coloured from the editor's own parser table, and the one invariant that
 * matters is that colour never rewrites text: the runs must join back to the source exactly.
 * The parsers are the real ones here (the code editor's table), so this doubles as proof that
 * a fenced 'ts' or 'bash' block finds a grammar at all -- including the stream-mode languages,
 * whose tags only attach inside an editor's state.
 */

import { codeTokens, type CodeToken } from '../codeeditor/highlight';
import { languageForFence } from '../codeeditor/languages';

function joined(runs: CodeToken[] | null): string | null {
  return runs ? runs.map(run => run.text).join('') : null;
}

describe('languageForFence', () => {
  it('reads the first word of the info string', () => {
    expect(languageForFence('ts title="a.ts"')).toBe('typescript');
    expect(languageForFence('bash')).toBe('shell');
    expect(languageForFence('  Json  ')).toBe('json');
  });

  it('maps the common shorthands', () => {
    expect(languageForFence('sh')).toBe('shell');
    expect(languageForFence('yml')).toBe('yaml');
    expect(languageForFence('py')).toBe('python');
  });

  it('claims nothing for a fence nobody parses', () => {
    expect(languageForFence(undefined)).toBeNull();
    expect(languageForFence('')).toBeNull();
    expect(languageForFence('output')).toBeNull();
  });
});

describe('codeTokens', () => {
  it('colours a typescript block without rewriting a character', () => {
    const source = 'const answer: number = 42; // the point\n';
    const runs = codeTokens(source, 'ts');
    expect(joined(runs)).toBe(source);
    expect(runs?.some(run => run.cls === 'kw')).toBe(true);
    expect(runs?.some(run => run.cls === 'num')).toBe(true);
    expect(runs?.some(run => run.cls === 'com')).toBe(true);
  });

  it('colours a shell block from the legacy stream parser', () => {
    const source = 'echo "hello" # note\n';
    const runs = codeTokens(source, 'bash');
    expect(joined(runs)).toBe(source);
    expect(runs?.some(run => run.cls === 'str')).toBe(true);
    expect(runs?.some(run => run.cls === 'com')).toBe(true);
  });

  it('gives nothing back for a fence with no grammar', () => {
    expect(codeTokens('just words', 'output')).toBeNull();
    expect(codeTokens('just words', undefined)).toBeNull();
  });
});
