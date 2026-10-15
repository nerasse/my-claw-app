import React from 'react';
import { Pressable, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { GearIcon, PlusIcon, SidebarIcon } from '../components/icons';
import { ResizeHandle } from '../components/ResizeHandle';
import { RAIL_WIDTH, drawerColumnOf, pagePaneMax, panes, usePanes } from '../core/panes';
import { radius, space, useTheme, useThemedStyles, type Palette } from '../theme';
import { keyLayerProps } from '../core/keyNav';

/**
 * The desktop columns the owner sizes by hand: the conversation list on the left, and the column
 * beside the conversation on the right -- a page (files, settings...) or a viewer (a file, a
 * picture, a film). Each reads its own width from `panes` and nothing else, so a drag re-renders
 * the column and not its contents (the same element, handed back unchanged).
 */

/**
 * The pinned conversation list, or the rail it folds into. The list stays mounted while folded:
 * its search and its scroll are where the owner left them when it comes back.
 */
export function PinnedColumn({
  drawer,
  onNewThread,
  onOpenSettings,
}: {
  drawer: React.ReactNode;
  onNewThread: () => void;
  onOpenSettings: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const collapsed = usePanes(p => p.drawerCollapsed);
  const width = usePanes(p => p.drawerWidth);
  return (
    <View style={[styles.column, { width: collapsed ? RAIL_WIDTH : width }]} testID="pinned-column">
      <View style={[styles.fill, collapsed && styles.hidden]}>{drawer}</View>
      {collapsed ? (
        <View style={styles.rail} testID="drawer-rail">
          <Pressable onPress={() => panes.setDrawerCollapsed(false)} style={styles.railButton} accessibilityRole="button" accessibilityLabel="Show the conversation list">
            <SidebarIcon size={20} color={palette.text} />
          </Pressable>
          <Pressable onPress={onNewThread} style={[styles.railButton, styles.railNew]} accessibilityRole="button" accessibilityLabel="New conversation">
            <PlusIcon size={20} color={palette.accent} />
          </Pressable>
          <View style={styles.fill} />
          <Pressable onPress={onOpenSettings} style={styles.railButton} accessibilityRole="button" accessibilityLabel="Settings">
            <GearIcon size={20} color={palette.textFaint} />
          </Pressable>
        </View>
      ) : (
        <ResizeHandle edge="right" width={width} onResize={panes.resizeDrawer} onReset={panes.resetDrawer} label="Resize the conversation list" />
      )}
    </View>
  );
}

/**
 * Where a page is drawn: beside the conversation (`split`: files, the browser, status...), its
 * left border a handle; or in the whole column, styled by the shell.
 */
export function PagePane({ split, hidden = false, style, children }: { split: boolean; hidden?: boolean; style: StyleProp<ViewStyle>; children: React.ReactNode }): React.JSX.Element {
  if (!split) return <View {...keyLayerProps('page')} style={style}>{children}</View>;
  return (
    <SideColumn pane="page" hidden={hidden}>
      {children}
    </SideColumn>
  );
}

/**
 * Where a viewer draws on a wide window: the same column, the same handle and the same stored
 * width as a page. Opening a file while a page stands covers the page (which stays mounted,
 * scroll and all) and closing the file brings it back.
 */
export function ViewerPane({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <SideColumn pane="viewer">{children}</SideColumn>;
}

/**
 * One column, two lives. `pane` (not a passed-in testID) names the handle and the testID: a
 * `testID` reaching this component as a prop would put it on the composite as well, and a test
 * that looks the pane up by testID would then find the wrapper -- which carries no style --
 * before the view that does.
 */
function SideColumn({
  pane,
  hidden = false,
  children,
}: {
  pane: 'page' | 'viewer';
  hidden?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { width: windowWidth } = useWindowDimensions();
  const asked = usePanes(p => p.pagePaneWidth);
  const drawerColumn = usePanes(drawerColumnOf);
  // Clamped on the way out too: a window made narrower must not push the conversation off it.
  const width = Math.min(asked, pagePaneMax(windowWidth, drawerColumn));
  return (
    <View
      {...keyLayerProps('page')}
      testID={pane === 'page' ? 'page-pane' : 'viewer-pane'}
      style={[styles.pagePane, { width }, hidden && styles.hidden]}>
      <ResizeHandle
        edge="left"
        width={width}
        onResize={next => panes.resizePagePane(next, windowWidth)}
        onReset={panes.resetPagePane}
        label={pane === 'page' ? 'Resize the page beside the conversation' : 'Resize the viewer beside the conversation'}
      />
      {children}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  column: { position: 'relative' as const },
  fill: { flex: 1 },
  // Kept mounted, out of the layout: a page under a viewer holds its scroll for the way back.
  hidden: { display: 'none' as const },
  rail: {
    flex: 1,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingVertical: space.md,
    backgroundColor: palette.surface,
    borderRightWidth: 1,
    borderRightColor: palette.border,
  },
  railButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  railNew: { backgroundColor: palette.accentSoft },
  pagePane: {
    position: 'relative' as const,
    marginLeft: space.md,
    paddingLeft: space.md,
    borderLeftWidth: 1,
    borderLeftColor: palette.border,
  },
});
