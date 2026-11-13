import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { CollapsibleAside } from './CollapsibleAside';
import { font, scaleFont, space, useThemedStyles, type Palette } from '../theme';

/**
 * Why a run stopped, folded.
 *
 * It used to be the provider's own sentence, printed in red in the middle of the thread: a 429
 * body with its JSON, its request id and its stack read as an answer the agent had written, and it
 * pushed everything else around (owner, 2026-11-13: "c'est moche, c'est affreux"). One line now,
 * in danger ink, that opens to the detail -- the same shape a thought or a compaction summary
 * takes, because it is the same kind of thing: context about the run, not the run's words.
 *
 * The line says what happened in one word, never the payload. The payload is one tap away and
 * nothing is lost: it is what gets quoted in a bug report.
 */
export function RunFailure({
  error,
  onResend,
}: {
  error: string;
  /** The owner's own send: the line is the button that tries again, and says so. */
  onResend?: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const headline = headlineOf(error);

  if (onResend) {
    return (
      <Pressable onPress={onResend} hitSlop={6} accessibilityRole="button" accessibilityLabel="Send again">
        <View style={styles.row}>
          <Text style={styles.label} numberOfLines={1}>
            {`error · ${headline}`}
          </Text>
          <Text style={styles.hint}>send again</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <CollapsibleAside
      label={`error · ${headline}`}
      body={error}
      showHint="Show what the provider said"
      hideHint="Hide the provider's answer"
      tone="danger"
    />
  );
}

/**
 * The shortest true reading of an error, for the folded line.
 *
 * A provider's refusals arrive with a status and a payload, and the status is the part that means
 * something at a glance: `429` is a quota or a burst, `529` is an overload, `401` is a key. What
 * follows is either one of their sentences, which is long and repeats the same fact, or a bare
 * JSON body, which is unreadable inline. So the headline is built, not copied.
 */
export function headlineOf(error: string): string {
  const text = error.trim();
  const status = /\b(4\d\d|5\d\d)\b/.exec(text)?.[1];
  const message = messageOf(text);
  if (status === '429') return message ? `rate limited · ${message}` : 'rate limited';
  if (status === '529' || status === '503') return message ? `provider overloaded · ${message}` : 'provider overloaded';
  if (status === '401' || status === '403') return message ? `refused · ${message}` : 'refused';
  if (status) return message ? `${status} · ${message}` : status;
  return message || text;
}

/** What a provider said, minus the wrapper it came in. */
function messageOf(text: string): string {
  // `Anthropic request failed: HTTP 429 — {"type":"error","error":{"type":"rate_limit_error",…}}`
  const json = /\{[\s\S]*\}/.exec(text);
  if (json) {
    try {
      const parsed = JSON.parse(json[0]) as { error?: { message?: unknown; type?: unknown }; message?: unknown };
      const said = parsed.error?.message ?? parsed.message;
      // `rate_limit_error` says nothing a reader can act on; its own sentence does.
      if (typeof said === 'string' && said.trim()) return oneLine(said);
    } catch {
      // A body that is not JSON is text, and the text is the answer.
    }
  }
  const after = /(?:HTTP \d{3}\s*[—:-]\s*)(.+)$/.exec(text)?.[1] ?? text;
  return oneLine(after);
}

/** One line, no trailing full stop, bounded: the folded line is a label. */
function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '');
  return flat.length > 90 ? `${flat.slice(0, 89)}…` : flat;
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, marginTop: 2, flexWrap: 'wrap' as const },
  label: { fontSize: scaleFont(font.micro, scale), color: palette.danger, letterSpacing: 0.3, flexShrink: 1 },
  hint: { fontSize: scaleFont(font.micro, scale), color: palette.danger, opacity: 0.7 },
});
