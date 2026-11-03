import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ServerSwitcher } from './ServerSwitcher';
import {
  Animated,
  FlatList,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FolderSummary, SessionSummary } from '../core/protocol';
import { ThreadRow } from '../components/ThreadRow';
import { ChevronIcon, CloseIcon, FilterIcon, FolderIcon, GearIcon, MoreIcon, NewFolderIcon, PlusIcon, SidebarIcon } from '../components/icons';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { useDismissKeyboard } from '../core/keyboard';
import { drawerSections, sectionBadge, type SectionBadge } from '../core/folders';
import { chipAt, fileDrop, lineAt, orderDrop, sameDrop, stackLines, targetOf, type DropMove, type LineBox, type ListLine } from '../core/dragMove';
import { matchesWorkspace } from '../core/workspaceFilter';
import { pointerFine } from '../core/platform';
import { DRAWER_WIDTH, font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';
import type { WsState } from '../core/types';
import { keyLayerProps } from '../core/keyNav';

const STATE_LABEL: Record<WsState, string> = {
  idle: 'offline',
  connecting: 'connecting',
  connected: 'connected',
  disconnected: 'reconnecting',
};

export { STATE_LABEL as CONNECTION_LABEL };

function Separator(): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.separator} />;
}

/**
 * One line of the list: a section header, a conversation, or the sentence that says the list is
 * empty. Flattened rather than handed to a SectionList so the drawer keeps the one virtualized list
 * it has always had -- its tuning, its separators and its scroll are all built around a flat data
 * array, and a folded section is then just a header with no rows after it.
 */
type DrawerEntry =
  | {
      kind: 'header';
      key: string;
      label: string;
      folder: FolderSummary | null;
      folded: boolean;
      badge: SectionBadge | null;
    }
  | { kind: 'row'; key: string; session: SessionSummary; folderId: string | null }
  | { kind: 'empty'; key: string; text: string; folderId: string | null };

/** The section an entry belongs to. null = the conversations nobody filed. */
const sectionOf = (item: DrawerEntry): string | null =>
  item.kind === 'header' ? (item.folder?.id ?? null) : item.folderId;

/** Where an entry sits for the drop hit test: a key, its section, and what it carries. */
const lineOf = (item: DrawerEntry): ListLine => ({
  key: item.key,
  folderId: sectionOf(item),
  role: item.kind,
  ...(item.kind === 'row' ? { threadId: item.session.threadId } : {}),
});

/** What a finger is carrying: a conversation to file, or a folder to place among its own. */
type DragSubject =
  | { kind: 'thread'; session: SessionSummary }
  | { kind: 'folder'; folder: FolderSummary };

/**
 * The rule the list draws between two entries. `stackLines` sums it in, so a finger lands one
 * pixel lower per line above it -- and the drawing below reads the same number, so the two cannot
 * drift apart.
 */
export const SEPARATOR_HEIGHT = 1;

/** How long a finger has to hold still before moving becomes a drag rather than a scroll. */
const DRAG_HOLD_MS = 350;
/** How close to an edge the finger has to be for the list to follow it, in points. */
const AUTO_SCROLL_EDGE = 64;
const AUTO_SCROLL_STEP = 12;
const AUTO_SCROLL_MS = 32;
/** How far above the finger the floating title rides, measured from its own bottom edge. */
const CHIP_GAP = 18;

/** What a screen reader hears of a folder's badge, after its name. */
const badgeWords = (badge: SectionBadge | null): string => {
  if (badge === null) return '';
  if (badge.kind === 'question') {
    return `, ${badge.count} question${badge.count === 1 ? '' : 's'} waiting`;
  }
  return `, ${badge.count} with activity`;
};

/**
 * The count a section header carries. While a search is narrowing the list it also says what it is
 * narrowing: "two of nine" is a section with seven answers missing, and "two" is a claim.
 */
const sectionCount = (count: number, total: number, searching: boolean): string =>
  searching ? `${count} / ${total}` : String(total);

/**
 * The conversation list: conversations first, fixed entries (Sub-Agents, Archived, Jobs,
 * Settings) at the bottom.
 *
 * Three shapes, same panel. On a phone it is a slide-over that stays mounted, so it animates both
 * ways and swallows no touches while closed. Wide enough and it is `pinned` instead: a column of
 * the layout, always there, no backdrop and no swipe, because hiding the list behind a button is
 * a concession to a 400pt screen and nothing else. With no active thread it is `home`: the same
 * list fills the phone or tablet instead of leaving an empty chat pane.
 */
