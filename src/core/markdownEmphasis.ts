import { Tokenizer } from 'marked';

/**
 * The one emphasis shape `marked` loses, and why we carry a tokenizer to get it back.
 *
 * `**`output`**` is how a model marks a code span it wants read as emphasis, and it is how the
 * owner writes one too. `marked` 18 tokenizes it as raw text: `text("**")`, `codespan`,
 * `text("**")`. The asterisks stay on screen, around monospace that is not bold.
 *
 * The library's `emStrong` decides whether an opening delimiter may open at all by asking, at
 * `s[4] && prevChar.match(unicodeAlphaNumeric)`, what the character *before* it was, and it
 * explores the closing delimiters with a regex built from `\p{P}` / `\p{S}`. Under the React
 * Native Babel preset those property escapes are rewritten into explicit Unicode ranges, and the
 * two sides stop agreeing: the delimiters around a code span never pair. The same source, run by
 * Node, tokenizes it correctly -- which is why this has to be fixed here rather than reported
 * upstream and waited on.
 *
 * The override is deliberately narrow. It only claims a source that *starts* with a delimiter
 * glued to a backtick run, because that is the shape the library drops:
 *
 *   - `**bold**`, `*a*`, `***both***` and every other case still go through `marked`'s own
 *     `emStrong` untouched (it answers first, and this only runs when it answers nothing);
 *   - intraword underscores stay text: `snake_case_name` has no backtick after the delimiter,
 *     so nothing here claims it.
 *
 * The inner run is handed back to the lexer, so a code span inside emphasis is still a code span:
 * it renders as the plate it is, only bold or italic with the emphasis that wraps it.
 */
export class CodeSpanEmphasisTokenizer extends Tokenizer {
  /**
   * A delimiter glued to a code span, as a token of `type`. Undefined as soon as the source does
   * not open that way, which is the common case and the reason this stays cheap.
   */
  private glued(src: string, pairs: ReadonlyArray<readonly [string, 'strong' | 'em' | 'del']>): unknown {
    for (const [delimiter, type] of pairs) {
      if (!src.startsWith(delimiter)) continue;
      const ticks = /^`+/.exec(src.slice(delimiter.length))?.[0];
      // No backtick right after the opening delimiter: not the shape this exists for. A longer
      // run of the same marker (`***`) is left to the library, which reads it as nested emphasis.
      if (!ticks) return undefined;
      if (src[delimiter.length + ticks.length] === delimiter[0]) return undefined;
      const closing = ticks + delimiter;
      const at = src.indexOf(closing, delimiter.length + ticks.length);
      if (at < 0) return undefined;
      // The span is the whole backticked run, delimiters excluded: `**`x`**` holds `` `x` ``.
      const span = src.slice(delimiter.length, at + ticks.length);
      if (!span.trim()) return undefined;
      return {
        type,
        raw: src.slice(0, at + closing.length),
        text: span,
        tokens: this.lexer.inlineTokens(span),
      };
    }
    return undefined;
  }

  /**
   * A plain `**bold**` (or `*em*`) the library failed to see.
   *
   * The Babel-rewritten `\p{P}` / `\p{S}` classes do not only cost the code-span shape: on the
   * React Native build, a piece of emphasis that opens a paragraph or a list item is sometimes
   * left as raw text as well, and the thread shows the asterisks (owner, 2026-11-22: "le gras reste
   * littéral"). The same source tokenizes correctly in Node, so this is the same class of bug as
   * the one above, and it is claimed the same way: after the library answers nothing.
   *
   * CommonMark's spacing rules are kept, because the fallback must not turn prose into emphasis:
   * the opening delimiter may not be followed by a space, the closing one may not be preceded by
   * one, and `_` never opens or closes inside a word. A longer run (`***`) and an escaped
   * delimiter are left to the library.
   */
  private delimited(src: string, delimiter: '**' | '__' | '*' | '_', type: 'strong' | 'em', prevChar: string): unknown {
    if (!src.startsWith(delimiter)) return undefined;
    // `***both***` is the library's business: nested emphasis has its own rules.
    if (src[delimiter.length] === delimiter[0]) return undefined;
    // An underscore inside a word is not emphasis (`snake_case_name`).
    if (delimiter[0] === '_' && /[\p{L}\p{N}]/u.test(prevChar)) return undefined;
    const openAt = delimiter.length;
    if (!src[openAt] || /\s/.test(src[openAt]!)) return undefined;
    let at = src.indexOf(delimiter, openAt + 1);
    while (at > 0) {
      const before = src[at - 1]!;
      const after = src[at + delimiter.length];
      const closesInsideWord = delimiter[0] === '_' && after !== undefined && /[\p{L}\p{N}]/u.test(after);
      if (!/\s/.test(before) && !closesInsideWord && at > openAt) break;
      at = src.indexOf(delimiter, at + 1);
    }
    if (at < 0) return undefined;
    const span = src.slice(openAt, at);
    if (!span.trim()) return undefined;
    return {
      type,
      raw: src.slice(0, at + delimiter.length),
      text: span,
      tokens: this.lexer.inlineTokens(span),
    };
  }

  emStrong(src: string, maskedSrc: string, prevChar = ''): ReturnType<Tokenizer['emStrong']> {
    return (
      super.emStrong(src, maskedSrc, prevChar) ??
      (this.glued(src, [
        ['**', 'strong'],
        ['__', 'strong'],
        ['*', 'em'],
        ['_', 'em'],
      ]) as ReturnType<Tokenizer['emStrong']>) ??
      (this.delimited(src, '**', 'strong', prevChar) as ReturnType<Tokenizer['emStrong']>) ??
      (this.delimited(src, '__', 'strong', prevChar) as ReturnType<Tokenizer['emStrong']>) ??
      (this.delimited(src, '*', 'em', prevChar) as ReturnType<Tokenizer['emStrong']>) ??
      (this.delimited(src, '_', 'em', prevChar) as ReturnType<Tokenizer['emStrong']>)
    );
  }

  del(src: string, maskedSrc: string, prevChar = ''): ReturnType<Tokenizer['del']> {
    return super.del(src, maskedSrc, prevChar) ?? (this.glued(src, [['~~', 'del']]) as ReturnType<Tokenizer['del']>);
  }
}

/** One instance: the tokenizer is stateless between calls, and its `lexer` is set per parse. */
export const codeSpanEmphasis = new CodeSpanEmphasisTokenizer();
