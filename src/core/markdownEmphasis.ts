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

  emStrong(src: string, maskedSrc: string, prevChar = ''): ReturnType<Tokenizer['emStrong']> {
    return (
      super.emStrong(src, maskedSrc, prevChar) ??
      (this.glued(src, [
        ['**', 'strong'],
        ['__', 'strong'],
        ['*', 'em'],
        ['_', 'em'],
      ]) as ReturnType<Tokenizer['emStrong']>)
    );
  }

  del(src: string, maskedSrc: string, prevChar = ''): ReturnType<Tokenizer['del']> {
    return super.del(src, maskedSrc, prevChar) ?? (this.glued(src, [['~~', 'del']]) as ReturnType<Tokenizer['del']>);
  }
}

/** One instance: the tokenizer is stateless between calls, and its `lexer` is set per parse. */
export const codeSpanEmphasis = new CodeSpanEmphasisTokenizer();
