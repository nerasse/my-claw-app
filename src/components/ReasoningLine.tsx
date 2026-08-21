import React from 'react';
import { Text, View } from 'react-native';
import { CollapsibleAside } from './CollapsibleAside';
import { font, space, useThemedStyles, type Palette } from '../theme';

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
  expandReasoning,
}: {
  reasoning?: string;
  tokens?: number;
  /** The bubble is still being written: the thinking may not be over. */
  streaming: boolean;
  /** Server-owned pref: start expanded instead of folded. */
  expandReasoning?: boolean;
}): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);

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

  return (
    <CollapsibleAside
      label={streaming ? 'Thinking…' : 'Reasoning'}
      body={body}
      showHint="Show the model's reasoning"
      hideHint="Hide the model's reasoning"
      defaultOpen={expandReasoning ?? false}
    />
  );
}

const createStyles = (palette: Palette) => ({
  line: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs, paddingVertical: 2 },
  label: { fontSize: font.micro, color: palette.textFaint, letterSpacing: 0.3 },
});
