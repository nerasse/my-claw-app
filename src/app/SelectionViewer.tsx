import { CloseIcon } from '../components/icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDismissKeyboard } from '../core/keyboard';
import type { SelectionTarget } from '../core/textSelection';
import { font, radius, space, type Palette, useThemedStyles } from '../theme';

/** How long the copy button says "copied" before going back to its label. */
const ACK_MS = 1400;

/**
 * The one place in the app where text can be selected out of a conversation.
 *
 * Two platform facts put it here rather than in the thread (docs/text-selection.md):
 * a selection never leaves the Text node it started in, so rendered markdown -- one node per
 * block -- can only ever hand over the paragraph the drag began in; and a selectable text view
 * inside the inverted chat list takes focus on long press, which makes Android's ScrollView
 * scroll to it through the inversion and throws the thread to the other end.
 *
 * So: one node, holding the raw source, in a plain top-anchored ScrollView. Everything is
 * selectable, across headings, code fences and paragraphs alike, the system menu offers its
 * own Select all, and nothing can scroll under the reader's finger.
 */
export function SelectionViewer({
  target,
  onClose,
}: {
  target: SelectionTarget;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  // Opened from a bubble, with the composer's keyboard possibly still up behind it.
  useDismissKeyboard();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, styles.stage, { top: insets.top }]}>
      <View style={styles.topBar}>
        <Text style={styles.title} numberOfLines={1}>
          {target.title}
        </Text>
        <Pressable
          onPress={() => {
            Clipboard.setString(target.body);
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), ACK_MS);
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Copy everything">
          <Text style={[styles.copy, copied ? styles.copied : null]}>{copied ? 'copied' : 'copy all'}</Text>
        </Pressable>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Close the selection view">
          <CloseIcon size={18} tone="faint" />
        </Pressable>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingBottom: space.lg + insets.bottom }]}>
        <Text selectable style={styles.source}>
          {target.body}
        </Text>
      </ScrollView>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  stage: { backgroundColor: palette.bg },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    backgroundColor: palette.surface,
  },
  title: { flex: 1, fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  copy: { fontSize: font.micro, color: palette.accent, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  copied: { color: palette.textFaint },
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  body: { flex: 1 },
  bodyContent: { padding: space.md },
  // Monospace, because the raw source is what is on show: an indented list, a code fence and a
  // table only line up under a fixed advance.
  source: {
    fontFamily: 'monospace',
    fontSize: font.small,
    lineHeight: 21,
    color: palette.text,
  },
});
