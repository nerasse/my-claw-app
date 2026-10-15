import React, { type ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { EditorState } from '@codemirror/state';
import { ensureSyntaxTree, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { highlightCode, tagHighlighter, tags } from '@lezer/highlight';
import { languageExtension, languageForFence } from './languages';
import type { Palette } from '../../theme';

/**
 * Fenced blocks, parsed once and drawn in ink.
 *
 * The parsers are the editor's own table (`languages.ts`), so a '```ts' block is coloured by the
 * grammar the code editor would use and the two surfaces cannot disagree about what a keyword
 * is. The parse happens outside any editor: a throwaway `EditorState` whose only job is the
 * syntax tree, because that is where a stream-mode language (shell, diff...) attaches its tags
 * at all. Cheap at the size a message carries, and cached below, since a streaming answer
 * re-renders every block it holds on each delta.
 *
 * The output is runs of the original text with a class, never rewritten text: `codeTokens` holds
 * the runs to the source it was given, and a mismatch drops the colour rather than a character.
 */

export type TokenClass = 'kw' | 'str' | 'num' | 'com' | 'inv';

export interface CodeToken {
  text: string;
  cls: TokenClass | null;
}

/** Which tags matter, and under which class. Everything unmapped keeps the prose ink. */
const HIGHLIGHT = tagHighlighter([
  { tag: [tags.keyword, tags.bool, tags.null, tags.atom, tags.self, tags.modifier], class: 'kw' },
  { tag: [tags.string, tags.special(tags.string)], class: 'str' },
  { tag: tags.number, class: 'num' },
  // The base tag, so both spellings are caught: `lineComment` and friends derive from it, and
  // a spec on a derived tag never matches a node tagged with the base one (a legacy stream
  // mode's comments arrive as plain `comment`).
  { tag: tags.comment, class: 'com' },
  { tag: tags.invalid, class: 'inv' },
]);

const KNOWN: ReadonlySet<string> = new Set(['kw', 'str', 'num', 'com', 'inv']);

function classOf(classes: string): TokenClass | null {
  for (const cls of classes.split(' ')) {
    if (KNOWN.has(cls)) return cls as TokenClass;
  }
  return null;
}

/** The last few blocks asked for, keyed by language and source. Bounded, oldest out first. */
const CACHE_LIMIT = 40;
const cache = new Map<string, CodeToken[] | null>();

function tokenize(code: string, id: string): CodeToken[] | null {
  try {
    const state = EditorState.create({
      doc: code,
      extensions: [languageExtension(id), syntaxHighlighting(HIGHLIGHT)],
    });
    // Past a quarter second the parse is abandoned and the plain tree is used: an unfinished
    // walk just leaves the tail uncoloured, and a message must never wait on its own colours.
    const tree = ensureSyntaxTree(state, code.length, 250) ?? syntaxTree(state);
    const out: CodeToken[] = [];
    highlightCode(
      code,
      tree,
      HIGHLIGHT,
      (text, classes) => out.push({ text, cls: classOf(classes) }),
      () => out.push({ text: '\n', cls: null }),
    );
    return out.map(token => token.text).join('') === code ? out : null;
  } catch {
    return null;
  }
}

/** The runs of a fenced block, or null when the fence names nothing this table parses. */
export function codeTokens(code: string, fence: string | null | undefined): CodeToken[] | null {
  const id = languageForFence(fence);
  if (!id) return null;
  const key = `${id}\u0000${code}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const tokens = tokenize(code, id);
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, tokens);
  return tokens;
}

export type TokenColors = Partial<Record<TokenClass, string>>;

/** The palette's ink for each class. Here rather than in the sheets, so the chat and the reader agree. */
export function tokenColors(palette: Palette): TokenColors {
  return { kw: palette.accent, str: palette.ok, num: palette.warn, com: palette.textFaint, inv: palette.danger };
}

/**
 * The children a fenced block's Text draws: the tokens with their ink, or the plain string when
 * there is no colour to give (no fence, unknown language, parser failure). Comments lean and
 * nothing else does; the monospace face and the size stay the caller's.
 */
export function highlighted(value: string, fence: string | null | undefined, colors: TokenColors | undefined): ReactNode {
  if (!colors) return value;
  const tokens = codeTokens(value, fence);
  if (!tokens) return value;
  return tokens.map((token, index) =>
    token.cls ? (
      <Text key={index} style={[token.cls === 'com' ? styles.comment : null, { color: colors[token.cls] }]}>
        {token.text}
      </Text>
    ) : (
      token.text
    ),
  );
}

const styles = StyleSheet.create({
  comment: { fontStyle: 'italic' },
});
