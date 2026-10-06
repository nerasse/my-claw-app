import React, { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { ActionSheet, type SheetEntry } from './ActionSheet';
import { overlayStore, type AnchorRect } from '../core/overlay';
import { keyLayerProps } from '../core/keyNav';
import { useMenuFocus } from '../core/menuFocus';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

const MENU_WIDTH = 240;
const MENU_GAP = 4;
const EDGE = 8;

/**
 * Draws what `overlayStore` holds, over the whole shell -- `core/overlay.ts` says why it exists.
 * Mounted once, last in the shell, so nothing the owner opened can sit on top of it.
 *
 * A row closes the menu before it runs: a row that opens the next menu (a scope, a confirmation)
 * then replaces it instead of being closed by it.
 */
export function OverlayHost(): React.JSX.Element | null {
  const { menu, notice } = useSyncExternalStore(overlayStore.subscribe, overlayStore.getState);
  const styles = useThemedStyles(createStyles);
  // Anchors are measured in the window; the host may not start at its corner (safe area).
  const origin = useRef({ x: 0, y: 0 });
  const host = useRef<View>(null);
  const onLayout = useCallback((_e: LayoutChangeEvent) => {
    host.current?.measureInWindow((x, y) => {
      origin.current = { x, y };
    });
  }, []);

  if (!menu && !notice) return null;
  const options = menu ? menu.options.map(closingFirst) : [];
  return (
    <View ref={host} style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={onLayout}>
      {menu?.kind === 'sheet' ? (
        <ActionSheet preview={menu.preview} options={options} onClose={() => overlayStore.close()} />
      ) : null}
      {menu?.kind === 'menu' ? <AnchoredMenu anchor={menu.anchor} origin={origin.current} options={options} /> : null}
      {notice ? (
        <View style={styles.noticeRow} pointerEvents="none">
          <Text
            style={[styles.notice, notice.failed && styles.noticeFailed]}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Notice ${notice.text}`}>
            {notice.text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function closingFirst(entry: SheetEntry): SheetEntry {
  if (entry.type === 'separator') return entry;
  return {
    ...entry,
    onPress: () => {
      overlayStore.close();
      entry.onPress();
    },
  };
}

/**
 * Where the menu goes, in the host's coordinates: under the control, right edges aligned, kept
 * inside the window, and above the control when the room below is too short for it.
 */
export function menuPosition(
  anchor: AnchorRect,
  origin: { x: number; y: number },
  window: { width: number; height: number },
  height: number,
): { left: number; top: number } {
  const x = anchor.x - origin.x;
  const y = anchor.y - origin.y;
  const left = Math.max(EDGE, Math.min(x + anchor.width - MENU_WIDTH, window.width - MENU_WIDTH - EDGE));
  const below = y + anchor.height + MENU_GAP;
  const above = y - MENU_GAP - height;
  const top = below + height > window.height - EDGE && above >= EDGE ? above : below;
  return { left, top };
}

/**
 * A short list under the control that opened it, right edges aligned, turned upward when the
 * space below runs out. A click anywhere else closes it, as any menu of a desktop.
 */
function AnchoredMenu({
  anchor,
  origin,
  options,
}: {
  anchor: AnchorRect;
  origin: { x: number; y: number };
  options: SheetEntry[];
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const window = useWindowDimensions();
  const [height, setHeight] = useState(0);
  const { left, top } = menuPosition(anchor, origin, window, height);
  // The keyboard's way in and round, as in a sheet (`menuFocus.ts`): wide windows on Android (DeX)
  // draw their menus here.
  const rows = options.flatMap((entry, i) => (entry.type === 'separator' ? [] : [i]));
  const { refFor, propsFor } = useMenuFocus(rows, rows[0]);
  return (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => overlayStore.close()} accessibilityLabel="Close menu" focusable={false} />
      <View
        {...keyLayerProps('menu')}
        style={[styles.menu, { left, top }]}
        onLayout={e => setHeight(e.nativeEvent.layout.height)}
        accessibilityRole="menu">
        {options.map((entry, i) =>
          entry.type === 'separator' ? (
            <View key={entry.key ?? `sep-${i}`} style={styles.separator} />
          ) : (
            <Pressable
              key={entry.key ?? entry.label}
              ref={refFor(i)}
              {...propsFor(i)}
              onPress={entry.onPress}
              style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
                styles.row,
                (hovered || pressed) && styles.rowActive,
              ]}
              accessibilityRole="menuitem"
              accessibilityLabel={entry.label}>
              <View style={styles.labelLine}>
                <Text style={[styles.label, entry.danger && styles.danger]}>{entry.label}</Text>
                {entry.shortcut ? <Text style={styles.hint}>{entry.shortcut}</Text> : null}
              </View>
              {entry.hint ? <Text style={styles.hint}>{entry.hint}</Text> : null}
            </Pressable>
          ),
        )}
      </View>
    </>
  );
}

const createStyles = (palette: Palette) => ({
  menu: {
    position: 'absolute' as const,
    width: MENU_WIDTH,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  row: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: 1 },
  rowActive: { backgroundColor: palette.surfaceAlt },
  labelLine: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: space.sm },
  label: { fontSize: font.body, color: palette.text },
  danger: { color: palette.danger },
  hint: { fontSize: font.small, color: palette.textFaint },
  separator: { height: 1, backgroundColor: palette.border, marginVertical: space.xs },
  noticeRow: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: space.xl * 3,
    alignItems: 'center' as const,
  },
  // Dark on every theme: it shows over the black of a viewer as well as over the thread.
  notice: {
    maxWidth: '86%' as const,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    overflow: 'hidden' as const,
    backgroundColor: 'rgba(20,20,22,0.92)',
    color: '#fff',
    fontSize: font.meta,
    textAlign: 'center' as const,
  },
  noticeFailed: { color: '#ffb4ab' },
});
