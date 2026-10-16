import React, { type ReactNode } from 'react';

/**
 * The text a rendered node will draw, whatever nesting the inline renderer wrapped it in.
 *
 * Shared by the table (a column is as wide as what it holds) and the quote bar (what a copy
 * takes): both ask the element tree, and both must read the same answer.
 */
export function plainText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(plainText).join('');
  if (React.isValidElement(node)) return plainText((node.props as { children?: ReactNode }).children);
  return '';
}

/**
 * The text of a blockquote's children: what a reader gets when they copy a quote, and the reason
 * it is not the raw source. The `>` prefixes are syntax, not words -- pasted into a message or a
 * shell they are noise, and neither the thread nor the document ever showed them.
 *
 * One block to a paragraph, so a two-paragraph quote does not paste as one run-on line; a soft
 * wrap (a `>`-quoted sentence carried over several source lines) pastes as the space it reads
 * as, not as the break it was written with; a list keeps its items on their own lines with a
 * marker restored (the library draws markers from its own props, so they are not in the tree to
 * walk -- the elements are rebuilt here instead). Code and tool output keep their line breaks:
 * a fold (`ScrollableBlock`) marks its subtree verbatim. Blank blocks drop out; a quote that
 * yields nothing (it held only a table, say) gets no bar.
 */
export function quoteText(children: ReactNode): string {
  return (Array.isArray(children) ? children : [children])
    .map(block => blockText(block).trim())
    .filter(text => text.length > 0)
    .join('\n\n');
}

function blockText(node: ReactNode, verbatim = false): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') {
    const text = String(node);
    // A quote written across source lines carries soft wraps (markdown renders them as spaces);
    // pasted as newlines they cut the sentence again wherever it lands. Code and tool output
    // travel verbatim -- a fold (`ScrollableBlock`) marks its subtree, line breaks are content
    // there.
    return verbatim ? text : text.replace(/[ \t]*\n[ \t]*/g, ' ');
  }
  if (Array.isArray(node)) return node.map(child => blockText(child, verbatim)).join('');
  if (!React.isValidElement(node)) return '';
  const props = node.props as { li?: ReactNode[]; ordered?: boolean; title?: unknown; children?: ReactNode };
  if (Array.isArray(props.li)) {
    return props.li
      .map((item, index) => {
        const text = blockText(item, verbatim).trim();
        if (!text) return '';
        return `${props.ordered ? `${index + 1}.` : '-'} ${text}`;
      })
      .filter(Boolean)
      .join('\n');
  }
  return blockText(props.children, verbatim || typeof props.title === 'string');
}
