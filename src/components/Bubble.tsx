import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { TextItem } from '../core/chat';
import type { DeviceInfo } from '../core/device';
import { AgentMarkdown } from './AgentMarkdown';
import { AttachmentView } from './AttachmentView';
import { font, lineHeightFor, radius, space, useThemedStyles, type Palette } from '../theme';

function clock(ts: number): string {
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function Bubble({
  item,
  mediaBase,
  deviceInfo,
  grouped,
  showTime,
  onMenu,
  onOpenAttachment,
}: {
  item: TextItem;
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
  /** Same author as the previous item: tighten the gap instead of repeating a full margin. */
  grouped: boolean;
  showTime: boolean;
  onMenu: () => void;
  onOpenAttachment?: (kind: 'image' | 'text', target: { url: string; filename: string }) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const agent = item.role === 'agent';
  return (
    <View style={[styles.row, agent ? styles.rowAgent : styles.rowUser, grouped ? styles.rowGrouped : null]}>
      <View style={[styles.bubble, agent ? styles.bubbleAgent : styles.bubbleUser]}>
        {item.attachments.map(att => (
          <AttachmentView
            key={att.id}
            att={att}
            mediaBase={mediaBase}
            deviceInfo={deviceInfo}
            onOpen={onOpenAttachment}
            // Each recording carries its own words; one blob under all of them would say the
            // wrong thing twice.
            transcript={item.transcripts?.[att.id]}
            onAccent={!agent}
          />
        ))}
        {item.text ? (
          agent ? (
            <AgentMarkdown text={item.streaming ? `${item.text}▍` : item.text} />
          ) : (
            <Text selectable style={[styles.text, styles.textUser]}>
              {item.text}
              {item.streaming ? '▍' : ''}
            </Text>
          )
        ) : item.streaming ? (
          <Text style={[styles.text, agent ? null : styles.textUser]}>▍</Text>
        ) : null}

        {item.error ? (
          <Text selectable style={styles.error}>
            {item.error}
          </Text>
        ) : null}

        {showTime ? <Text style={[styles.time, agent ? styles.timeAgent : styles.timeUser]}>{clock(item.ts)}</Text> : null}

        <Pressable
          hitSlop={12}
          style={[styles.menu, agent ? styles.menuAgent : styles.menuUser]}
          onPress={onMenu}
          accessibilityRole="button"
          accessibilityLabel="Message actions">
          <Text style={styles.menuGlyph}>⋯</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  row: { width: '100%' as const, flexDirection: 'row' as const, marginBottom: space.md },
  rowGrouped: { marginBottom: space.xs },
  rowUser: { justifyContent: 'flex-end' as const },
  rowAgent: { justifyContent: 'flex-start' as const },
  bubble: {
    maxWidth: '88%' as const,
    borderRadius: radius.md,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  bubbleUser: { backgroundColor: palette.accent, borderBottomRightRadius: radius.sm },
  bubbleAgent: { backgroundColor: palette.surfaceAlt, borderBottomLeftRadius: radius.sm },
  text: { fontSize: font.body, lineHeight: lineHeightFor(font.body), color: palette.text },
  textUser: { color: palette.accentText },
  error: { fontSize: font.small, color: palette.danger, marginTop: 2 },
  time: { fontSize: font.micro, alignSelf: 'flex-end' as const, marginTop: 1 },
  timeAgent: { color: palette.textFaint },
  timeUser: { color: palette.accentText, opacity: 0.7 },
  menu: { position: 'absolute' as const, bottom: -2, width: 24, height: 24, alignItems: 'center' as const, justifyContent: 'center' as const },
  menuAgent: { right: -24 },
  menuUser: { left: -24 },
  menuGlyph: { fontSize: 16, lineHeight: 18, color: palette.textFaint },
});
