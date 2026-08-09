import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { Renderer, useMarkdown, type MarkedStyles } from 'react-native-marked';
import { font, lineHeightFor, space, useTheme, type Palette } from '../theme';

export function markedStyles(palette: Palette): MarkedStyles {
  return {
    // Inline runs sit in the row that a list item builds (bullet, then content), so they must
    // yield width there or a long item would push its own line off the bubble.
    text: { fontSize: font.body, color: palette.text, lineHeight: lineHeightFor(font.body), flexShrink: 1 },
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
    li: { fontSize: font.body, color: palette.text, lineHeight: lineHeightFor(font.body) },
    table: { marginVertical: space.xs, flexShrink: 0 },
    tableRow: { borderBottomWidth: 1, borderBottomColor: palette.border },
    tableCell: { padding: space.xs, borderWidth: 1, borderColor: palette.border },
    image: { width: 200, height: 200, borderRadius: 6, marginVertical: space.xs },
  };
}

// The default renderer puts code blocks in a horizontal ScrollView (lines never wrap and the
// block looks cut on a phone). Chat bubbles render better with wrapped monospace text.
class WrappingRenderer extends Renderer {
  constructor(private codeColor: string) {
    super();
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
  const renderer = useMemo(() => new WrappingRenderer(palette.text), [palette.text]);
  const mdStyles = useMemo(() => markedStyles(palette), [palette]);
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
