import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { font, lineHeightFor, space, useThemedStyles, type Palette } from '../theme';

/** "1.2k" rather than "1234": this is a progress hint, not an accounting figure. */
function compactCount(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

/**
 * What the model thought, as one muted line at the top of its own bubble, collapsed by default and
 * expanded on tap. Deliberately quiet: it must lose every contest with the answer.
 *
 * Engines that redact their thinking (the Claude bridge) send only a token estimate. There is then
 * nothing to reveal, so the line renders as static text rather than a button that opens nothing.
 * See the server's docs/reasoning-visibility.md.
 */
export function ReasoningLine({
  reasoning,
  tokens,
  streaming,
}: {
  reasoning?: string;
  tokens?: number;
  /** The bubble is still being written: the thinking may not be over. */
  streaming: boolean;
}): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);

  const body = reasoning?.trim() ?? '';
  const hasBody = body.length > 0;
  const count = tokens && tokens > 0 ? compactCount(tokens) : '';

  if (!hasBody && !count) return null;

  if (!hasBody) {
    return (
      <View style={styles.line}>
        <Text style={styles.label}>{streaming ? `Thinking… ${count} tokens` : `Thought · ${count} tokens`}</Text>
      </View>
    );
  }

  const label = streaming ? 'Thinking…' : 'Reasoning';

  return (
    <View>
      <Pressable
        style={styles.line}
        onPress={() => setOpen(value => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
        accessibilityHint={open ? "Hide the model's reasoning" : "Show the model's reasoning"}>
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      {open ? (
        <Text selectable style={styles.body}>
          {body}
        </Text>
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
    fontSize: font.small,
    lineHeight: lineHeightFor(font.small),
    color: palette.textMuted,
    borderLeftWidth: 2,
    borderLeftColor: palette.border,
    paddingLeft: space.sm,
    marginTop: 2,
    marginBottom: space.xs,
  },
});
