import React, { useMemo } from 'react';
import { Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { Renderer, useMarkdown, type MarkedStyles } from 'react-native-marked';

const agentStyles: MarkedStyles = {
  text: { fontSize: 15, color: '#111', lineHeight: 21, flexShrink: 1 },
  paragraph: { marginVertical: 3, flexShrink: 1 },
  strong: { fontWeight: '700', color: '#111' },
  em: { fontStyle: 'italic' },
  strikethrough: { textDecorationLine: 'line-through' },
  h1: { fontSize: 20, fontWeight: '700', color: '#111', marginTop: 10, marginBottom: 4 },
  h2: { fontSize: 18, fontWeight: '700', color: '#111', marginTop: 10, marginBottom: 4 },
  h3: { fontSize: 16, fontWeight: '600', color: '#111', marginTop: 8, marginBottom: 3 },
  h4: { fontSize: 15, fontWeight: '600', color: '#111', marginTop: 6, marginBottom: 2 },
  link: { color: '#0a5cff', textDecorationLine: 'underline' },
  codespan: { fontFamily: 'monospace', fontSize: 13, color: '#111', backgroundColor: '#e6e6e6', borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1, overflow: 'hidden' },
  code: { backgroundColor: '#f2f2f2', borderRadius: 8, marginVertical: 6, padding: 10, flexShrink: 1 },
  blockquote: { borderLeftWidth: 3, borderLeftColor: '#cccccc', paddingLeft: 10, marginVertical: 6, flexShrink: 1 },
  hr: { marginVertical: 10 },
  list: { marginVertical: 3, flexShrink: 1 },
  li: { fontSize: 15, color: '#111', lineHeight: 21 },
  table: { marginVertical: 6, flexShrink: 1 },
  tableRow: { borderBottomWidth: 1, borderBottomColor: '#ddd' },
  tableCell: { padding: 6, borderWidth: 1, borderColor: '#ddd' },
  image: { width: 200, height: 200, borderRadius: 8, marginVertical: 6 },
};

// The default renderer puts code blocks in a horizontal ScrollView (lines never wrap and the
// block looks cut on a phone). Chat bubbles render better with wrapped monospace text.
class WrappingRenderer extends Renderer {
  code(text: string, _language?: string, containerStyle?: ViewStyle, textStyle?: TextStyle) {
    return (
      <View key={this.getKey()} style={containerStyle}>
        <Text selectable style={[textStyle, { fontFamily: 'monospace', fontSize: 13, lineHeight: 19, color: '#111' }]}>
          {text}
        </Text>
      </View>
    );
  }
}

export function AgentMarkdown({ text }: { text: string }): React.JSX.Element {
  const renderer = useMemo(() => new WrappingRenderer(), []);
  const elements = useMarkdown(text, { styles: agentStyles, renderer });
  return <View style={{ flexShrink: 1 }}>{elements}</View>;
}
