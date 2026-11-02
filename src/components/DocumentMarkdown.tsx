import React, { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { Renderer, useMarkdown, type MarkedStyles } from 'react-native-marked';
import { isDangerousHtml } from '../core/markdownSafe';
import { useDocFontScale } from '../core/docZoom';
import { CodeBlockBar } from './CodeBlockBar';
import { MarkdownTable } from './MarkdownTable';
import { MarkdownList } from './MarkdownList';
import { QuoteBar } from './QuoteBar';
import { quoteText } from './markdownText';
import { highlighted, tokenColors } from './codeeditor/highlight';
import { EMPTY_INK, type MarkdownInk } from './markdownInk';
import { font, lineHeightFor, space, useTheme, type Palette } from '../theme';

/** Document body: a fullscreen reader, not a chat bubble, so one size above the chat. */
const DOC_FONT_SIZE = 15;
const DOC_LINE_HEIGHT = 23;

/** Every size of the document sheet, moved by the reader's zoom. */
function scaled(scale: number, size: number, lineHeight: number): { fontSize: number; lineHeight: number } {
  return { fontSize: Math.round(size * scale), lineHeight: Math.round(lineHeight * scale) };
}

/**
 * Document typography for the full-screen viewers (text viewer, skill reader): the GitHub
 * markdown conventions transposed onto the app palette -- a real heading hierarchy with
 * breathing room, bordered quotes, tables, and code that reads like code. Every key of
 * MarkedStyles is covered on purpose: anything left out falls back to the package defaults,
 * which were tuned for a web-like demo (italic code spans, 32pt headings) and show up in a
 * chat app as "moche".
 */
export function documentMarkdownStyles(palette: Palette, scale = 1): MarkedStyles {
  // The library flattens every style over its own regular base (16px, #333333); a span that
  // only states its emphasis inherits that base and renders off-palette -- bold as dark gray
  // in dark mode. Every inline style restates the body fully.
  const body = { ...scaled(scale, DOC_FONT_SIZE, DOC_LINE_HEIGHT), color: palette.text };
  return {
    text: body,
    paragraph: { paddingVertical: 6 },
    strong: { ...body, fontWeight: '700' },
    em: { ...body, fontStyle: 'italic' },
    strikethrough: { ...body, textDecorationLine: 'line-through' },
    link: { ...body, color: palette.accent, textDecorationLine: 'underline' },
    h1: {
      ...scaled(scale, 24, 30),
      fontWeight: '700',
      color: palette.text,
      marginTop: space.xl,
      marginBottom: space.sm,
      paddingBottom: space.sm,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    h2: {
      ...scaled(scale, 20, 26),
      fontWeight: '700',
      color: palette.text,
      marginTop: space.xl,
      marginBottom: space.sm,
      paddingBottom: space.xs,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    h3: {
      ...scaled(scale, 17, 23),
      fontWeight: '600',
      color: palette.text,
      marginTop: space.lg,
      marginBottom: space.xs,
    },
    h4: {
      ...scaled(scale, 15, 21),
      fontWeight: '600',
      color: palette.text,
      marginTop: space.lg,
      marginBottom: space.xs,
    },
    h5: {
      ...scaled(scale, font.body, 20),
      fontWeight: '600',
      color: palette.textMuted,
      marginTop: space.md,
      marginBottom: 2,
    },
    h6: {
      ...scaled(scale, font.small, 18),
      fontWeight: '600',
      color: palette.textMuted,
      marginTop: space.md,
      marginBottom: 2,
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: palette.accent,
      backgroundColor: palette.surfaceAlt,
      borderRadius: 4,
      paddingLeft: space.md,
      paddingRight: space.sm,
      paddingVertical: space.xs,
      marginVertical: space.sm,
    },
    // Prose metrics, not its own: a smaller line height on an inline span shrinks the whole
    // line on Android and the rows around it end up drawn on top of each other. The face, the
    // ink and the plate are the only things a code span may state. See AgentMarkdown.
    codespan: {
      ...body,
      fontFamily: 'monospace',
      backgroundColor: palette.codeBg,
      fontStyle: 'normal',
      fontWeight: '400',
      color: palette.codeText,
    },
    code: {
      backgroundColor: palette.codeBg,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 8,
      padding: space.md,
      marginVertical: space.sm,
    },
    hr: { marginVertical: space.lg, borderBottomWidth: 1, borderBottomColor: palette.border },
    list: { marginVertical: 4 },
    li: { ...body, marginVertical: 2 },
    image: { width: '100%', height: 240, borderRadius: 8, marginVertical: space.sm },
    table: {
      marginVertical: space.sm,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 6,
      overflow: 'hidden',
    },
    tableRow: { borderBottomWidth: 1, borderBottomColor: palette.border },
    // Inner edges only: the container frames the table, MarkdownTable drops the trailing ones.
    tableCell: {
      padding: space.sm,
      borderRightWidth: 0.5,
      borderRightColor: palette.border,
    },
  };
}

// The default renderer drops the styles handed to it in two places, and both make the
// document look broken next to a bubble that took care of them:
//  - a paragraph's inline runs are wrapped in a Text node styled `{}`, so the wrapper falls
//    back to system defaults (16px, black -- invisible text in dark mode);
//  - code blocks get `styles.em` as their text style, so they render in italics.
export class DocumentRenderer extends Renderer {
  constructor(
    private codeColor: string,
    private typography: TextStyle,
    private ink: MarkdownInk = EMPTY_INK,
  ) {
    super();
  }

  text(children: string | React.ReactNode[], styles?: TextStyle): React.ReactNode {
    return super.text(children, { ...this.typography, ...styles });
  }

  html(text: string | React.ReactNode[], styles?: TextStyle): React.ReactNode {
    if (typeof text === 'string' && isDangerousHtml(text)) return null;
    return super.html(text, styles);
  }

  code(text: string, language?: string, containerStyle?: ViewStyle, _textStyle?: TextStyle) {
    return (
      <View key={this.getKey()} style={containerStyle}>
        <CodeBlockBar value={text} language={language} />
        <Text selectable style={[styles.codeText, { color: this.codeColor, fontSize: this.typography.fontSize, lineHeight: this.typography.lineHeight }]}>
          {highlighted(text, language, this.ink.tokens)}
        </Text>
      </View>
    );
  }

  /**
   * The library's `getBlockquoteNode`, plus the way out of the quote: its text, one tap.
   * The bar is the box's first row, not a floating button (it would cover a long first line).
   */
  blockquote(children: ReactNode[], styles?: ViewStyle): ReactNode {
    const text = quoteText(children);
    return (
      <View key={this.getKey()} style={styles}>
        {text ? <QuoteBar value={text} /> : null}
        {children}
      </View>
    );
  }

  list(ordered: boolean, li: ReactNode[], listStyle?: ViewStyle, textStyle?: TextStyle, startIndex?: number): ReactNode {
    return (
      <MarkdownList
        key={this.getKey()}
        ordered={ordered}
        li={li}
        listStyle={listStyle}
        textStyle={textStyle}
        markerColor={this.ink.marker}
        startIndex={startIndex}
      />
    );
  }

  table(header: ReactNode[][], rows: ReactNode[][][], tableStyle?: ViewStyle, rowStyle?: ViewStyle, cellStyle?: ViewStyle): ReactNode {
    return (
      <MarkdownTable
        key={this.getKey()}
        header={header}
        rows={rows}
        tableStyle={tableStyle}
        rowStyle={rowStyle}
        cellStyle={cellStyle}
        headerRowStyle={this.ink.tableHeader}
      />
    );
  }
}

/** Full-screen markdown body, shared by the .md viewer and the skill reader. */
export function DocumentMarkdown({ value }: { value: string }): React.JSX.Element {
  const { palette } = useTheme();
  const scale = useDocFontScale();
  const mdStyles = useMemo(() => documentMarkdownStyles(palette, scale), [palette, scale]);
  const ink = useMemo<MarkdownInk>(
    () => ({ tokens: tokenColors(palette), marker: palette.accent, tableHeader: { backgroundColor: palette.accentSoft } }),
    [palette],
  );
  const renderer = useMemo(
    () =>
      new DocumentRenderer(
        palette.codeText,
        {
          fontSize: Math.round(font.meta * scale),
          color: palette.text,
          lineHeight: lineHeightFor(Math.round(font.meta * scale)),
        },
        ink,
      ),
    [palette.codeText, palette.text, ink, scale],
  );
  const elements = useMarkdown(value, { styles: mdStyles, renderer });
  return <View>{elements}</View>;
}

export const styles = StyleSheet.create({
  codeText: {
    fontFamily: 'monospace',
    fontSize: font.meta,
    lineHeight: lineHeightFor(font.meta),
  },
});
