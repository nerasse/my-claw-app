/**
 * The drawer and the one bottom sheet, as the app draws them.
 *
 * The component harness beside this one never rendered either: the list and the menus are where
 * the owner keeps finding drifted numbers (the active bar, the search field, a row's height), and
 * neither can be checked by reading CSS in a different engine than the one that ships.
 */
import React from 'react';
import { AppRegistry, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Drawer } from '../../src/app/Drawer';
import { ActionSheet, type SheetEntry } from '../../src/components/ActionSheet';
import { CopyIcon, DownloadIcon, FolderIcon, GaugeIcon, InfoIcon, LinkIcon, MoreIcon, MoveIcon, PencilIcon, TrashIcon } from '../../src/components/icons';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { useThemedStyles, font, space, type Palette } from '../../src/theme';
import type { FolderSummary, SessionSummary } from '../../src/core/protocol';

const at = (minutesAgo: number): string => new Date(Date.now() - minutesAgo * 60_000).toISOString();

const session = (over: Partial<SessionSummary> & Pick<SessionSummary, 'threadId' | 'title'>): SessionSummary => ({
  messageCount: 12,
  createdAt: at(600),
  lastActiveAt: at(30),
  lastMessageAt: at(30),
  archived: false,
  ...over,
});

const SESSIONS: SessionSummary[] = [
  session({ threadId: 't1', title: 'Refonte UI — trois directions', messageCount: 41, lastMessageAt: at(0) }),
  session({ threadId: 't2', title: 'Refonte page téléchargements', hasDraft: true, workspace: 'dl-hub', lastMessageAt: at(120) }),
  session({ threadId: 't3', title: 'Quotas : fenêtre 5 h fantôme', lastMessageAt: at(300) }),
  session({ threadId: 't4', title: 'Proxy navigateur par contexte', lastMessageAt: at(400) }),
  session({ threadId: 't5', title: 'Cache : ratio réel par provider', messageCount: 58, lastMessageAt: at(1500) }),
  session({ threadId: 't6', title: 'brag : présentation unique', lastMessageAt: at(1600) }),
  session({ threadId: 't7', title: 'Sub-agents : reprise avec modèle', lastMessageAt: at(2600) }),
];

const FOLDERS: FolderSummary[] = [
  { id: 'f1', name: 'Infra', rank: 0 },
  { id: 'f2', name: 'dl-hub', rank: 1 },
];

/** The conversation menu, which is the one the plane draws in full. */
const OPTIONS: SheetEntry[] = [
  { label: 'Open', icon: <MoreIcon size={15} tone="muted" />, shortcut: '↵', onPress: () => {} },
  { label: 'Rename', icon: <PencilIcon size={15} tone="muted" />, shortcut: 'F2', onPress: () => {} },
  { label: 'Move to…', icon: <MoveIcon size={15} tone="muted" />, hint: 'my-claw', onPress: () => {} },
  { label: 'Duplicate', icon: <CopyIcon size={15} tone="muted" />, onPress: () => {} },
  { type: 'separator' },
  { label: 'Export', icon: <DownloadIcon size={15} tone="muted" />, shortcut: '⇧⌘E', onPress: () => {} },
  { label: 'Copy the link', icon: <LinkIcon size={15} tone="muted" />, onPress: () => {} },
  { label: 'Run files', icon: <FolderIcon size={15} tone="muted" />, hint: '58 files', onPress: () => {} },
  { type: 'separator' },
  { label: 'Run status', icon: <InfoIcon size={15} tone="muted" />, onPress: () => {} },
  { label: 'Cache: 94 % reads', icon: <GaugeIcon size={15} tone="muted" />, onPress: () => {} },
  { type: 'separator' },
  { label: 'Delete', icon: <TrashIcon size={15} tone="danger" />, shortcut: 'Del', danger: true, onPress: () => {} },
];

function Sheet(): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.h}>the conversation list, pinned</Text>
      <View style={styles.drawerBox}>
        <Drawer
          open
          pinned
          sessions={SESSIONS}
          folders={FOLDERS}
          unread={['t2']}
          running={['t3']}
          questionThreads={['t3']}
          workspaceFilter={null}
          collapsedFolders={[]}
          activeThread="t1"
          connectionState="connected"
          pending={0}
          onClose={() => {}}
          onOpenThread={() => {}}
          onNewThread={() => {}}
          onThreadMenu={() => {}}
          onOpenWorkspaceFilter={() => {}}
          onClearWorkspaceFilter={() => {}}
          onToggleFolder={() => {}}
          onNewFolder={() => {}}
          onFolderMenu={() => {}}
          onMoveToFolder={() => {}}
          onReorderFolders={() => {}}
          onOpenMore={() => {}}
          onOpenSettings={() => {}}
        />
      </View>
      <Text style={styles.h}>the conversation menu</Text>
      <View style={styles.sheetHost}>
        <ActionSheet preview="Refonte UI — trois directions" options={OPTIONS} onClose={() => {}} />
      </View>
    </ScrollView>
  );
}

const createStyles = (palette: Palette) => ({
  page: { padding: 24, gap: 10, backgroundColor: palette.bg },
  h: { fontSize: font.micro, color: palette.textMeta, letterSpacing: 0.4, textTransform: 'uppercase' as const, marginTop: space.lg },
  drawerBox: { width: 296, height: 620, borderWidth: 1, borderColor: palette.border },
  sheetHost: { height: 700, position: 'relative' as const },
});

function Root(): React.JSX.Element {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 800, height: 1400 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}>
      <ThemeProvider>
        <Sheet />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

AppRegistry.registerComponent('Drawer', () => Root);
AppRegistry.runApplication('Drawer', { rootTag: document.getElementById('root') });
