import React, { useEffect, useState } from 'react';
import { Pressable, Text, View, type PressableStateCallbackType } from 'react-native';
import type { QuotaRetryWait } from '../core/protocol';
import { font, radius, scaleFont, space, useThemedStyles, type Palette } from '../theme';
import { formatRemaining, formatReset } from './QuotaCard';

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * The wait a spent quota left behind, at the foot of the thread: when the retry fires, what was
 * full, and the two ways out -- fire it now, or forget it. Off is also what the conversation menu
 * switches, so "Cancel" is the same decision said from where the owner is looking.
 */
export function QuotaWaitBar({
  waiting,
  onRetryNow,
  onCancel,
}: {
  waiting: QuotaRetryWait;
  onRetryNow: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const now = useNow();
  const remaining = formatRemaining(waiting.at, now);
  const detail =
    remaining === null
      ? 'retrying now…'
      : `retry at ${formatReset(waiting.at)} · ${remaining}`;
  return (
    <View style={styles.row}>
      <View style={styles.pill} accessibilityLabel={`Waiting for quota, ${detail}`}>
        <View style={styles.dot} />
        <View style={styles.texts}>
          <Text style={styles.title} numberOfLines={1}>
            Waiting for quota{waiting.windows.length > 0 ? ` · ${waiting.windows.join(', ')}` : ''}
          </Text>
          <Text style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        </View>
        <Pressable
          onPress={onRetryNow}
          style={({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
            styles.action,
            hovered ? styles.hovered : null,
            pressed ? styles.pressed : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Retry now">
          <Text style={styles.actionText}>Retry now</Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          style={({ pressed }: PressableStateCallbackType) => [styles.cancel, pressed ? styles.pressed : null]}
          accessibilityRole="button"
          accessibilityLabel="Cancel the quota wait">
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  row: { alignItems: 'center' as const, paddingVertical: space.md },
  pill: {
    minHeight: 52,
    maxWidth: 640,
    paddingLeft: space.md,
    paddingRight: space.xs,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.warn },
  texts: { flexShrink: 1, gap: 1 },
  title: { fontSize: scaleFont(font.meta, scale), color: palette.text, fontWeight: '600' as const },
  detail: { fontSize: scaleFont(font.small, scale), color: palette.textMuted },
  action: {
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: palette.accentSoft,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  actionText: { fontSize: scaleFont(font.meta, scale), color: palette.accent, fontWeight: '600' as const },
  cancel: { minHeight: 36, paddingHorizontal: space.sm, alignItems: 'center' as const, justifyContent: 'center' as const },
  cancelText: { fontSize: scaleFont(font.meta, scale), color: palette.textMuted },
  hovered: { opacity: 0.85 },
  pressed: { opacity: 0.6 },
});
