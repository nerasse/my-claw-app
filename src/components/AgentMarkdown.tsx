import React, { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { Renderer, useMarkdown, type MarkedStyles } from 'react-native-marked';
import { isDangerousHtml } from '../core/markdownSafe';
import { CodeBlockBar } from './CodeBlockBar';
import { MarkdownTable } from './MarkdownTable';
import { font, lineBoxFor, lineHeightFor, space, useTheme, type Palette } from '../theme';

/**
 * How loud the prose is allowed to be.
 *
 * `body` is a message: the bubble's ink at reading size. `aside` is context about a message (the
 * model's reasoning, what a compaction kept) and must lose every contest with the answer, so it
 * renders one step down in size and in muted ink. Everything else -- the block rhythm, the
 * emoji-safe line box, the shrink rules -- is identical: an aside is quieter prose, not lesser
 * markdown.
 */
export type MarkdownTone = 'body' | 'aside';

function toneOf(palette: Palette, tone: MarkdownTone): { size: number; color: string } {
  return tone === 'aside'
    ? { size: font.small, color: palette.textMuted }
    : { size: font.body, color: palette.text };
}

/** Monospace runs sit one step under their prose, and never under the smallest size we ship. */
function codeSizeFor(size: number): number {
  return Math.max(font.micro, size - 2);
}

/**
 * @param prose The message being rendered: a run carrying an emoji must not pin its line box,
 * or the glyph is clamped away on the first or last line. See lineBoxFor.
 */
export function markedStyles(palette: Palette, prose = '', tone: MarkdownTone = 'body'): MarkedStyles {
  const { size, color } = toneOf(palette, tone);
  const box = lineBoxFor(size, prose);
  // The library flattens every style over its own regular base (16px, #333333); a span that
  // only states its emphasis inherits that base. Restate the full body so bold and italic
  // wear the bubble's ink and size, not the library's default gray.
  const bodyStyle = { fontSize: size, color, ...box };
  return {
    // Inline runs sit in the row that a list item builds (bullet, then content), so they must
    // yield width there or a long item would push its own line off the bubble.
    text: { fontSize: size, color, ...box, flexShrink: 1 },
    paragraph: { marginVertical: 2, flexShrink: 0 },
    strong: { ...bodyStyle, fontWeight: '700' },
    em: { ...bodyStyle, fontStyle: 'italic' },
    strikethrough: { ...bodyStyle, textDecorationLine: 'line-through' },
    // Headings scale with the prose they title rather than sitting at fixed points: at aside
    // size a fixed 18pt h1 would shout over the answer the aside is attached to.
    h1: { fontSize: size + 4, ...lineBoxFor(size + 4, prose), fontWeight: '700', color, marginTop: space.sm, marginBottom: space.xs },
    h2: { fontSize: size + 2, ...lineBoxFor(size + 2, prose), fontWeight: '700', color, marginTop: space.sm, marginBottom: space.xs },
    h3: { fontSize: size + 1, ...lineBoxFor(size + 1, prose), fontWeight: '600', color, marginTop: space.sm, marginBottom: 2 },
    h4: { fontSize: size, ...lineBoxFor(size, prose), fontWeight: '600', color, marginTop: space.xs, marginBottom: 2 },
    link: { ...bodyStyle, color: palette.accent, textDecorationLine: 'underline' },
    // An inline run is measured inside the line its prose builds, and Android gives that line
    // the metrics of whichever span states them. A codespan at its own size, with padding and
    // `overflow: hidden` to clip a rounded box, therefore shrank the line it landed in: rows
    // drew over each other and the grey box sat off its own glyphs. That was the compaction
    // summary and the reasoning being unreadable, both of them dense in code spans.
    //
    // So an inline run wears the prose metrics, always, and marks itself with the face and the
    // plate alone. The block form below is a node of its own and may still be smaller. The face
    // is stated in full because the library's base draws code in italic, and a path set in
    // italic monospace is the other half of why these blocks read as broken.
    codespan: {
      ...bodyStyle,
      fontFamily: 'monospace',
      fontStyle: 'normal',
      fontWeight: '400',
      backgroundColor: palette.surfaceAlt,
    },
    code: { backgroundColor: palette.codeBg, borderRadius: 6, marginVertical: space.xs, padding: space.sm, flexShrink: 0 },
    blockquote: {
      borderLeftWidth: 2,
      borderLeftColor: palette.border,
      paddingLeft: space.sm,
      marginVertical: space.xs,
      flexShrink: 0,
    },
    hr: { marginVertical: space.sm, borderBottomColor: palette.border },
    list: { marginVertical: 2, flexShrink: 0 },
    li: { fontSize: size, color, ...box },
    // The frame is drawn once by the container and once per inner edge, never twice on the same
    // line: MarkdownTable drops the trailing borders of the last row and the last column.
    table: {
      marginVertical: space.xs,
      flexShrink: 0,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 6,
      overflow: 'hidden',
    },
    tableRow: { borderBottomWidth: 1, borderBottomColor: palette.border },
    tableCell: { padding: space.xs, borderRightWidth: 1, borderRightColor: palette.border },
    image: { width: 200, height: 200, borderRadius: 6, marginVertical: space.xs },
  };
}

// The default renderer puts code blocks in a horizontal ScrollView (lines never wrap and the
// block looks cut on a phone). Chat bubbles render better with wrapped monospace text.
// Exported for the tests: `react-native-marked` is mocked in the suite, so the only honest way
// to exercise an override is to call it.
export class WrappingRenderer extends Renderer {
  constructor(
    private codeStyle: TextStyle,
    private typography: TextStyle,
  ) {
    super();
  }

  // A paragraph's inline runs are wrapped in a Text node that react-native-marked styles with
  // `{}`, dropping the sheet it was handed (Parser.getNormalizedSiblingNodesForBlockAndInline-
  // Tokens). Restating it keeps the wrapper on the same typography as the spans it holds. Only
  // typography: flexShrink belongs to the row a list item builds, and on this node -- a child of
  // the paragraph's column -- it would govern height and let the prose be crushed again.
  text(children: string | React.ReactNode[], styles?: TextStyle): React.ReactNode {
    return super.text(children, { ...this.typography, ...styles });
  }

  html(text: string | React.ReactNode[], styles?: TextStyle): React.ReactNode {
    if (typeof text === 'string' && isDangerousHtml(text)) return null;
    return super.html(text, styles);
  }

  // Not selectable, deliberately: a selection inside the chat list focuses its native text view,
  // and Android's ScrollView answers a focus by scrolling to it -- through the inversion, which
  // sends the thread flying. Taking text out of a message is the selection viewer's job.
  // See docs/text-selection.md.
  code(text: string, language?: string, containerStyle?: ViewStyle, textStyle?: TextStyle) {
    return (
      <View key={this.getKey()} style={containerStyle}>
        <CodeBlockBar value={text} language={language} />
        <Text style={[textStyle, styles.code, this.codeStyle]}>
          {text}
        </Text>
      </View>
    );
  }

  table(header: ReactNode[][], rows: ReactNode[][][], tableStyle?: ViewStyle, rowStyle?: ViewStyle, cellStyle?: ViewStyle): ReactNode {
    return <MarkdownTable key={this.getKey()} header={header} rows={rows} tableStyle={tableStyle} rowStyle={rowStyle} cellStyle={cellStyle} />;
  }
}

/**
 * Markdown for anything the agent wrote. `tone` picks the scale; see MarkdownTone.
 *
 * Both memos key on the tone as well as the text: the same string rendered as an aside is a
 * different sheet, and a stale one would draw the summary at full body size.
 */
export function AgentMarkdown({ text, tone = 'body' }: { text: string; tone?: MarkdownTone }): React.JSX.Element {
  const { palette } = useTheme();
  const mdStyles = useMemo(() => markedStyles(palette, text, tone), [palette, text, tone]);
  const renderer = useMemo(() => {
    const { size, color } = toneOf(palette, tone);
    const codeSize = codeSizeFor(size);
    return new WrappingRenderer(
      { color, fontSize: codeSize, lineHeight: lineHeightFor(codeSize) },
      { fontSize: size, color, ...lineBoxFor(size, text) },
    );
  }, [palette, text, tone]);
  const elements = useMarkdown(text, { styles: mdStyles, renderer });
  return <View style={styles.wrap}>{elements}</View>;
}

export const styles = StyleSheet.create({
  // Size and colour come from the renderer (they follow the tone); only the face is fixed here,
  // and it is stated in full because the library's base for code is italic.
  code: { fontFamily: 'monospace', fontStyle: 'normal' as const, fontWeight: '400' as const },
  // A bubble is a column, so flexShrink there governs height, not width. Letting the prose
  // yield meant an attachment above it (a rigid 190pt image) took the whole budget and squeezed
  // the words down to the top sliver of their first line. Prose keeps its natural height; the
  // bubble grows instead.
  wrap: { flexShrink: 0 },
});
