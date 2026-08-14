import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { font, lineHeightFor, space, useThemedStyles, type Palette } from '../theme';

/**
 * A long aside folded into one muted line, expanded on tap. Two things use it: what the model
 * thought before answering, and what a compaction kept of the conversation. Both are context
 * about the message rather than the message, so both must lose every contest with it.
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
