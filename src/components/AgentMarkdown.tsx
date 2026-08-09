import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { Renderer, useMarkdown, type MarkedStyles } from 'react-native-marked';
import { font, lineBoxFor, lineHeightFor, space, useTheme, type Palette } from '../theme';

/**
 * @param prose The message being rendered: a run carrying an emoji must not pin its line box,
 * or the glyph is clamped away on the first or last line. See lineBoxFor.
 */
export function markedStyles(palette: Palette, prose = ''): MarkedStyles {
  const box = lineBoxFor(font.body, prose);
  return {
    // Inline runs sit in the row that a list item builds (bullet, then content), so they must
    // yield width there or a long item would push its own line off the bubble.
    text: { fontSize: font.body, color: palette.text, ...box, flexShrink: 1 },
    paragraph: { marginVertical: 2, flexShrink: 0 },
    strong: { fontWeight: '700', color: palette.text },
    em: { fontStyle: 'italic' },
    strikethrough: { textDecorationLine: 'line-through' },
    h1: { fontSize: 18, fontWeight: '700', color: palette.text, marginTop: space.sm, marginBottom: space.xs },
    h2: { fontSize: 16, fontWeight: '700', color: palette.text, marginTop: space.sm, marginBottom: space.xs },
    h3: { fontSize: 15, fontWeight: '600', color: palette.text, marginTop: space.sm, marginBottom: 2 },
    h4: { fontSize: font.body, fontWeight: '600', color: palette.text, marginTop: space.xs, marginBottom: 2 },
    link: { color: palette.accent, textDecorationLine: 'underline' },
    codespan: {
      fontFamily: 'monospace',
      fontSize: font.meta,
      color: palette.text,
      backgroundColor: palette.surfaceAlt,
      borderRadius: 4,
      paddingHorizontal: 3,
      overflow: 'hidden',
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
    li: { fontSize: font.body, color: palette.text, ...box },
    table: { marginVertical: space.xs, flexShrink: 0 },
    tableRow: { borderBottomWidth: 1, borderBottomColor: palette.border },
    tableCell: { padding: space.xs, borderWidth: 1, borderColor: palette.border },
    image: { width: 200, height: 200, borderRadius: 6, marginVertical: space.xs },
  };
}

// The default renderer puts code blocks in a horizontal ScrollView (lines never wrap and the
// block looks cut on a phone). Chat bubbles render better with wrapped monospace text.
class WrappingRenderer extends Renderer {
  constructor(
    private codeColor: string,
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

  code(text: string, _language?: string, containerStyle?: ViewStyle, textStyle?: TextStyle) {
    return (
      <View key={this.getKey()} style={containerStyle}>
        <Text selectable style={[textStyle, styles.code, { color: this.codeColor }]}>
          {text}
        </Text>
      </View>
    );
  }
}

export function AgentMarkdown({ text }: { text: string }): React.JSX.Element {
  const { palette } = useTheme();
  const mdStyles = useMemo(() => markedStyles(palette, text), [palette, text]);
  const renderer = useMemo(
    () =>
      new WrappingRenderer(palette.text, {
        fontSize: font.body,
        color: palette.text,
        ...lineBoxFor(font.body, text),
      }),
    [palette.text, text],
  );
  const elements = useMarkdown(text, { styles: mdStyles, renderer });
  return <View style={styles.wrap}>{elements}</View>;
}

export const styles = StyleSheet.create({
  code: { fontFamily: 'monospace', fontSize: font.meta, lineHeight: lineHeightFor(font.meta) },
  // A bubble is a column, so flexShrink there governs height, not width. Letting the prose
  // yield meant an attachment above it (a rigid 190pt image) took the whole budget and squeezed
  // the words down to the top sliver of their first line. Prose keeps its natural height; the
  // bubble grows instead.
  wrap: { flexShrink: 0 },
});
