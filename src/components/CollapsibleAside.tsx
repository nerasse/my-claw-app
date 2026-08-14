import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AgentMarkdown } from './AgentMarkdown';
import { font, space, useThemedStyles, type Palette } from '../theme';

/**
 * A long aside folded into one muted line, expanded on tap. Two things use it: what the model
 * thought before answering, and what a compaction kept of the conversation. Both are context
 * about the message rather than the message, so both must lose every contest with it.
 *
 * The body is markdown, like the answer it sits under: both are written by the model, and a
 * compaction summary is structured prose (numbered sections, file paths, code spans) that reads
 * as noise when its syntax is left raw. Quieter, not dumber -- see MarkdownTone.
 *
 * It is parsed only while open. A folded aside costs nothing, which matters for reasoning: its
 * body grows with every streamed delta, and parsing markdown on each one would be paid for a
 * block nobody is looking at.
 */
export function CollapsibleAside({
  label,
  body,
  showHint,
  hideHint,
}: {
  label: string;
  body: string;
  showHint: string;
  hideHint: string;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        style={styles.line}
        onPress={() => setOpen(value => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
        accessibilityHint={open ? hideHint : showHint}>
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      {open ? (
        <View style={styles.body}>
          <AgentMarkdown text={body} tone="aside" />
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  line: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs, paddingVertical: 2 },
  chevron: { fontSize: font.micro, color: palette.textFaint, width: 8 },
  label: { fontSize: font.micro, color: palette.textFaint, letterSpacing: 0.3 },
  // A left rule marks it as an aside rather than part of the answer.
  body: {
    borderLeftWidth: 2,
    borderLeftColor: palette.border,
    paddingLeft: space.sm,
    marginTop: 2,
    marginBottom: space.xs,
  },
});
