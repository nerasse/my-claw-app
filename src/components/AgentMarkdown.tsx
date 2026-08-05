import React from 'react';
import { Alert, Pressable, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useMarkdown, type MarkedStyles } from 'react-native-marked';

const agentStyles: MarkedStyles = {
  text: { fontSize: 15, color: '#111', lineHeight: 21 },
  paragraph: { marginVertical: 3 },
  strong: { fontWeight: '700', color: '#111' },
  em: { fontStyle: 'italic' },
  strikethrough: { textDecorationLine: 'line-through' },
  h1: { fontSize: 20, fontWeight: '700', color: '#111', marginTop: 10, marginBottom: 4 },
  h2: { fontSize: 18, fontWeight: '700', color: '#111', marginTop: 10, marginBottom: 4 },
  h3: { fontSize: 16, fontWeight: '600', color: '#111', marginTop: 8, marginBottom: 3 },
  h4: { fontSize: 15, fontWeight: '600', color: '#111', marginTop: 6, marginBottom: 2 },
  link: { color: '#0a5cff', textDecorationLine: 'underline' },
  codespan: { fontFamily: 'monospace', fontSize: 13, color: '#111', backgroundColor: '#e6e6e6', borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1, overflow: 'hidden' },
  code: { backgroundColor: '#f2f2f2', borderRadius: 8, marginVertical: 6, padding: 10 },
  blockquote: { borderLeftWidth: 3, borderLeftColor: '#cccccc', paddingLeft: 10, marginVertical: 6 },
  hr: { marginVertical: 10 },
  list: { marginVertical: 3 },
  li: { fontSize: 15, color: '#111', lineHeight: 21 },
  table: { marginVertical: 6 },
  tableRow: { borderBottomWidth: 1, borderBottomColor: '#ddd' },
  tableCell: { padding: 6, borderWidth: 1, borderColor: '#ddd' },
  image: { width: 200, height: 200, borderRadius: 8, marginVertical: 6 },
};

function AgentMarkdown({ text }: { text: string }): React.JSX.Element {
  const elements = useMarkdown(text, { styles: agentStyles });
  return <View>{elements}</View>;
}

export function MarkdownBubble({ text, streaming }: { text: string; streaming: boolean }): React.JSX.Element {
  const content = streaming ? `${text}▍` : text;
  return (
    <Pressable
      delayLongPress={400}
      onLongPress={() => {
        Clipboard.setString(text);
        Alert.alert('Copie', 'Reponse copiee dans le presse-papier');
      }}>
      <AgentMarkdown text={content} />
    </Pressable>
  );
}
