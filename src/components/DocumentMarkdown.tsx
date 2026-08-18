import React, { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { Renderer, useMarkdown, type MarkedStyles } from 'react-native-marked';
import { isDangerousHtml } from '../core/markdownSafe';
import { CodeBlockBar } from './CodeBlockBar';
import { MarkdownTable } from './MarkdownTable';
import { font, lineHeightFor, space, useTheme, type Palette } from '../theme';

/** Document body: a fullscreen reader, not a chat bubble, so one size above the chat. */
const DOC_FONT_SIZE = 15;
const DOC_LINE_HEIGHT = 23;

/**
 * Document typography for the full-screen viewers (text viewer, skill reader): the GitHub
 * markdown conventions transposed onto the app palette -- a real heading hierarchy with
 * breathing room, bordered quotes, tables, and code that reads like code. Every key of
 * MarkedStyles is covered on purpose: anything left out falls back to the package defaults,
 * which were tuned for a web-like demo (italic code spans, 32pt headings) and show up in a
 * chat app as "moche".
 */
export function documentMarkdownStyles(palette: Palette): MarkedStyles {
  // The library flattens every style over its own regular base (16px, #333333); a span that
  // only states its emphasis inherits that base and renders off-palette -- bold as dark gray
  // in dark mode. Every inline style restates the body fully.
  const body = { fontSize: DOC_FONT_SIZE, color: palette.text, lineHeight: DOC_LINE_HEIGHT };
  return {
    text: body,
    paragraph: { paddingVertical: 6 },
    strong: { ...body, fontWeight: '700' },
    em: { ...body, fontStyle: 'italic' },
    strikethrough: { ...body, textDecorationLine: 'line-through' },
    link: { ...body, color: palette.accent, textDecorationLine: 'underline' },
    h1: {
      fontSize: 24,
      lineHeight: 30,
      fontWeight: '700',
      color: palette.text,
      marginTop: space.xl,
      marginBottom: space.sm,
      paddingBottom: space.sm,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    h2: {
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '700',
      color: palette.text,
      marginTop: space.xl,
      marginBottom: space.sm,
    },
    h3: {
      fontSize: 17,
      lineHeight: 23,
      fontWeight: '600',
      color: palette.text,
      marginTop: space.lg,
      marginBottom: space.xs,
    },
    h4: {
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '600',
      color: palette.text,
      marginTop: space.lg,
      marginBottom: space.xs,
    },
    h5: {
      fontSize: font.body,
      lineHeight: 20,
      fontWeight: '600',
      color: palette.textMuted,
      marginTop: space.md,
      marginBottom: 2,
    },
    h6: {
      fontSize: font.small,
      lineHeight: 18,
      fontWeight: '600',
      color: palette.textMuted,
      marginTop: space.md,
      marginBottom: 2,
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: palette.border,
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
      backgroundColor: palette.surfaceAlt,
      fontStyle: 'normal',
      fontWeight: '400',
    },
    code: {
      backgroundColor: palette.codeBg,
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
        <Text selectable style={[styles.codeText, { color: this.codeColor }]}>
          {text}
        </Text>
      </View>
    );
  }

  table(header: ReactNode[][], rows: ReactNode[][][], tableStyle?: ViewStyle, rowStyle?: ViewStyle, cellStyle?: ViewStyle): ReactNode {
    return <MarkdownTable key={this.getKey()} header={header} rows={rows} tableStyle={tableStyle} rowStyle={rowStyle} cellStyle={cellStyle} />;
  }
}

/** Full-screen markdown body, shared by the .md viewer and the skill reader. */
export function DocumentMarkdown({ value }: { value: string }): React.JSX.Element {
  const { palette } = useTheme();
  const mdStyles = useMemo(() => documentMarkdownStyles(palette), [palette]);
  const renderer = useMemo(
    () =>
      new DocumentRenderer(palette.text, {
        fontSize: DOC_FONT_SIZE,
        color: palette.text,
        lineHeight: DOC_LINE_HEIGHT,
      }),
    [palette.text],
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