export function Drawer({
  open,
  pinned = false,
  focusSearch = 0,
  sessions,
  folders,
  unread,
  running,
  questionThreads,
  workspaceFilter,
  collapsedFolders,
  activeThread,
  connectionState,
  pending,
  onClose,
  onOpenThread,
  onNewThread,
  onThreadMenu,
  onOpenWorkspaceFilter,
  onClearWorkspaceFilter,
  onToggleFolder,
  onNewFolder,
  onFolderMenu,
  onMoveToFolder,
  onReorderFolders,
  onOpenMore,
  onOpenSettings,
  home,
  onCollapse,
  onHome,
}: {
  open: boolean;
  /** Standing column instead of a slide-over. `open` and `onClose` are then meaningless. */
  pinned?: boolean;
  /** Pinned only: folds the list into the rail, to give its width to the conversation. */
  onCollapse?: () => void;
  /** Bumped by the Ctrl+K shortcut: the search field takes the caret. */
  focusSearch?: number;
  sessions: SessionSummary[];
  /** The owner's folders, in rank order: the sections the list is cut into. */
  folders: FolderSummary[];
  unread: string[];
  /** Conversations a run is answering on right now: part of what a folder counts as activity. */
  running: string[];
  /** Conversations whose run is blocked on a question, badged in the list. */
  questionThreads: string[];
  /**
   * The workspace the list is narrowed to, or null for all of them. Held by the shell and not by
   * this panel: the drawer and the home screen are two mounts of one list, and a filter that
   * survived one of them and not the other would be two lists.
   */
  workspaceFilter: string | null;
  /** Folder ids the owner folded away. Held by the shell, like the filter, for the same reason. */
  collapsedFolders: string[];
  activeThread: string | null;
  connectionState: WsState;
  pending: number;
  onClose: () => void;
  onOpenThread: (threadId: string) => void;
  onNewThread: () => void;
  onThreadMenu: (thread: SessionSummary) => void;
  onOpenWorkspaceFilter: () => void;
  onClearWorkspaceFilter: () => void;
  onToggleFolder: (folderId: string) => void;
  onNewFolder: () => void;
  onFolderMenu: (folder: FolderSummary) => void;
  /** A conversation dragged onto another section: the server files it, the listing confirms. */
  onMoveToFolder: (threadId: string, folderId: string | null) => void;
  /** A folder dragged onto another one: the order the server should keep. */
  onReorderFolders: (order: string[]) => void;
  /** The one footer entry: opens the sheet with Archived, Agents, Jobs and Settings. */
  onOpenMore: () => void;
  /** Jump straight to Settings from the home footer. */
  onOpenSettings: () => void;
  /** Full-screen list on phone/tablet when no thread is open. */
  home?: boolean;
  /** Back to home (no-op when already home). */
  onHome: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const searchRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  /**
   * How tall each drawn line is, keyed by entry. Written by `onLayout`, which is the one thing
   * about a line that can be trusted on both platforms -- see `stackLines` for why its position
   * is summed instead of read.
   */
  const lineHeightsRef = useRef(new Map<string, number>());
  /** What the finger is carrying: a ref, because the gesture reads it on every move. */
  const draggedRef = useRef<DragSubject | null>(null);
  /** What a release would do right now, already narrowed by the hit test. */
  const dropRef = useRef<DropMove | null>(null);
  const scrollOffsetRef = useRef(0);
  const viewportRef = useRef(0);
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listRef = useRef<FlatList<DrawerEntry>>(null);
  const chipPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  /** The chip's own size, since centring it on the finger needs it and only the layout knows it. */
  const chipSizeRef = useRef({ width: 0, height: 0 });
  const [dragging, setDragging] = useState<DragSubject | null>(null);
  /** The move a release would make. The section it acts on is what lights up: the preview. */
  const [dropMove, setDropMove] = useState<DropMove | null>(null);

  /** The chip follows the finger, centred on it: one place, so a move and a pickup cannot differ. */
  const placeChip = useCallback(
    (x: number, y: number): void => {
      chipPos.setValue(chipAt({ x, y }, chipSizeRef.current, CHIP_GAP));
    },
    [chipPos],
  );

  const trackScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
  }, []);
  const trackViewport = useCallback((event: LayoutChangeEvent): void => {
    viewportRef.current = event.nativeEvent.layout.height;
  }, []);
  const { scrollProps, indicator } = useScrollIndicator({ onScroll: trackScroll, onLayout: trackViewport });
  // The panel stays mounted, so opening it is a prop change, not a mount. Its search field is
  // never focused on the way in: whatever keyboard is up belongs to the composer behind it.
  // A pinned panel never "opens", so it never takes the keyboard away from the composer.
  useDismissKeyboard(home || (!pinned && open));

  // Membership as a Set, not `unread.includes` per row: that scan ran once per visible row on
  // every render of a panel that never unmounts, i.e. on every streaming token.
  const unreadIds = useMemo(() => new Set(unread), [unread]);
  const runningIds = useMemo(() => new Set(running), [running]);
  const questionIds = useMemo(() => new Set(questionThreads), [questionThreads]);

  /**
   * The list, cut into sections.
   *
   * Two passes over the same filter: one keeps the search, and one does not. The second is what a
   * header counts against, so a folded folder says how many of its conversations the search left --
   * "two of nine" -- instead of claiming the folder holds two.
   */
  const entries = useMemo((): DrawerEntry[] => {
    const needle = query.trim().toLowerCase();
    const searching = needle !== '';
    const byWorkspace = sessions.filter(session => matchesWorkspace(session, workspaceFilter));
    const searched = needle
      ? byWorkspace.filter(session => session.title.toLowerCase().includes(needle))
      : byWorkspace;
    const sections = drawerSections(searched, folders, workspaceFilter);
    const totals = new Map(
      drawerSections(byWorkspace, folders, workspaceFilter).map(section => [section.folder?.id ?? '', section.rows.length]),
    );
    const out: DrawerEntry[] = [];
    for (const section of sections) {
      const id = section.folder?.id ?? '';
      const folded = section.folder !== null && collapsedFolders.includes(section.folder.id);
      out.push({
        kind: 'header',
        key: `section:${id}`,
        label: `${section.label} · ${sectionCount(section.rows.length, totals.get(id) ?? section.rows.length, searching)}`,
        folder: section.folder,
        folded,
        // Counted here, with the sections: the drawer re-renders on every token of a streaming
        // run, and walking the rows again per render is the one cost this list cannot pay.
        badge: section.folder === null
          ? null
          : sectionBadge(
              section.rows,
              threadId => questionIds.has(threadId),
              threadId => unreadIds.has(threadId) || runningIds.has(threadId),
            ),
      });
      if (folded) continue;
      for (const row of section.rows) {
        out.push({ kind: 'row', key: row.threadId, session: row, folderId: section.folder?.id ?? null });
      }
    }
    // A list with no conversations still says so: with sections it always has a header, so the
    // sentence the FlatList used to draw for an empty data array has to be an entry of its own.
    if (searched.length === 0) {
      out.push({ kind: 'empty', key: 'empty', text: searching ? 'no match' : 'no conversations', folderId: null });
    }
    return out;
  }, [sessions, folders, query, workspaceFilter, collapsedFolders, questionIds, runningIds, unreadIds]);

  /**
   * The gesture reads the list and the owner's callback through refs, and the callbacks below never
   * change identity: a gesture is long-lived, and RNGH re-attaches it whenever the object it was
   * given changes -- a listing arriving mid-drag would otherwise drop the drag on the floor.
   */
  const moveRef = useRef(onMoveToFolder);
  useEffect(() => {
    moveRef.current = onMoveToFolder;
  }, [onMoveToFolder]);
  const orderRef = useRef(onReorderFolders);
  useEffect(() => {
    orderRef.current = onReorderFolders;
  }, [onReorderFolders]);
  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);
  const foldersRef = useRef(folders);
  useEffect(() => {
    foldersRef.current = folders;
  }, [folders]);
  /** The order the folders are in, which is what a reorder rewrites. */
  const folderIds = useMemo(() => folders.map(folder => folder.id), [folders]);
  const folderIdsRef = useRef(folderIds);
  useEffect(() => {
    folderIdsRef.current = folderIds;
  }, [folderIds]);

  /** The drawn entries as lines, in the order the list draws them: what a finger can be over. */
  const lines = useMemo(() => entries.map(lineOf), [entries]);
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  /** Records how tall a drawn line is. Where it sits is where those heights add up to. */
  const measureLine = useCallback((key: string, event: LayoutChangeEvent): void => {
    lineHeightsRef.current.set(key, event.nativeEvent.layout.height);
  }, []);

  /**
   * The line under a finger: the viewport's own y, plus what has scrolled past above it.
   *
   * The stack is walked on every move rather than cached: thirty lines of arithmetic cost less
   * than keeping a cache honest through a scroll, a search and a fold.
   */
  const lineUnder = useCallback(
    (y: number): LineBox | undefined =>
      lineAt(stackLines(linesRef.current, lineHeightsRef.current, SEPARATOR_HEIGHT), scrollOffsetRef.current + y),
    [],
  );

  /**
   * The move under the finger, and the only thing a release acts on. Set when the release would do
   * something, cleared the moment it would do nothing -- so the highlight is the preview of the
   * drop, and it never lies about what letting go is about to do.
   */
  const reflectDrop = useCallback(
    (target: LineBox | undefined): void => {
      const subject = draggedRef.current;
      const move =
        subject === null
          ? null
          : subject.kind === 'thread'
            ? fileDrop(subject.session, target)
            : orderDrop(subject.folder.id, folderIdsRef.current, target);
      if (sameDrop(dropRef.current, move)) return;
      dropRef.current = move;
      setDropMove(move);
    },
    [],
  );

  /** What a line hands to the finger: a conversation from a row, a folder from its heading. */
  const subjectAt = useCallback((line: LineBox | undefined): DragSubject | null => {
    if (!line) return null;
    // A row carries a conversation, a heading carries the folder it names, and `threadId` is what
    // tells the two apart: it is set on a row and nowhere else.
    if (line.threadId !== undefined) {
      const session = sessionsRef.current.find(row => row.threadId === line.threadId);
      return session ? { kind: 'thread', session } : null;
    }
    if (line.role === 'header' && line.folderId !== null) {
      const folder = foldersRef.current.find(held => held.id === line.folderId);
      return folder ? { kind: 'folder', folder } : null;
    }
    return null;
  }, []);

  const stopAutoScroll = useCallback((): void => {
    if (autoScrollRef.current === null) return;
    clearInterval(autoScrollRef.current);
    autoScrollRef.current = null;
  }, []);

  /**
   * The list follows a finger held at its edge. Without it a drag reaches only the folders already
   * on screen, and a folder one screen away is exactly what this list is for.
   */
  const driveAutoScroll = useCallback(
    (y: number): void => {
      const viewport = viewportRef.current;
      const direction = y < AUTO_SCROLL_EDGE ? -1 : y > viewport - AUTO_SCROLL_EDGE ? 1 : 0;
      if (direction === 0) {
        stopAutoScroll();
        return;
      }
      if (autoScrollRef.current !== null) return;
      autoScrollRef.current = setInterval(() => {
        // The end of the list clamps itself: scrolling past it is a no-op, so only the top needs
        // holding, and a negative offset would fight the list's own bounce.
        const next = Math.max(0, scrollOffsetRef.current + direction * AUTO_SCROLL_STEP);
        listRef.current?.scrollToOffset({ offset: next, animated: false });
      }, AUTO_SCROLL_MS);
    },
    [stopAutoScroll],
  );

  const beginDrag = useCallback(
    (y: number, x: number): void => {
      if (draggedRef.current) return;
      const line = lineUnder(y);
      const subject = subjectAt(line);
      // The unfiled heading, a sentence, the gap under the last section: nothing to pick up.
      if (!subject) return;
      draggedRef.current = subject;
      placeChip(x, y);
      setDragging(subject);
      reflectDrop(line);
    },
    [lineUnder, placeChip, reflectDrop, subjectAt],
  );

  const updateDrag = useCallback(
    (y: number, x: number): void => {
      placeChip(x, y);
      driveAutoScroll(y);
      reflectDrop(lineUnder(y));
    },
    [driveAutoScroll, lineUnder, placeChip, reflectDrop],
  );

  /**
   * The click a release sends, which belongs to the drag and not to whatever is under the pointer.
   *
   * A browser dispatches that click where the button came up, whatever a gesture did with the press
   * first: without this, dropping a conversation both files it and opens it. It is the one press
   * that arrives with no press-down of its own, and the flag is raised on the release and lowered
   * on the next press-down -- so nothing else is ever swallowed, and a tap opens as it always did.
   */
  const swallowedPressRef = useRef(false);
  /** Where the press landed. The drag picks up there, not where the pointer was when it began. */
  const pressAtRef = useRef<{ x: number; y: number } | null>(null);
  /** True while the press being handled is the one that release sent. */
  const pressIsTheDrags = useCallback((): boolean => swallowedPressRef.current, []);

  const openThread = useCallback(
    (threadId: string): void => {
      if (pressIsTheDrags()) return;
      onOpenThread(threadId);
    },
    [onOpenThread, pressIsTheDrags],
  );

  const toggleFolder = useCallback(
    (folderId: string): void => {
      if (pressIsTheDrags()) return;
      onToggleFolder(folderId);
    },
    [onToggleFolder, pressIsTheDrags],
  );

  const openFolderMenu = useCallback(
    (folder: FolderSummary): void => {
      if (pressIsTheDrags()) return;
      onFolderMenu(folder);
    },
    [onFolderMenu, pressIsTheDrags],
  );

  const endDrag = useCallback(
    (canceled: boolean): void => {
      stopAutoScroll();
      const move = dropRef.current;
      const carried = draggedRef.current !== null;
      draggedRef.current = null;
      dropRef.current = null;
      setDragging(null);
      setDropMove(null);
      // A drag that carried something leaves a click behind it on the web; one that carried
      // nothing leaves the press alone, so a hold that picks nothing up is still a tap.
      if (carried) swallowedPressRef.current = true;
      // Nothing to do: the finger let go outside every section, or over the one it came from.
      if (canceled || !move) return;
      if (move.kind === 'file') moveRef.current(move.threadId, move.folderId);
      else orderRef.current(move.order);
    },
    [stopAutoScroll],
  );

  /**
   * Picking a conversation up: hold still, then move.
   *
   * `activateAfterLongPress` is what makes a drag and a scroll the same motion told apart by a
   * pause -- moving during the hold fails the gesture and the list scrolls, which is the only way
   * to reach a folder that is not on screen. On a cursor it is left out, for two reasons. A mouse
   * drags on the spot, so a hold under a pointer reads as the app ignoring the drag; and the web
   * implementation of the option fails the gesture on any movement past its own threshold *after*
   * the press has been held as well -- measured in a browser, the pan activated and then died on
   * the first move, which is the bug that made this gesture do nothing at all there.
   *
   * The callbacks stay on the JS thread: the hit test is a lookup in a Map, not a worklet, and
   * that is also what makes the whole thing testable without a device.
   */
  const dragGesture = useMemo(() => {
    const gesture = Gesture.Pan()
      .runOnJS(true)
      .activeCursor('grabbing')
      .withTestId('drawerDrag')
      // Every press starts here, whether it ends up being a drag or a tap: it is what tells the
      // click the last release sent that the owner has touched the list again.
      .onBegin(event => {
        swallowedPressRef.current = false;
        pressAtRef.current = { x: event.x, y: event.y };
      })
      // `onStart` is the activation, so it fires only once the hold has been kept: the drag
      // never begins on a gesture the list is going to scroll instead.
      .onStart(event => {
        // Where the press landed rather than where the pointer had got to: a cursor has no hold,
        // so this fires one mouse move after the press, and the row under the finger is the row
        // the press landed on.
        const at = pressAtRef.current ?? { x: event.x, y: event.y };
        beginDrag(at.y, at.x);
      })
      .onUpdate(event => updateDrag(event.y, event.x))
      .onEnd((_event, success) => endDrag(!success))
      .onFinalize(() => stopAutoScroll());
    return pointerFine ? gesture : gesture.activateAfterLongPress(DRAG_HOLD_MS);
  }, [beginDrag, endDrag, stopAutoScroll, updateDrag]);

  const renderEntry = useCallback(
    ({ item }: { item: DrawerEntry }) => {
      const line = lineOf(item);
      const droppedId = dropMove === null ? undefined : targetOf(dropMove);
      const dropped = droppedId !== undefined && line.folderId === droppedId;
      // The line in hand is faded, whichever line it is: a conversation or a whole folder.
      const lifted =
        dragging === null
          ? false
          : dragging.kind === 'thread'
            ? item.kind === 'row' && item.session.threadId === dragging.session.threadId
            : item.kind === 'header' && item.folder?.id === dragging.folder.id;
      // Every line is measured where it is drawn: the hit test below reads these boxes, and a line
      // that was never laid out is a line a finger cannot be over.
      const wrap = (body: React.JSX.Element): React.JSX.Element => (
        <View
          testID={`line:${item.key}`}
          onLayout={event => measureLine(item.key, event)}
          style={[dropped && styles.dropTarget, lifted && styles.lifted]}>
          {body}
        </View>
      );
      if (item.kind === 'empty') return wrap(<Text style={styles.empty}>{item.text}</Text>);
      if (item.kind === 'header') {
        const folder = item.folder;
        return wrap(
          <View style={styles.sectionRow}>
            <Pressable
              onPress={folder ? () => toggleFolder(folder.id) : undefined}
              disabled={folder === null}
              style={styles.sectionHeader}
              accessibilityRole={folder ? 'button' : undefined}
              accessibilityState={folder ? { expanded: !item.folded } : undefined}
              accessibilityLabel={folder ? `Folder ${folder.name}${badgeWords(item.badge)}` : undefined}>
              {/* A folder reads as a folder before its name is read: the same glyph the file tree
                  uses, in the same muted colour as the heading it sits on. The unfiled section
                  keeps the room without the glyph -- it is not a folder. */}
              {folder ? (
                <ChevronIcon direction={item.folded ? 'down' : 'right'} size={14} tone="faint" />
              ) : (
                <Text style={styles.sectionFold}>{''}</Text>
              )}
              <View style={styles.sectionGlyph}>
                {folder ? <FolderIcon size={15} tone="faint" /> : null}
              </View>
              <Text style={styles.sectionLabel} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
            {item.badge === null ? null : item.badge.kind === 'question' ? (
              <Text style={styles.sectionQuestion}>{`?${item.badge.count}`}</Text>
            ) : (
              <View style={styles.sectionActivity}>
                <View style={styles.sectionDot} />
                <Text style={styles.sectionActivityCount}>{item.badge.count}</Text>
              </View>
            )}
            {folder ? (
              <Pressable
                onPress={() => openFolderMenu(folder)}
                hitSlop={6}
                style={styles.sectionMenu}
                accessibilityRole="button"
                accessibilityLabel={`Actions for folder ${folder.name}`}>
                <MoreIcon size={16} tone="faint" />
              </Pressable>
            ) : null}
          </View>,
        );
      }
      return wrap(
        <ThreadRow
          item={item.session}
          active={item.session.threadId === activeThread}
          unread={unreadIds.has(item.session.threadId)}
          running={runningIds.has(item.session.threadId)}
          question={questionIds.has(item.session.threadId)}
          onOpen={openThread}
          onMenu={onThreadMenu}
        />,
      );
    },
    [
      activeThread,
      dragging,
      dropMove,
      measureLine,
      onThreadMenu,
      openFolderMenu,
      openThread,
      runningIds,
      toggleFolder,
      questionIds,
      unreadIds,
      styles,
    ],
  );

  useEffect(() => {
    if (pinned) return;
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: 200,
      // There is no native animation module in a browser: asking for one is a console warning
      // on every open, and the fallback it then takes is the JS driver anyway.
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [open, pinned, progress]);

  // Counter, not a boolean: pressing the shortcut twice must focus twice, and there is no state
  // to reset in between.
  // Only the mount on screen: the home list and the slide-over both hear the shortcut, and the
  // closed slide-over took the focus from the home list's own search (Android keyboard, 2026-10-06).
  const shown = open || pinned || home === true;
  useEffect(() => {
    if (focusSearch > 0 && shown) searchRef.current?.focus();
    // The shortcut is the trigger, not the opening: a drawer opened by a tap must not focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSearch]);

  // Horizontal drag closes the panel; vertical drags stay with the conversation list.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          gesture.dx < -8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderRelease: (_evt, gesture) => {
          if (gesture.dx < -50 || gesture.vx < -0.4) onClose();
        },
      }),
    [onClose],
  );

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-DRAWER_WIDTH, 0] });

  const content = (
    <>
        <View style={styles.head}>
          <Pressable
            onPress={onHome}
            hitSlop={8}
            style={styles.homeButton}
            accessibilityRole="button"
            accessibilityLabel="Home">
            <Text style={styles.brand}>MyClaw</Text>
          </Pressable>
          <View style={styles.headActions}>
            {pinned && onCollapse ? (
              <Pressable
                onPress={onCollapse}
                hitSlop={8}
                style={styles.folderButton}
                accessibilityRole="button"
                accessibilityLabel="Hide the conversation list">
                <SidebarIcon size={20} tone="faint" />
              </Pressable>
            ) : null}
            <Pressable
              onPress={onNewFolder}
              hitSlop={8}
              style={styles.folderButton}
              accessibilityRole="button"
              accessibilityLabel="New folder">
              <NewFolderIcon size={22} tone="text" />
            </Pressable>
            <Pressable
              onPress={onNewThread}
              hitSlop={8}
              style={styles.newButton}
              accessibilityRole="button"
              accessibilityLabel="New conversation">
              <PlusIcon size={20} tone="accent" />
            </Pressable>
          </View>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            ref={searchRef}
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="search"
            placeholderTextColor={palette.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search conversations"
          />
          <Pressable
            onPress={onOpenWorkspaceFilter}
            hitSlop={8}
            style={styles.filterButton}
            accessibilityRole="button"
            accessibilityLabel={
              workspaceFilter ? `Filter by workspace, ${workspaceFilter} selected` : 'Filter by workspace'
            }>
            <FilterIcon size={18} color={workspaceFilter ? palette.accent : palette.textMuted} />
          </Pressable>
        </View>

        {/* What is masked, and the tap that stops masking it. A filter with no trace on screen is
            a list that has lost conversations for no reason the owner can see. */}
        {workspaceFilter !== null ? (
          <Pressable
            onPress={onClearWorkspaceFilter}
            hitSlop={6}
            style={styles.filterChip}
            accessibilityRole="button"
            accessibilityLabel={`Clear the ${workspaceFilter} filter`}>
            <Text style={styles.filterChipText} numberOfLines={1}>
              {workspaceFilter}
            </Text>
            <CloseIcon size={16} tone="faint" />
          </Pressable>
        ) : null}

        <View style={styles.listArea}>
          {/* One detector for the whole list, not one per row: a row is unmounted the moment it
              leaves the window, and a gesture that lives on an unmounted row is a gesture that
              dies mid-drag. The list's own coordinates are what the hit test reads, so nothing
              has to measure the window either. */}
          <GestureDetector gesture={dragGesture}>
            <View style={styles.listBox}>
              <FlatList
                {...scrollProps}
                ref={listRef}
                style={styles.list}
                data={entries}
                keyExtractor={item => item.key}
                ItemSeparatorComponent={Separator}
                keyboardShouldPersistTaps="handled"
                // Virtualized by default; tuned so a long list scrolls without re-rendering
                // everything, and the memoized rows only update when their own props move.
                initialNumToRender={14}
                maxToRenderPerBatch={14}
                windowSize={9}
                removeClippedSubviews={Platform.OS === 'android'}
                // Each heading sits on the list it counts, which is the whole separation: a
                // labelled break reads as a break, where the hairline that used to stand here was
                // the very rule the plain rows use between themselves and so said nothing. Every
                // section carries its own, so the list needs no header of its own.
                renderItem={renderEntry}
                updateCellsBatchingPeriod={50}
              />
            </View>
          </GestureDetector>
          {/* The conversation in hand, lifted clear of the finger that is carrying it. */}
          {dragging ? (
            <Animated.View
              pointerEvents="none"
              onLayout={event => {
                chipSizeRef.current = {
                  width: event.nativeEvent.layout.width,
                  height: event.nativeEvent.layout.height,
                };
              }}
              style={[styles.dragChip, { transform: chipPos.getTranslateTransform() }]}>
              <Text style={styles.dragChipText} numberOfLines={1}>
                {dragging.kind === 'thread' ? dragging.session.title : dragging.folder.name}
              </Text>
            </Animated.View>
          ) : null}
          {indicator}
        </View>

        <View style={styles.footerRule} />
        <ServerSwitcher />
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
          {/* One row: More opens the sheet with the remaining destinations (Archived, Agents,
              Jobs); the gear jumps straight to Settings. The state line stays here because
              connection state is the one thing a footer is for. */}
          <View style={styles.footerBar}>
            <Pressable
              style={styles.footerMore}
              onPress={onOpenMore}
              accessibilityRole="button"
              accessibilityLabel="More">
              <View style={styles.footerMain}>
                <Text style={styles.footerTitle}>More</Text>
                <Text style={styles.footerMeta}>
                  <Text style={{ color: connectionState === 'connected' ? palette.ok : palette.textFaint }}>●</Text>{' '}
                  {STATE_LABEL[connectionState]}
                  {pending > 0 ? ` · ${pending} pending` : ''}
                </Text>
              </View>
              <ChevronIcon direction="right" size={16} tone="faint" />
            </Pressable>
            <Pressable
              style={styles.settingsButton}
              onPress={onOpenSettings}
              accessibilityRole="button"
              accessibilityLabel="Open settings">
              <GearIcon size={22} tone="text" />
            </Pressable>
          </View>
        </View>
    </>
  );

  // Pinned: part of the layout, laid out by the row it sits in. The safe-area padding is the
  // shell's job there, which is why only the slide-over pays the status bar itself.
  if (pinned) {
    return <View {...keyLayerProps('list')} style={[styles.panel, styles.panelPinned]}>{content}</View>;
  }
  // Home: full-screen list on phone/tablet when no thread is open. It sits inside the shell's
  // SafeAreaView and `container` (both already pay the top inset and its own padding), so it
  // must not add insets.top again or the list starts a band of empty space below the status
  // bar. Only the slide-over is absolutely positioned and has to pay the status bar itself.
  if (home) {
    return (
      <View
        {...keyLayerProps('list')}
        testID="home-screen"
        style={styles.homePanel}
      >
        {content}
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      </Animated.View>

      <Animated.View
        {...keyLayerProps('list')}
        style={[
          styles.panel,
          styles.panelFloating,
          // Closed, the panel sits at translateX(-DRAWER_WIDTH): shifted out of the window, but
          // its 1pt right border still lands at x=0 and shows as a stray vertical line. Fading
          // with the same progress that slides it hides the border when closed.
          { opacity: progress, paddingTop: insets.top + space.sm, transform: [{ translateX }] },
        ]}
        {...panResponder.panHandlers}>
        {content}
      </Animated.View>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  backdrop: { backgroundColor: palette.overlay },
  panel: {
    width: DRAWER_WIDTH,
    backgroundColor: palette.surface,
    borderRightWidth: 1,
    borderRightColor: palette.border,
  },
  panelFloating: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    left: 0,
  },
  // The column it sits in decides the width: the owner drags it (DesktopColumns).
  panelPinned: { paddingTop: space.sm, width: '100%' as const, flex: 1 },
  homePanel: {
    flex: 1,
    backgroundColor: palette.surface,
  },
  head: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  brand: { fontSize: 27, fontWeight: '800' as const, color: palette.text, letterSpacing: 0.2 },
  homeButton: {
    padding: 0,
    backgroundColor: 'transparent' as const,
    alignSelf: 'flex-start' as const,
  },
  /** The two ways in: a conversation, or a place to put one. The accent stays on the first. */
  headActions: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs },
  newButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.accentSoft,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  folderButton: {
    width: 40,
    height: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sectionRow: { flexDirection: 'row' as const, alignItems: 'center' as const },
  sectionMenu: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sectionMenuGlyph: { fontSize: 17, lineHeight: 20, color: palette.textFaint },
  /** The same pill a blocked row wears, with the count in it: one vocabulary, two scales. */
  sectionQuestion: {
    fontSize: font.micro,
    fontWeight: '700' as const,
    color: palette.surface,
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    minWidth: 16,
    textAlign: 'center' as const,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden' as const,
    marginRight: space.xs,
  },
  sectionActivity: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginRight: space.xs },
  sectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.accent },
  sectionActivityCount: { fontSize: font.micro, color: palette.textMeta },
  /** Indented onto the rows it heads, and the fold glyph takes the same room whether the section
   *  can be folded or not: the unfiled heading has to sit where the folder names do. */
  sectionHeader: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, paddingLeft: space.md },
  sectionFold: { width: 14, fontSize: font.micro, color: palette.textFaint },
  /** The glyph slot, held empty on the section that is not a folder: the names have to line up. */
  sectionGlyph: { width: 15 + space.xs, alignItems: 'center' as const, justifyContent: 'center' as const },
  sectionLabel: {
    paddingRight: space.md,
    paddingTop: space.xs,
    paddingBottom: space.xxs,
    fontSize: font.micro,
    color: palette.textMeta,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  listArea: { flex: 1 },
  /** The box the drag reads its coordinates in: same bounds as the list it wraps. */
  listBox: { flex: 1 },
  list: { paddingHorizontal: space.md },
  /** The section a release would file into. No border, no shift: only the fill changes. */
  dropTarget: { backgroundColor: palette.accentSoft },
  lifted: { opacity: 0.4 },
  dragChip: {
    position: 'absolute' as const,
    maxWidth: DRAWER_WIDTH - space.xl * 2,
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.accent,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    elevation: 6,
  },
  dragChipText: { fontSize: font.small, color: palette.text },
  searchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginHorizontal: space.md,
    marginBottom: space.sm,
  },
  search: {
    flex: 1,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.pill,
    fontSize: font.body,
    color: palette.text,
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: palette.surfaceAlt,
  },
  filterChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: space.xs,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: palette.accentSoft,
  },
  filterChipText: { fontSize: font.small, color: palette.text },
  filterChipGlyph: { fontSize: font.small, color: palette.textMuted },
  separator: { height: SEPARATOR_HEIGHT, backgroundColor: palette.border, marginHorizontal: 0 },
  empty: { padding: space.lg, fontSize: font.meta, color: palette.textFaint },
  /** The rule above the footer rides the same inset as the list separators and the footer's own
   *  hairlines, instead of running the full width of the panel. A borderTop on the footer would
   *  span the panel and clash with the two other rules it stands between. */
  footerRule: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
    marginHorizontal: space.md,
  },
  footer: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
  },
  footerBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  footerMore: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  footerMain: { flex: 1, gap: 1 },
  footerTitle: { fontSize: font.body, color: palette.text },
  footerMeta: { fontSize: font.small, color: palette.textMuted },
  footerGlyph: { fontSize: font.screen, color: palette.textFaint },
  settingsButton: {
    width: 56,
    height: 40,
    marginLeft: space.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
