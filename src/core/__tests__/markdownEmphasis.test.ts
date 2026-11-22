import { lexer, type Token } from 'marked';
import { codeSpanEmphasis } from '../markdownEmphasis';

/**
 * `**`output`**` came out as literal asterisks around plain monospace: an emphasis delimiter glued
 * to a code span was the one shape `marked` dropped, and it dropped it *only* under the React
 * Native Babel preset (the library's `\p{P}` ranges are rewritten, and its delimiter scan stops
 * pairing). These pin the shape, and pin that nothing else moved with it.
 *
 * Everything here runs the real `marked` under the real Jest transform, so a passing test means
 * the case survives the exact rewriting that caused the defect.
 */
function inline(md: string, tokenizer?: unknown): Token[] {
  const top = lexer(`${md}\n`, { gfm: true, tokenizer: tokenizer as never })[0] as { tokens?: Token[] };
  return top.tokens ?? [];
}

function kinds(md: string, tokenizer?: unknown): string[] {
  return inline(md, tokenizer).map(token => token.type);
}

describe('without the tokenizer, the defect is real', () => {
  // Not decoration: if `marked` ever fixes this itself, these assertions fail and the override
  // can go. A test that only checked the fixed side would never tell us.
  test.each(['**`x`**', '*`x`*', '__`x`__', '_`x`_'])('%s tokenizes as loose text and a span', md => {
    expect(kinds(md)).toEqual(['text', 'codespan', 'text']);
  });
});

describe('with it, emphasis around a code span is emphasis', () => {
  test.each([
    ['**`x`**', 'strong'],
    ['__`x`__', 'strong'],
    ['*`x`*', 'em'],
    ['_`x`_', 'em'],
    ['~~`x`~~', 'del'],
  ] as const)('%s becomes %s', (md, type) => {
    expect(kinds(md, codeSpanEmphasis)).toEqual([type]);
  });

  it('keeps the span a span, so the plate and its ink still apply', () => {
    const [strong] = inline('**`output`**', codeSpanEmphasis) as Array<Token & { tokens?: Token[] }>;
    expect(strong.type).toBe('strong');
    expect(strong.tokens?.map(token => token.type)).toEqual(['codespan']);
    expect((strong.tokens?.[0] as { text?: string })?.text).toBe('output');
  });

  it('keeps what precedes and follows it', () => {
    expect(kinds('garde **`output`** et `context`', codeSpanEmphasis)).toEqual([
      'text',
      'strong',
      'text',
      'codespan',
    ]);
  });

  it('takes the whole span when several sit inside one emphasis', () => {
    const [strong] = inline('**`a` `b`**', codeSpanEmphasis) as Array<Token & { tokens?: Token[] }>;
    expect(strong.type).toBe('strong');
    expect(strong.tokens?.map(token => token.type)).toEqual(['codespan', 'text', 'codespan']);
  });
});

describe('everything else stays on the library path', () => {
  // The override only claims a delimiter glued to a backtick run. These are the shapes a greedy
  // version would have stolen, and each one is a visible regression if it does.
  test.each([
    ['**bold**', ['strong']],
    ['**a** b', ['strong', 'text']],
    ['**a** et **b**', ['strong', 'text', 'strong']],
    ['**a *b* c**', ['strong']],
    ['snake_case_name', ['text']],
    ['a_b_c', ['text']],
    ['2 * 3 = 6', ['text']],
    ['5*3*2', ['text', 'em', 'text']],
    ['**non fini', ['text']],
    ['a `x` b', ['text', 'codespan', 'text']],
    ['`x`', ['codespan']],
    ['~~del~~', ['del']],
    ['a~~b~~c', ['text', 'del', 'text']],
  ] as const)('%s tokenizes as before', (md, expected) => {
    expect(kinds(md, codeSpanEmphasis)).toEqual([...expected]);
    expect(kinds(md, codeSpanEmphasis)).toEqual(kinds(md));
  });

  it('leaves a triple marker to the library rather than guessing a nesting', () => {
    // `***` is nested emphasis; the override must not read it as `**` plus a stray `*`.
    expect(kinds('***`x`***', codeSpanEmphasis)[0]).toBe(kinds('***`x`***')[0]);
  });

  it('never claims an escaped delimiter', () => {
    expect(kinds('\\*\\*`x`\\*\\*', codeSpanEmphasis)).toEqual(kinds('\\*\\*`x`\\*\\*'));
  });
});

describe('the plain fallback, for what Babel loses at a block start', () => {
  // `marked` under the RN preset leaves some emphasis as raw text at the start of a paragraph or
  // a list item (owner, 2026-11-22: "le gras reste littéral"). The fallback only runs when the
  // library answered nothing, so it is exercised directly here: `marked` in Node parses these and
  // the override never sees them.
  const fallback = codeSpanEmphasis as unknown as {
    lexer: { inlineTokens: (text: string) => Token[] };
    delimited: (src: string, delimiter: '**' | '__' | '*' | '_', type: 'strong' | 'em', prevChar: string) => { raw: string; type: string; text: string } | undefined;
  };
  beforeAll(() => {
    fallback.lexer = { inlineTokens: (text: string) => [{ type: 'text', raw: text } as Token] };
  });

  test('claims a spaced-out bold and stops at the closing delimiter', () => {
    expect(fallback.delimited("**Don't run it as-is** — it fails", '**', 'strong', '')).toMatchObject({
      type: 'strong',
      raw: "**Don't run it as-is**",
      text: "Don't run it as-is",
    });
  });

  test('refuses the shapes that are not emphasis', () => {
    // Prose with spaced asterisks, an underscore inside a word, a longer run, and an unclosed one.
    expect(fallback.delimited('2 ** 3 ** 4', '**', 'strong', '')).toBeUndefined();
    expect(fallback.delimited('**  leading space**', '**', 'strong', '')).toBeUndefined();
    expect(fallback.delimited('snake_case_name', '_', 'em', 'e')).toBeUndefined();
    expect(fallback.delimited('***both***', '**', 'strong', '')).toBeUndefined();
    expect(fallback.delimited('**unclosed', '**', 'strong', '')).toBeUndefined();
  });

  test('a bold that spans a code span keeps the span inside it', () => {
    const token = fallback.delimited('**`nextCursor` on the last page**', '**', 'strong', '');
    expect(token).toMatchObject({ type: 'strong', text: '`nextCursor` on the last page' });
  });
});
