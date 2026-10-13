import React from 'react';
import { Pressable, Text } from 'react-native';
import { overlayStore } from '../core/overlay';
import { multiServerSupported, serverName, serversStore, useServers } from '../core/servers';
import { font, space, useThemedStyles, type Palette } from '../theme';

/**
 * Which server the conversation list belongs to, and a press away from the others: only once the
 * phone has two (docs/servers.md). One server needs no word about it.
 */
export function ServerSwitcher(): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  const { list, active } = useServers();
  if (!multiServerSupported || list.length < 2) return null;
  const current = list.find(profile => profile.id === active);
  // The shell's own sheet: one drawn inside the drawer's footer is clipped to it.
  const open = (): void =>
    overlayStore.open({
      kind: 'sheet',
      preview: 'Switch server',
      options: list.map(profile => ({
        label: profile.id === active ? `${serverName(profile)} (this one)` : serverName(profile),
        onPress: () => {
          overlayStore.close();
          serversStore.switchTo(profile.id).catch(() => {});
        },
      })),
    });
  return (
    <Pressable style={styles.row} onPress={open} accessibilityRole="button" accessibilityLabel="Switch server">
      <Text style={styles.label}>server</Text>
      <Text style={styles.name} numberOfLines={1}>
        {current ? serverName(current) : ''}
      </Text>
      <Text style={styles.glyph}>⇄</Text>
    </Pressable>
  );
}

const createStyles = (palette: Palette) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  label: { fontSize: font.micro, color: palette.textFaint, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  name: { flex: 1, fontSize: font.small, color: palette.text, fontWeight: '600' as const },
  glyph: { fontSize: font.body, color: palette.textFaint },
});
