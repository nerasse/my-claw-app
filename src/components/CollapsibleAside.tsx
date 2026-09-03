import React, { useState, useRef, useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AgentMarkdown } from './AgentMarkdown';
import { BlockActions } from './BlockActions';
import { chatSelectable } from '../core/platform';
import { font, scaleFont, space, useThemedStyles, type Palette } from '../theme';

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
 *
 * Open, it carries its two ways out: copy takes the raw source whole, select opens the viewer
 * where a piece of it can be picked. Neither is a gesture on the block itself, and that is not a
 * choice: see docs/text-selection.md.
 */
export function CollapsibleAside({
  label,
  trailing,
  body,
  showHint,
  hideHint,
  defaultOpen = false,
}: {
  label: string;
  /**
   * Drawn right after the label, inside the toggle. A node rather than more text because what
   * goes here ticks (the thinking counter) and has to redraw itself alone, without the aside or
   * the thread around it re-rendering on every second.
   */
  trailing?: React.ReactNode;
  body: string;
  showHint: string;
  hideHint: string;
  /** Initial expansion state; used by the "always expand reasoning" pref. */
  defaultOpen?: boolean;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(defaultOpen);

  // A pref flipped while this aside is on screen should be honoured, not wait for the next turn:
  // one collapse cycle after the change lands, the aside starts from the pref again.
  const prevDefault = useRef(defaultOpen);
  useEffect(() => {
    if (prevDefault.current !== defaultOpen) {
      setOpen(defaultOpen);
      prevDefault.current = defaultOpen;
    }
  }, [defaultOpen]);


  return (
    <View>
      {/* The buttons sit beside the toggle rather than inside it: one tap must not both fold
          the block away and fill the clipboard. */}
      <View style={styles.head}>
        <Pressable
          style={styles.line}
          onPress={() => setOpen(value => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={label}
          accessibilityHint={open ? hideHint : showHint}>
          <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
          <Text style={styles.label}>{label}</Text>
          {trailing}
        </Pressable>
        {open && !chatSelectable ? <BlockActions title={label} value={body} /> : null}
      </View>
      {open ? (
        <View style={styles.body}>
          <AgentMarkdown text={body} tone="aside" />
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: space.sm },
  // The toggle takes the row and yields it: a long label must not push the copy button out.
  line: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs, paddingVertical: 2, flexShrink: 1 },
  chevron: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint, width: 8 },
  label: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint, letterSpacing: 0.3 },
  // A left rule marks it as an aside rather than part of the answer.
  body: {
    borderLeftWidth: 2,
    borderLeftColor: palette.border,
    paddingLeft: space.sm,
    marginTop: 2,
    marginBottom: space.xs,
  },
});
