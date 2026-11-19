import { AgentIcon, ArrowIcon, CameraIcon, ChevronIcon, FolderIcon, ImageIcon, MapIcon, MenuIcon, MoreIcon, PasteIcon, PinIcon, SlidersIcon } from '../components/icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Keyboard, Linking, PanResponder, Platform, Pressable, Text, View, type TextInput } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { Bubble } from '../components/Bubble';
import { ProviderNotice } from '../components/ProviderNotice';
import { CompactionBoundary, CompactionRunning } from '../components/CompactionBoundary';
import { DaySeparator } from '../components/DaySeparator';
import { FoldedRunGroup, RunGroup } from '../components/RunGroup';
import { RunFoot } from '../components/RunFoot';
import { ToolCard } from '../components/ToolCard';
import { SubAgentCard } from '../components/SubAgentCard';
import { SubAgentReturn } from '../components/SubAgentReturn';
import { CronDelivery } from '../components/CronDelivery';
import { dayAndTime } from '../core/clock';
import { QuestionCard } from '../components/QuestionCard';
import { Composer } from '../components/Composer';
import { ActionSheet } from '../components/ActionSheet';
import type { MediaItem } from '../components/MediaCarousel';
import { chatStore, isSubAgentTool, useActiveRun, useChatItems, useCompacting, useHistoryPage, useStopping, type ChatItem, type RunInfo, type RunSummaryItem, type TextItem } from '../core/chat';
import { buildRows, compactionRuleBefore, continueTarget, foldKeyOf, pinnedSends, withDaySeparators, type ChatRow } from '../core/runRows';
import { isSubAgentReturn, isCronDelivery } from '../core/subagentReturn';
import { newerLine, olderLine, recallLines, recallsDraft } from '../core/recall';
import { historyPillVisible } from '../core/historyPill';
import { pointerFine } from '../core/platform';
import { requestRunItems } from '../core/runItems';
import { dataUriType } from '../core/dataUri';
import { useThreadQuestions } from '../core/questionStore';
import { isGrouped } from '../core/grouping';
import { showsAgentsButton, showsModelButton } from './headerControls';
import type { DeviceInfo } from '../core/device';
import { connection } from '../core/connection';
import { recordDiag } from '../core/diagnostics';
import { probeText, revealFieldAboveKeyboard } from '../core/revealField';
import { keyboardResumeMismatch, onKeyboardResume, RESUME_CHECKS_MS } from '../core/keyboard';
import { deviceBridge, deviceEvents } from '../core/nativeBridge';
import { useCommands } from '../core/commands';
import { encodeCommandsList, encodeFileDelete, type AttachmentMeta, type LocationData, type LocationInput, type SpawnStatus, type SubAgentEntry } from '../core/protocol';
import { uploadMedia, type OutgoingAttachment, type PendingAttachment } from '../core/upload';
import { mediaUrl } from '../core/mediaUrl';
import { prefs } from '../core/prefs';
import { announceDraftFile, clearDraft, discardDraft, draftAttachmentsOf, draftScope, draftTextOf, forgetDraftFile, markDraftUploaded, onRemoteDraft, queueDraftSync, saveDraft } from '../core/drafts';
import type { VoiceRecording } from '../core/nativeBridge';
import { voiceFilename } from '../core/voice';
import { uuid, viewerFor, type ViewerKind } from '../core/utils';
import type { FileKind } from '../core/fileKind';
import { getCurrentLocation } from '../core/location';
import { locationPreview } from '../core/locationPreview';
import { LocationEditor } from '../components/LocationEditor';
import { locationMapUrl } from '../components/LocationView';
import type { WsState } from '../core/types';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { nearNewest, prependShift } from '../core/threadScroll';
import { conversationColumn, isDrawerSwipe, useLayout } from '../core/layout';
import { ContinueButton } from '../components/ContinueButton';
import { QuotaWaitBar } from '../components/QuotaWaitBar';
import type { QuotaRetryWait } from '../core/protocol';
import { watchFileDrop } from '../core/fileDrop';
import { selectableProps } from '../core/webProps';
import { RowBoundary } from './RowBoundary';
import { control, font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';

/** The map without one key, without touching the one it came from. */
function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [k, value] of Object.entries(map)) if (k !== key) next[k] = value;
  return next;
}

function pickAssetToPending(asset: { uri?: string; fileName?: string | null; type?: string | null; fileSize?: number | null }): PendingAttachment | null {
  if (!asset.uri) return null;
  // The web picker names nothing and types nothing; its data: URI still says what it holds, and
  // without that a photo was sent as a file called .jpg whatever it was.
  const mimeType = asset.type ?? dataUriType(asset.uri) ?? 'application/octet-stream';
  const extension = mimeType.startsWith('image/') ? mimeType.slice(6).replace('jpeg', 'jpg').replace(/\+.*/, '') : 'jpg';
  const filename = asset.fileName ?? `photo-${Date.now()}.${extension}`;
  const type: AttachmentMeta['type'] = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : 'file';
  return { id: uuid(), uri: asset.uri, filename, type, mimeType, sizeBytes: asset.fileSize ?? undefined };
}

/**
 * The list's threshold while the reader follows, and it is not a distance. The native helper reads
 * the offset *before* it corrects it, and its own correction pushes that offset past any distance
 * we could name: at 120, the first correction after an arriving item took the follow away for good,
 * and the answer streaming under it never gave it back (2026-09-14). The largest 32-bit signed
 * integer, so Android's getInt reads it back exactly, means "always". What ends the follow is a
 * gesture, never a correction. docs/thread-scroll.md
 */
const FOLLOW_THRESHOLD = 2_147_483_647;

/**
 * How many rows the web's thread mounts in its first commit.
 *
 * The page the server hands a conversation is 50 messages; this covers it with room for a couple of
 * prepends, and stops there. Past it the list is a list again: nothing is watched on screen at the
 * size where that matters.
 */
const WEB_FIRST_BATCH = 80;

const keyOfRow = (row: ChatRow): string => {
  if (row.kind === 'item') return row.item.id;
  // The rule has no id of its own: one compaction runs at a time on a thread, so one rule.
  if (row.kind === 'rule') return 'rule:compaction';
  // One divider per calendar day: the day itself is the identity.
  if (row.kind === 'day') return `day:${row.day}`;
  // The empreinte row is the run's, and a run signs once.
  if (row.kind === 'foot') return `foot:${row.run.id}`;
  // Not the run id alone: a run has one fold per burst now, and two rows sharing a key drop one.
  // `foldKeyOf` is stable across the swap from a folded row to the items it stood for, which is
  // what lets the open state ride along -- docs/run-hydration.md.
  return `fold:${foldKeyOf(row)}`;
};

export function ChatScreen({
  threadId,
  title,
  subtitle,
  share,
  meter,
  connectionState,
  mediaBase,
  deviceInfo,
  hint,
  autoFocusHero,
  onOpenDrawer,
  onBack,
  onStatusPress,
  onSend,
  locationEnabled,
  onBubbleMenu,
  onBubbleCopy,
  onResend,
  onOpenImage,
  onOpenText,
  onOpenVideo,
  onOpenSvg,
  onOpenPdf,
  onOpenHtml,
  onOpenOffice,
  onOpenArchive,
  onOpenFile,
  onOpenMenu,
  onOpenModel,
  onCommandEntered,
  onTagCommand,
  streaming,
  onStop,
  onContinue,
  quotaWait,
  onQuotaCancel,
  onQuotaRetryNow,
  onQuestionReply,
  onNewThread,
  subagentCount,
  onAgentsPress,
  subagent,
  subagentDoors,
  subagentsById,
  spawnLive,
  onOpenSubAgent,
  onOpenSubAgentById,
  onOpenCronRun,
  onSubAgentMenu,
  onLoadOlder,
  loadingOlder,
  uiPrefs,
}: {
  threadId: string;
  title: string;
  subtitle: string;
  /**
   * The context share, as its own run on the facts line, where the gauge is not drawn.
   *
   * It used to be the last field of `subtitle` and shared its `numberOfLines`: a long provider id
   * cut the two together, so the one number that is a reading disappeared behind a label (owner,
   * 2026-11-04). Separate, the name yields and this does not.
   */
  share?: string;
  /** The context gauge, drawn only where the title bar has the room for three numbers. */
  meter?: React.ReactNode;
  connectionState: WsState;
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
  hint?: string;
  autoFocusHero: boolean;
  onOpenDrawer: () => void;
  /** Leaves a sub-agent for the conversation that reached it. Only ever set with `subagent`. */
  onBack?: () => void;
  onStatusPress: () => void;
  onSend: (text: string, attachments?: OutgoingAttachment[], location?: LocationInput) => void;
  /** Server capability; false until the post-connect capability frame says otherwise. */
  locationEnabled: boolean;
  onBubbleMenu: (item: TextItem) => void;
  /** Copy a message's words in one press: the web's shortcut around the sheet. */
  onBubbleCopy?: (item: TextItem) => void;
  /** A message of the owner's that never got its receipt is sent again, same id. */
  onResend: (item: TextItem) => void;
  onOpenImage: (images: MediaItem[], index: number) => void;
  onOpenText: (target: { url: string; filename: string; kind?: FileKind }) => void;
  onOpenVideo: (target: { url: string; filename: string }) => void;
  onOpenSvg: (target: { url: string; filename: string }) => void;
  onOpenPdf: (target: { url: string; filename: string }) => void;
  onOpenHtml: (target: { url: string; filename: string }) => void;
  onOpenOffice: (target: { url: string; filename: string }) => void;
  onOpenArchive: (target: { url: string; filename: string }) => void;
  onOpenFile: (target: { url: string; filename: string; sizeBytes?: number }) => void;
  /** The command menu of the app (model, stop, clear, ...). */
  onOpenMenu: () => void;
  /**
   * The model picker, as a control of its own in the title bar.
   *
   * Drawn only where the bar has the room for it (`MODEL_BUTTON_MIN_WIDTH`), which is also the
   * condition under which the command menu drops its own Model… entry: one action is reachable one
   * way at a time. Where the bar is too narrow the entry stays in the menu, and the icon disappears,
   * so nothing is ever offered twice or lost.
   */
  onOpenModel?: () => void;
  /** A slash command was chosen; true when the app handled it natively. */
  onCommandEntered: (command: string) => boolean;
  /** A submitted /tag text was handled natively; true keeps it out of the wire. */
  onTagCommand?: (text: string) => boolean;
  /** A run is answering on this thread (streaming or between tools): the composer offers Stop. */
  streaming: boolean;
  onStop: () => void;
  /** Picks the thread's last run back up where it stopped (error, Stop, lost), with no message. */
  onContinue?: () => void;
  /** An armed wait for a spent quota: the pill replaces Continue until it fires or is cancelled. */
  quotaWait?: QuotaRetryWait;
  onQuotaCancel?: () => void;
  onQuotaRetryNow?: () => void;
  /** The owner answered the questions of one ask: sent as one batch. */
  onQuestionReply: (id: string, answers: string[][]) => void;
  /** Wire /new: starts a fresh conversation, like the + button. */
  onNewThread: () => void;
  /** Sub-agents this conversation reaches. 0 hides the counter entirely. */
  subagentCount?: { total: number; running: number };
  onAgentsPress?: () => void;
  /**
   * Set while this screen shows a sub-agent rather than a conversation. The header then names the
   * parent, because a chat that looks like every other chat must say what it is before the user
   * types into it.
   */
  /**
   * A sub-agent on screen: what its header says. `model` is the facts line the conversation's own
   * header carries (provider / model, what is answering now, the effort), composed by the shell --
   * a sub-agent runs a model of its own and can walk off it like any other run.
   */
  subagent?: { id: string; type: string; status: 'idle' | 'running'; parentTitle: string; model?: string };
  /**
   * Which `spawn` cards lead to a sub-agent that still exists, keyed by chat item id. Built from
   * the roster, so a killed sub-agent stops offering a door instead of opening a dead thread.
   */
  subagentDoors: Map<string, { label: string; status: 'idle' | 'running'; model?: string; modelLive?: boolean }>;
  /**
   * The agents a report card can open, keyed by the child's own id (`from.id`). Built from the
   * same roster as `subagentDoors`: a killed child stops offering a door rather than opening a
   * dead thread, and a stopped one keeps it, which is the card the owner comes back to.
   */
  subagentsById?: Map<string, SubAgentEntry>;
  /** Opens a child by id, from a report card. */
  onOpenSubAgentById?: (subagentId: string) => void;
  /** Live sub-agent lifecycle state per spawn card, pushed by `chat.spawn.start/end` frames. */
  spawnLive?: Map<string, { subagentId: string; displayName: string; status: SpawnStatus }>;
  onOpenSubAgent?: (toolItemId: string) => void;
  /**
   * Opens the run a scheduled job's delivery came from: its own thread, named after the job, the
   * way the runs page opens one.
   */
  onOpenCronRun?: (threadId: string, title: string) => void;
  onSubAgentMenu?: () => void;
  /** Asks for the page of history just older than what is on screen. */
  onLoadOlder: () => void;
  /** A page is in flight: the spinner sits at the far end, which is the top of the reading order. */
  loadingOlder: boolean;
  /** Server-owned display prefs (tool/reasoning auto-expand), applied to every card. */
  uiPrefs?: { expandTools?: boolean; expandReasoning?: boolean } | null;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const layout = useLayout();
  // The model picker takes the bar's fourth slot only where the text block can keep a name whole.
  // See `app/headerControls.ts` for the measurement and for why the menu reads the same predicate.
  const showModelButton = showsModelButton(layout.width);
  // And the sub-agent badge, at a higher bar: it costs the facts line twice, a 50 pt badge and the
  // name beside it. Below its threshold the roster moves into the session menu, which `AppShell`
  // reads off this same predicate.
  const showAgentsButton = showsAgentsButton(layout.width);
  // A conversation is prose: past ~90 characters a line stops being readable, however wide the
  // window is. The column is centred inside the pane rather than stretched across it.
  const column = useMemo(() => conversationColumn(layout.readingWidth), [layout.readingWidth]);
  // Every row of the thread, bubble or card, sits in this one column. A tool card is not prose
  // and wants more than the reading width, but giving the two their own centred columns put their
  // left edges 60pt apart, and a thread whose rows do not share an edge reads as broken
  // alignment. So one column decides where a row starts and ends, and prose is capped inside its
  // own bubble (88% of it, which lands on the reading width by design).
  const toolColumn = useMemo(
    () => ({ maxWidth: layout.toolWidth, width: '100%' as const, alignSelf: 'center' as const }),
    [layout.toolWidth],
  );
  /**
   * Whether the list runs newest-first, which is a platform decision and not a preference.
   *
   * A phone inverts it: offset 0 is the bottom, so a conversation opens on its last message with
   * no scrolling at all, and the keyboard shrinking the viewport leaves that offset alone. A
   * browser cannot: there the inversion is a DOM order that runs backwards from the visual one,
   * and a browser selects text in DOM order -- dragging over several bubbles starts at the wrong
   * end and can snap to the whole thread (owner, 2026-11-14). The web keeps the document in
   * reading order and pins itself to the bottom instead. `core/threadScroll.ts` holds the
   * arithmetic both geometries share; docs/thread-scroll.md says why they differ.
   */
  const inverted = Platform.OS !== 'web';
  /** The content height last reported, so a page prepended above the reader can be measured. */
  const contentRef = useRef(0);
  /** The viewport height last measured, so "the end" is a measurement rather than an estimate. */
  const viewportRef = useRef(0);
  /** A page of older rows asked for on the web, and the viewport to hold while it lands. */
  const prependAnchor = useRef<{ offset: number; content: number } | null>(null);
  const listRef = useRef<FlatList<ChatRow>>(null);
  // A right swipe opens the list. Bubbling, never capture: a diff or a carousel that scrolls
  // sideways claims the gesture first, and the reader of a wrapped block means the block.
  const drawerSwipeRef = useRef({ open: onOpenDrawer, pinned: layout.pinnedDrawer });
  drawerSwipeRef.current = { open: onOpenDrawer, pinned: layout.pinnedDrawer };
  const drawerSwipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 12 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.6 &&
          !drawerSwipeRef.current.pinned,
        onPanResponderRelease: (_event, gesture) => {
          if (isDrawerSwipe(gesture.dx, gesture.dy, drawerSwipeRef.current.pinned)) {
            drawerSwipeRef.current.open();
          }
        },
      }),
    [],
  );
  // Subscribed here rather than handed down: a growing bubble must not re-render the shell that
  // holds every page of the app, only the conversation showing it.
  const items = useChatItems(threadId);
  // A run is live for the fold while the store still holds it: an item's own status can lag behind
  // a closed cycle, and the spinner would then never stop. See `useActiveRun`.
  const activeRun = useActiveRun(threadId);
  // A compaction running on this conversation: thread state, drawn as a rule at the bottom of the
  // list rather than as an item in it (CompactionRunning says why).
  const compacting = useCompacting(threadId);
  // A stop in flight on this conversation, whichever surface took it: the live rule drops its
  // counter for "Stopping…", and the composer's corner turns its ■ into a loader.
  const stopping = useStopping(threadId);
  // The questions waiting on this conversation, from the store rather than a prop: the form is a
  // row of the list, so it must survive this screen being unmounted and remounted.
  const questions = useThreadQuestions(threadId);
  const questionPending = questions.length > 0;
  // Keyed by the tool card the ask belongs to. A run blocked on a question stopped right there,
  // so drawing the form on that card puts it where the thread actually stops.
  const questionByCard = useMemo(() => {
    const map = new Map<string, (typeof questions)[number]>();
    for (const ask of questions) if (ask.replyToId) map.set(ask.replyToId, ask);
    return map;
  }, [questions]);
  // An ask with no card to sit on: a provider that sent no tool call id, or a card that is not in
  // the page this screen holds. Rather than lose the question, those are drawn under the thread --
  // the list is inverted, so its header is the bottom of the screen. Nothing is scanned while no
  // question is pending, which is almost always.
  const questionsLoose = useMemo(() => {
    if (questions.length === 0) return questions;
    const ids = new Set(items.map(item => item.id));
    return questions.filter(ask => !ask.replyToId || !ids.has(ask.replyToId));
  }, [questions, items]);
  const [draft, setDraft] = useState(() => draftTextOf(threadId));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [atBottom, setAtBottom] = useState(true);
  // Whether the reader is following the newest message. Not `atBottom`: that one is re-read on
  // every scroll event, corrections included, so it cannot answer "did a hand put me here".
  const [following, setFollowing] = useState(true);
  /** The same value, readable from a scroll handler that must not re-subscribe on every change. */
  const followingRef = useRef(true);
  const followNewest = useCallback((on: boolean) => {
    followingRef.current = on;
    setFollowing(on);
  }, []);
  /**
   * Put the newest message back on screen, whichever end of the range it is at.
   *
   * Inverted, it is offset 0 and the move is exact. The other way round the end is a number too --
   * content height minus viewport, both measured -- and it has to be that number rather than
   * `scrollToEnd`, which aims at an estimate built from the average cell height and stops short of
   * it: on a thread of two-line turns the last answer stayed clipped under the composer.
   */
  /**
   * Positions we asked the list for, whose own scroll event has not arrived yet.
   *
   * On the web "the reader moved up" is inferred from the offset: there is no gesture to listen to
   * on a scrollbar (`threadScroll.ts`). A list still measuring its rows shrinks the content under a
   * scroll we asked for, the browser clamps the target, and the event that follows reads as a hand
   * that never touched anything -- the pin was dropped while the thread was opening, and it stayed
   * short of its last message (owner, 2026-11-19: "quand j'ouvre la session je suis pas tout en
   * bas"). Counting our own scrolls is what tells the two apart.
   */
  const ownScrolls = useRef(0);
  const scrollTo = useCallback((offset: number, animated: boolean) => {
    ownScrolls.current += 1;
    listRef.current?.scrollToOffset({ offset, animated });
  }, []);
  const scrollToNewest = useCallback(
    (animated: boolean) => {
      if (inverted) {
        scrollTo(0, animated);
        return;
      }
      scrollTo(Math.max(contentRef.current - viewportRef.current, 0), animated);
    },
    [inverted, scrollTo],
  );
  /** Where the list is, because the reveal has to know what it is lifting from. */
  const offsetRef = useRef(0);
  /**
   * How tall the composer is.
   *
   * The thread is a column: the list takes what the composer leaves. When the composer grows under
   * it -- a staged file, a location chip, a draft that wrapped -- the list keeps its content where
   * it was, so the newest lines slid under the composer's new edge and stayed there until the
   * reader scrolled (owner, 2026-11-08: "les pieces jointes cachent les dernieres lignes").
   */
  const [composerHeight, setComposerHeight] = useState(0);
  /**
   * The list's viewport and the height of what it holds, from the scroll indicator's own measure.
   * A thread that does not fill the viewport has nothing to scroll and no end to reach.
   */
  const [listMeasure, setListMeasure] = useState<{ viewport: number; content: number }>();
  /**
   * Whether the web's thread is still finding its end, and must not be drawn yet.
   *
   * The list is pinned to the last message rather than starting there, so it grows its content in
   * batches and re-pins after each one: the reader watched the thread sweep past in five steps
   * before it settled (owner, 2026-11-15). The first page is mounted in one commit now
   * (`WEB_FIRST_BATCH`), and this hides what the commits that remain would show: nothing paints
   * until the content has stopped changing for longer than the batching period.
   *
   * True from the first frame everywhere but the web, and latched, so a later content-size change
   * -- a streaming answer, a page landing above -- never hides anything. It is a one-shot for the
   * opening, not a gate on the list.
   */
  const [endSettled, setEndSettled] = useState(inverted);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearSettleTimer = useCallback(() => {
    if (settleTimer.current === null) return;
    clearTimeout(settleTimer.current);
    settleTimer.current = null;
  }, []);
  useEffect(() => clearSettleTimer, [clearSettleTimer]);
  const commands = useCommands();
  const inCommandRef = useRef(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>(() => draftAttachmentsOf(threadId));
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [clipboardImage, setClipboardImage] = useState(false);
  /** Percent of each staged file that has reached the server, keyed by attachment id. */
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  /** A staged upload that failed. The chip says which one, and the send tries it again. */
  const [uploadFailed, setUploadFailed] = useState<Record<string, true>>({});
  /**
   * Stages consumed by a send, by local chip id. The upload finishes after the message has left
   * when it was in flight, and announcing it then put the file back on the composer of every
   * device -- the send had already pruned the id, the announce added it again.
   */
  const consumedRef = useRef(new Set<string>());
  /** The upload running for each staged file, so a send waits for it instead of pushing twice. */
  const uploadsRef = useRef(new Map<string, Promise<string>>());
  const mediaBaseRef = useRef(mediaBase);
  mediaBaseRef.current = mediaBase;
  const [location, setLocation] = useState<LocationData | undefined>();
  const [locationBusy, setLocationBusy] = useState(false);
  /** Owner decision on the display address: null = provider value, '' = coordinates only. */
  const [addressOverride, setAddressOverride] = useState<string | null>(null);
  const [locationSheet, setLocationSheet] = useState(false);
  const [locationDraft, setLocationDraft] = useState('');

  useEffect(() => {
    setLocation(undefined);
    setLocationBusy(false);
    setAddressOverride(null);
    setLocationSheet(false);
    setLocationDraft('');
    // A conversation opens on its newest message, so the reader is at the bottom by definition.
    // Only a scroll event used to say so, and a thread swap produces none: the flag stayed on
    // whatever the previous thread left, which showed the jump pill on a thread already at its
    // end and, worse, withheld the trim permission from a thread that had earned it.
    setAtBottom(true);
    followNewest(true);
    // The pinned state is what opens the thread on its last message on the web, where the list
    // starts at the top of the document: the first content size to arrive is followed to the end.
    offsetRef.current = 0;
    contentRef.current = 0;
    prependAnchor.current = null;
    // A fresh conversation has to find its end again: the flag is the opening's, not the screen's.
    clearSettleTimer();
    setEndSettled(inverted);
    chatStore.setTrimAllowed(threadId, true);
  }, [clearSettleTimer, followNewest, inverted, threadId]);

  /**
   * A draft belongs to its conversation, not to this component. The cleanup runs both when the
   * screen is unmounted (a page covering the chat on a phone) and just before the swap to
   * another conversation, which is what stops a message written here from being sent there.
   */
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  /**
   * The composer grew under the thread: follow it back down.
   *
   * A row pinned at the bottom of a shrinking viewport is the last line sliding under the composer,
   * and an inverted list does not move its content for that -- offset 0 is the bottom whenever
   * anybody asks it to be. So a reader who was following gets the newest message back on screen,
   * and a reader who had scrolled up is left exactly where they were reading.
   */
  const composerWasRef = useRef(0);
  useEffect(() => {
    const grew = composerHeight > composerWasRef.current;
    composerWasRef.current = composerHeight;
    if (!grew || !following) return;
    scrollToNewest(false);
  }, [composerHeight, following, scrollToNewest]);
  useEffect(() => {
    const scope = draftScope();
    setDraft(draftTextOf(threadId));
    setAttachments(draftAttachmentsOf(threadId));
    return () => saveDraft(threadId, draftRef.current, attachmentsRef.current, scope);
  }, [threadId]);

  /**
   * The chips on screen are the composer's truth while it is open, so the store stays level with
   * them: it is what another window's list is merged into, and an upload still running has no
   * server id yet -- a `draft.files.changed` landing now must keep that chip, not drop it.
   */
  useEffect(() => {
    saveDraft(threadId, draftRef.current, attachments);
  }, [attachments, threadId]);

  /** Every change, so the owner's other devices see it. Debounced and deduped by the store. */
  const changeDraft = useCallback(
    (text: string) => {
      // The ref too, not only the state: a change made in the same tick as the swap to a page
      // (a slash command that opens one) never renders before the unmount saves the draft, and
      // the cleared field came back with the command still in it.
      draftRef.current = text;
      setDraft(text);
      queueDraftSync(threadId, text);
    },
    [threadId],
  );

  /** Sent, or otherwise consumed: drops the pending sync too, or it would land after the send. */
  const consumeDraft = useCallback(() => {
    draftRef.current = '';
    setDraft('');
    clearDraft(threadId);
  }, [threadId]);

  /**
   * Consumed without being sent: a slash command opened a page, or `/new` left the thread. No
   * message reaches the server to clear its copy, so the clear is said out loud.
   */
  const discardComposer = useCallback(() => {
    draftRef.current = '';
    setDraft('');
    discardDraft(threadId);
  }, [threadId]);

  /**
   * A draft written on another device. Applied only into a composer that is empty, or that the
   * owner is not typing in: replacing live text loses characters and throws the caret to the end,
   * and the phone in a pocket is exactly the surface that should catch up.
   */
  const focusedRef = useRef(false);
  /** The same fact as a state: the history arrows belong to a field that has the caret. */
  const [composerFocused, setComposerFocused] = useState(false);
  /**
   * Whether the keyboard is up.
   *
   * Dismissing the IME with Android's back button leaves the caret in the field, so focus is not
   * the same question: the history pill hung over the thread with nothing to type into, over the
   * text it was covering (owner, 2026-11-08). Starts true -- the field is not focused yet, so
   * nothing is drawn -- and the platform is the one that says otherwise.
   */
  const [keyboardUp, setKeyboardUp] = useState(true);
  useEffect(() => {
    const shown = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const up = Keyboard.addListener(shown, () => setKeyboardUp(true));
    const down = Keyboard.addListener('keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      up.remove();
      down.remove();
    };
  }, []);
  useEffect(
    () =>
      onRemoteDraft(changed => {
        if (changed !== threadId) return;
        // The store only adopts a remote draft when this composer is not ahead of the server, so
        // what it holds is always what the screen should show -- a clear that follows a send
        // included, even while the field has the caret. The old guard here ("not while focused")
        // kept a sent message on screen and then saved it back, which is how it kept coming back.
        setDraft(draftTextOf(threadId));
        setAttachments(draftAttachmentsOf(threadId));
      }),
    [threadId],
  );

  // Re-fetch the catalog every time the user starts a command: a command added on the server
  // is visible on the next "/" without an app release.
  useEffect(() => {
    const inCommand = draft.trim().startsWith('/');
    if (inCommand && !inCommandRef.current) connection.send(encodeCommandsList());
    inCommandRef.current = inCommand;
  }, [draft]);

  /**
   * A picked file goes to the server at once, not at send time.
   *
   * Three things rest on it. The file is on the machine either way, so it shows up in the
   * conversation's files and another device can open it before anything is sent. The chip has the
   * server's own copy to draw a thumbnail from. And a send has nothing left to push but words.
   *
   * A failure is not a banner: the chip says which file it was, and the send uploads it again.
   */
  const startUpload = useCallback(
    (pending: PendingAttachment): void => {
      if (!deviceInfo || uploadsRef.current.has(pending.id)) return;
      const job = uploadMedia(mediaBase, deviceInfo, threadId, pending, (bytes, total) => {
        setUploadProgress(current => ({ ...current, [pending.id]: Math.round((bytes / total) * 100) }));
      })
        .then(uploaded => {
          if (mediaBaseRef.current !== mediaBase) throw new Error('server changed during upload');
          setAttachments(current =>
            current.map(item => (item.id === pending.id ? { ...item, mediaId: uploaded.id } : item)),
          );
          // The bytes are on the server and belong to an unsent message: say so, so the chip
          // follows the owner to another device and survives this one being killed. Not when the
          // send already took this chip: the message carries the id, and the pending list must
          // not grow it back.
          if (!consumedRef.current.has(pending.id)) {
            markDraftUploaded(threadId, pending.id, uploaded.id);
            announceDraftFile(threadId, uploaded.id, {
              ...(pending.audioAsVoice ? { audioAsVoice: true } : {}),
              ...(pending.durationMs === undefined ? {} : { durationMs: pending.durationMs }),
            });
          }
          return uploaded.id;
        })
        .catch((err: unknown) => {
          // Out of the map: a later send uploads it again rather than awaiting a refusal.
          uploadsRef.current.delete(pending.id);
          setUploadFailed(current => ({ ...current, [pending.id]: true }));
          throw err;
        });
      uploadsRef.current.set(pending.id, job);
      // Nobody is awaiting it yet. The chip reads the failure, and the send reads it if it comes.
      job.catch(() => {});
    },
    [deviceInfo, mediaBase, threadId],
  );

  const addAssets = useCallback(async (assets: Array<{ uri?: string; fileName?: string | null; type?: string | null; fileSize?: number | null }>) => {
    const prepared: PendingAttachment[] = [];
    for (const asset of assets) {
      const pending = pickAssetToPending(asset);
      if (!pending) continue;
      // content:// uris (gallery, Photo Picker) are unreadable by RN fetch: copy to the cache
      // through the bridge so the upload can read them.
      if (!pending.uri.startsWith('file://')) {
        try {
          const copy = await deviceBridge.prepareFile(pending.uri);
          pending.uri = copy.uri;
          if (!pending.sizeBytes && copy.size > 0) pending.sizeBytes = copy.size;
        } catch {
          // Keep the original uri; the upload will surface a readable error.
        }
      }
      prepared.push(pending);
    }
    if (prepared.length > 0) {
      setAttachments(current => [...current, ...prepared]);
      for (const pending of prepared) startUpload(pending);
    }
  }, [startUpload]);

  const pickPhotos = useCallback(() => {
    setAttachOpen(false);
    launchImageLibrary({ mediaType: 'photo', selectionLimit: 0, quality: 0.8 }, result => {
      if (!result.didCancel && result.assets) addAssets(result.assets);
    });
  }, [addAssets]);

  const takePhoto = useCallback(() => {
    setAttachOpen(false);
    launchCamera({ mediaType: 'photo', saveToPhotos: true, quality: 0.8 }, result => {
      if (!result.didCancel && result.assets) addAssets(result.assets);
    });
  }, [addAssets]);

  const shareLocation = useCallback(async () => {
    setAttachOpen(false);
    setLocationBusy(true);
    setUploadError(null);
    try {
      const input = await getCurrentLocation();
      setLocation(input);
      setAddressOverride(null);
      // The preview is best-effort: a late or missing answer leaves the chip with accuracy
      // only, and the send still carries the exact coordinates.
      locationPreview
        .request(input)
        .then(enriched => {
          setLocation(current =>
            current &&
            current.capturedAt === input.capturedAt &&
            current.latitude === input.latitude &&
            current.longitude === input.longitude
              ? enriched
              : current,
          );
        })
        .catch(() => {});
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'location unavailable');
    } finally {
      setLocationBusy(false);
    }
  }, []);

  const openLocationSheet = useCallback(() => {
    if (!location) return;
    setLocationDraft(addressOverride ?? location.address?.formatted ?? '');
    setLocationSheet(true);
  }, [location, addressOverride]);

  const closeLocationSheet = useCallback(() => {
    const edited = locationDraft.trim();
    if (location) {
      const providerText = location.address?.formatted ?? '';
      setAddressOverride(edited === providerText ? null : edited);
    }
    setLocationSheet(false);
  }, [location, locationDraft]);

  const removeLocation = useCallback(() => {
    setLocation(undefined);
    setAddressOverride(null);
    setLocationSheet(false);
  }, []);

  /**
   * A file dragged onto the window, or pasted into it, is staged exactly like a picked one.
   * No-op on Android.
   */
  useEffect(
    () =>
      watchFileDrop(files => {
        addAssets(
          files.map(file => ({
            uri: file.uri,
            fileName: file.name,
            type: file.type,
            fileSize: file.size || undefined,
          })),
        );
      }),
    [addAssets],
  );

  /**
   * Paste an image from the system clipboard.
   *
   * Android has no way to hand a pasted image to a React Native TextInput: RN 0.86 exposes no
   * paste event and its EditText implements neither commitContent nor setContentMimeTypes, so
   * the gesture becomes an entry in the sheet that already holds every other way to attach.
   * The web has Ctrl+V (fileDrop.web.ts) and keeps this as the pointer-only fallback.
   */
  const pasteImage = useCallback(() => {
    setAttachOpen(false);
    setUploadError(null);
    deviceBridge
      .clipboardImage()
      .then(file => {
        if (!file) {
          setUploadError('no image in the clipboard');
          return;
        }
        return addAssets([
          { uri: file.uri, fileName: file.name, type: file.type, fileSize: file.size || undefined },
        ]);
      })
      .catch(() => setUploadError('clipboard unavailable'));
  }, [addAssets]);

  const openAttach = useCallback(() => {
    setAttachOpen(true);
    // Asked every time the sheet opens: the clipboard changes while the app is in the
    // background, and a cached answer would offer a paste of something that is gone.
    deviceBridge
      .clipboardHasImage()
      .then(setClipboardImage)
      .catch(() => setClipboardImage(false));
  }, []);

  const pickFiles = useCallback(() => {
    setAttachOpen(false);
    deviceBridge
      .pickFile()
      .then(files => {
        addAssets(
          files.map(file => ({
            uri: file.uri,
            fileName: file.name,
            type: file.type,
            fileSize: file.size || undefined,
          })),
        );
      })
      .catch(() => {});
  }, [addAssets]);

  /**
   * A finished take is staged, not sent. Releasing the mic is the end of the recording, not the
   * decision to send it: the note waits in the composer like any attachment, so a caption or a
   * second file can join it, and it leaves on the same send as everything else.
   */
  const stageVoiceNote = useCallback(
    (recording: VoiceRecording) => {
      const mimeType = recording.mimeType ?? 'audio/mp4';
      const pending: PendingAttachment = {
        id: `voice-${recording.uri}`,
        uri: recording.uri,
        filename: voiceFilename(new Date(), mimeType),
        type: 'audio',
        mimeType,
        sizeBytes: recording.sizeBytes,
        audioAsVoice: true,
        durationMs: recording.durationMs,
      };
      setUploadError(null);
      setAttachments(current => [...current, pending]);
      startUpload(pending);
    },
    [startUpload],
  );

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let active = true;
    deviceBridge.setRecordingContext(threadId);
    const restore = (): void => {
      deviceBridge.voiceDrafts().then(drafts => {
        if (!active) return;
        const restored = drafts.filter(item => item.threadId === threadId && item.recording.durationMs >= 700).map(item => ({
          id: `voice-${item.recording.uri}`,
          uri: item.recording.uri,
          filename: voiceFilename(new Date(), 'audio/mp4'),
          type: 'audio' as const,
          mimeType: 'audio/mp4',
          sizeBytes: item.recording.sizeBytes,
          audioAsVoice: true,
          durationMs: item.recording.durationMs,
        }));
        if (!restored.length) return;
        setAttachments(current => {
          const known = new Set(current.map(item => item.id));
          return [...current, ...restored.filter(item => !known.has(item.id))];
        });
        setUploadError('Recording interrupted. Voice note kept as a draft.');
      }).catch(() => { if (active) setUploadError('Could not restore the interrupted recording.'); });
    };
    restore();
    const interrupted = deviceEvents.addListener('claw:voice:interrupted', restore);
    const resumed = AppState.addEventListener('change', state => { if (state === 'active') restore(); });
    return () => { active = false; interrupted.remove(); resumed.remove(); deviceBridge.setRecordingContext(null); };
  }, [threadId, mediaBase]);

  const submit = useCallback(() => {
    // The button is disabled while an upload runs, and this is what covers the keyboard: Enter
    // does not read the button's state.
    if (uploadingRef.current) return;
    const text = draft.trim();
    if (!text && attachments.length === 0 && !location) return;
    // From here on the message owns these chips: an upload that lands later must not announce
    // them back into the pending list after the send pruned them.
    for (const attachment of attachmentsRef.current) consumedRef.current.add(attachment.id);
    const stagedLocation = location;
    // The wire carries coordinates and the owner's address decision, never the provider text.
    const locationToSend: LocationInput | undefined = stagedLocation
      ? {
          latitude: stagedLocation.latitude,
          longitude: stagedLocation.longitude,
          accuracyMeters: stagedLocation.accuracyMeters,
          capturedAt: stagedLocation.capturedAt,
          ...(stagedLocation.altitudeMeters === undefined ? {} : { altitudeMeters: stagedLocation.altitudeMeters }),
          ...(stagedLocation.headingDegrees === undefined ? {} : { headingDegrees: stagedLocation.headingDegrees }),
          ...(stagedLocation.speedMetersPerSecond === undefined ? {} : { speedMetersPerSecond: stagedLocation.speedMetersPerSecond }),
          ...(addressOverride !== null ? { addressOverride: { formatted: addressOverride } } : {}),
        }
      : undefined;
    // /tag is app-owned: it opens the tags page or the tag editor, never a message to the
    // model. Intercepted here so it works even when the slash-menu is closed.
    if (!stagedLocation && attachments.length === 0 && onTagCommand?.(text) === true) {
      discardComposer();
      return;
    }
    // /new is the wire form of the + button: a fresh conversation, not a reset of this one.
    // Intercepted here so it works even when the slash-menu is closed, and never reaches the
    // server as a command about a conversation the user is leaving.
    if (!stagedLocation && attachments.length === 0 && text.toLowerCase() === '/new') {
      onNewThread();
      discardComposer();
      return;
    }
    if (attachments.length > 0) {
      if (!deviceInfo) {
        setUploadError('device not initialized');
        return;
      }
      uploadingRef.current = true;
      setUploading(true);
      setUploadError(null);
      (async () => {
        try {
          const refs: OutgoingAttachment[] = [];
          for (const attachment of attachments) {
            // The bytes are usually already there: staged uploads start at pick. Awaiting the one
            // in flight is what keeps a send from pushing a second copy of the same file.
            const staged =
              attachment.mediaId ?? (await uploadsRef.current.get(attachment.id)?.catch(() => undefined));
            const id =
              staged ??
              (
                await uploadMedia(mediaBase, deviceInfo, threadId, attachment, (bytes, total) => {
                  setUploadProgress(current => ({
                    ...current,
                    [attachment.id]: Math.round((bytes / total) * 100),
                  }));
                })
              ).id;
            refs.push({
              id,
              type: attachment.type,
              uri: attachment.uri,
              filename: attachment.filename,
              ...(attachment.audioAsVoice ? { audioAsVoice: true } : {}),
              ...(attachment.durationMs === undefined ? {} : { durationMs: attachment.durationMs }),
            });
          }
          if (mediaBaseRef.current !== mediaBase) return;
          setAttachments([]);
          setUploadProgress({});
          setUploadFailed({});
          uploadsRef.current.clear();
          setLocation(undefined);
          setAddressOverride(null);
          onSend(text, refs, locationToSend);
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : 'upload failed');
          // The field is cleared the moment the send is fired, and the upload runs after it: a
          // failed one took the typed words with it and left the file staged, so the message was
          // gone with nothing to send again. Given back, unless something was typed since.
          if (text) setDraft(current => (current.trim() ? current : text));
        } finally {
          uploadingRef.current = false;
          setUploading(false);
        }
      })();
    } else {
      setLocation(undefined);
      setAddressOverride(null);
      onSend(text, undefined, locationToSend);
    }
    if (Platform.OS !== 'web' && prefs.get().dismissKeyboardOnSend) Keyboard.dismiss();
    consumeDraft();
  }, [attachments, consumeDraft, deviceInfo, discardComposer, draft, location, addressOverride, mediaBase, onNewThread, onSend, threadId, onTagCommand]);

  /**
   * The sent history, walked by the arrows the way a terminal walks its own: Up goes back one
   * message at a time, Down returns, and past the newest the field empties again.
   *
   * `recalled` is the line last put in the field. It is only trusting while the field still holds
   * it unchanged; the moment the owner types, the arrows belong to the caret again.
   */
  const recallLinesOfThread = useMemo(() => recallLines(items), [items]);
  const [recalled, setRecalled] = useState<string | null>(null);
  const recallLast = useCallback(() => {
    const older = olderLine(recallLinesOfThread, draftRef.current);
    if (older === null) return;
    setRecalled(older);
    changeDraft(older);
  }, [changeDraft, recallLinesOfThread]);
  const recallNewer = useCallback(() => {
    const next = newerLine(recallLinesOfThread, draftRef.current);
    // `undefined` is a draft the owner wrote: Down is the caret's, not the history's.
    if (next === undefined) return;
    setRecalled(next);
    changeDraft(next ?? '');
  }, [changeDraft, recallLinesOfThread]);
  const recallArmed = recallsDraft(recalled, draft);

  const empty = items.length === 0;

  // Continue is offered under the thread's last run, while nothing runs. One press, then nothing
  // until the run it starts comes back through `streaming` or the thread moves on.
  const continueRun = useMemo(() => continueTarget(items), [items]);
  const [continuePressed, setContinuePressed] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (streaming) setContinuePressed(undefined);
  }, [streaming]);
  const continueOffered = quotaWait === undefined && onContinue !== undefined && continueRun !== undefined && !streaming && continuePressed !== continueRun.id;
  const pressContinue = useCallback(() => {
    if (!continueRun || !onContinue) return;
    setContinuePressed(continueRun.id);
    onContinue();
  }, [continueRun, onContinue]);

  // `grouped[i]` says row i continues the previous author's block. Computed once per items change
  // rather than twice per row on every render: the whole list re-renders on each streaming delta,
  // and this used to be O(rows) comparisons per frame for an answer that changed by one letter.
  const grouped = useMemo(() => items.map((_, index) => isGrouped(items, index)), [items]);

  // Stable identities, or the memo on Bubble/ToolCard never holds. onBubbleMenu and the four
  // viewer setters come from AppShell as state setters, so this closure only changes when the
  // screen genuinely changes.
  const openAttachment = useCallback(
    (kind: ViewerKind, target: { url: string; filename: string; sizeBytes?: number; kind?: FileKind }) => {
      // One picture is a gallery of one: the same viewer, so nothing has two behaviours.
      if (kind === 'image') return onOpenImage([{ ...target }], 0);
      // Prose and code are the same reader, which picks its rendering from the file's kind.
      if (kind === 'text' || kind === 'code') return onOpenText(target);
      if (kind === 'video') return onOpenVideo(target);
      if (kind === 'svg') return onOpenSvg(target);
      if (kind === 'pdf') return onOpenPdf(target);
      if (kind === 'html') return onOpenHtml(target);
      if (kind === 'office') return onOpenOffice(target);
      if (kind === 'archive') return onOpenArchive(target);
      return onOpenFile(target);
    },
    [onOpenImage, onOpenText, onOpenVideo, onOpenSvg, onOpenPdf, onOpenHtml, onOpenOffice, onOpenArchive, onOpenFile],
  );

  /**
   * A run of captures opens as one visit.
   *
   * The gallery holds pictures, and a carousel may carry a video among them: that slide opens the
   * player instead, and the pictures around it stay a gallery of their own. Landing on the tapped
   * one matters -- a gallery that opens on the first picture makes the tap look broken.
   */
  const openMedia = useCallback(
    (media: MediaItem[], index: number): void => {
      const item = media[index];
      if (!item) return;
      if (item.video) return onOpenVideo({ url: item.url, filename: item.filename });
      const images = media.filter(entry => !entry.video);
      const at = images.findIndex(entry => entry.url === item.url && entry.filename === item.filename);
      return onOpenImage(images, at < 0 ? 0 : at);
    },
    [onOpenImage, onOpenVideo],
  );

  /**
   * The chip goes, and the file follows it: a staged file that is thrown away is not kept on the
   * server (owner decision, 2026-09-15). An upload still in flight is awaited first -- deleting
   * before it lands would leave the file there with nothing pointing at it.
   */
  const removeAttachment = useCallback(
    (id: string): void => {
      const staged = attachmentsRef.current.find(item => item.id === id);
      if (Platform.OS === 'ios' && staged) deviceBridge.acknowledgeVoiceDraft(staged.uri, mediaBaseRef.current).catch(() => {});
      const inFlight = uploadsRef.current.get(id);
      uploadsRef.current.delete(id);
      setAttachments(current => current.filter(item => item.id !== id));
      setUploadProgress(current => without(current, id));
      setUploadFailed(current => without(current, id));
      if (!threadId) return;
      const drop = (mediaId: string): void => {
        if (mediaBaseRef.current !== mediaBase) return;
        // Two separate facts: the composer no longer holds it, and the bytes are thrown away.
        forgetDraftFile(threadId, mediaId);
        connection.send(encodeFileDelete(threadId, mediaId)).catch(() => {});
      };
      if (staged?.mediaId) drop(staged.mediaId);
      else if (inFlight) inFlight.then(drop).catch(() => {});
    },
    [threadId, mediaBase],
  );

  /**
   * A failed upload is retried here, on the chip that failed: the bytes were local, the take is
   * still local, and re-recording a voice note because one request failed is the wrong price.
   * The chip stays either way -- a retry that fails again only says so again.
   */
  const retryAttachment = useCallback((attachment: PendingAttachment): void => {
    if (uploadsRef.current.has(attachment.id)) return;
    setUploadError(null);
    setUploadFailed(current => without(current, attachment.id));
    setUploadProgress(current => ({ ...current, [attachment.id]: 0 }));
    startUpload(attachment);
  }, [startUpload]);

  /**
   * A staged chip opens what the conversation's files page would open: same viewers, same url.
   *
   * The server's copy once there is one, the file this device picked before that. A tap that lands
   * during the upload has to open something: the picked file is right here, and refusing read as
   * a dead chip.
   */
  const openStaged = useCallback(
    (attachment: PendingAttachment): void => {
      const remote =
        deviceInfo && attachment.mediaId ? mediaUrl(mediaBase, deviceInfo, attachment.mediaId) : undefined;
      const url = remote ?? attachment.uri;
      if (!url) return;
      openAttachment(viewerFor(attachment.type, attachment.filename) ?? 'file', {
        url,
        filename: attachment.filename,
        sizeBytes: attachment.sizeBytes,
      });
    },
    [deviceInfo, mediaBase, openAttachment],
  );

  /** The square the chip draws: the local file where there is one, the server's thumb otherwise. */
  const attachmentThumb = useCallback(
    (attachment: PendingAttachment): string | undefined => {
      if (attachment.type !== 'image' && attachment.type !== 'video') return undefined;
      if (attachment.uri) return attachment.uri;
      if (!deviceInfo || !attachment.mediaId) return undefined;
      return mediaUrl(mediaBase, deviceInfo, attachment.mediaId, { thumb: '1' });
    },
    [deviceInfo, mediaBase],
  );

  // Newest first, because the list is inverted. Reversing the data rather than the reading of it
  // keeps every index the list hands back pointing at the right bubble.
  // Item index by id, so a free row knows where it sits in the chronological list for grouping.
  const itemIndexById = useMemo(() => new Map(items.map((item, index) => [item.id, index])), [items]);

  // A finished run's work folds under one row (its header), which is why the list is built from
  // rows and not from raw items: a collapsed group is one row, an open one renders its children
  // inside it -- docs/run-grouping.md.
  const ruleBefore = useMemo(
    () => (compacting === undefined ? undefined : compactionRuleBefore(items)),
    [compacting, items],
  );
  // A finished run's work folds under one row (its header), which is why the list is built from
  // rows and not from raw items: a collapsed group is one row, an open one renders its children
  // inside it -- docs/run-grouping.md. The live compaction rule is a row too, and a boundary the
  // fold is cut at rather than a decoration between rows: `buildRows` takes it.
  // And a send the server never got is pinned under all of it: it waits for a connection, not for a
  // turn, so a bubble left in its reading order scrolls away from the only place the owner looks
  // while the run keeps writing -- `pinnedSends`.
  // The day dividers come last, on the order the reader actually gets: a pinned send moved to the
  // bottom must take its day with it.
  const rows = useMemo(
    () => withDaySeparators(pinnedSends(buildRows(items, ruleBefore))),
    [items, ruleBefore],
  );
  // Oldest first on the web, newest first on a phone: see `inverted`. Reversing the data rather
  // than the reading of it keeps every index the list hands back pointing at the right bubble.
  const listRows = useMemo(() => (inverted ? [...rows].reverse() : rows), [inverted, rows]);

  // Nothing here moves the list when a row folds. It used to, to put the opened row at the top of
  // the reading area, and it fought `maintainVisibleContentPosition` for the same offset: the two
  // writers disagreed and the thread jumped away from the row that was tapped. The prop alone
  // already holds the reading position while a row changes height, and it is the only writer left.
  // docs/thread-scroll.md

  /**
   * Which folds the reader has opened, by fold key.
   *
   * Per fold, not per run: a run has one header per burst now, and tapping the one between two
   * messages opens exactly what its count promised (owner's rule, 2026-09-17). Here rather than
   * inside `RunGroup` because the row is remounted under their fingers: a folded group whose work
   * arrives becomes a group of real items, with a different list key, and state held in the
   * component meant the group they just opened snapped shut the moment it filled. `foldKeyOf` is
   * the identity that survives that swap -- the server keys a summary on the first entry it
   * stands for, and the items it hands back carry the same string.
   */
  const [expandedFolds, setExpandedFolds] = useState<ReadonlySet<string>>(() => new Set());
  // This screen is not remounted when the reader changes thread, so the set has to be emptied by
  // hand: a group is folded again every time a thread is opened, and holding fold keys of threads
  // nobody is reading is a leak. It is no longer what keeps an empty group from being drawn --
  // being open is what fetches now (`FoldedRunGroup`), so a group reopened by a redraw fills
  // itself instead of sitting on a skeleton.
  useEffect(() => setExpandedFolds(new Set()), [threadId]);
  // Stable per thread: the group asks for its work from an effect keyed on this, and a fresh
  // closure every render would re-run it on every store change for nothing.
  const openRun = useCallback((summaries: RunSummaryItem[]) => requestRunItems(threadId, summaries), [threadId]);
  const toggleFold = useCallback((key: string) => {
    setExpandedFolds(current => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  /**
   * The field of a question card that holds focus, and whether its reveal has been measured yet.
   *
   * Here rather than in the card: a card is a row of the thread, so it unmounts when it scrolls
   * out of the window, while the keyboard's own announcement arrives later still.
   */
  const focusedFieldRef = useRef<TextInput | null>(null);
  const probedRef = useRef(false);

  /**
   * Space given to the content when a scroll could not lift the field out from under the keyboard.
   *
   * The last resort, and the one that works where the rest cannot: the field of a question sits at
   * the newest content, offset 0, where `liftFor` can only step back towards an offset it is
   * already at. Measured on the phone (2026-09-14, 16:20Z): `field=565..605 keyboardTop=426
   * offset=0->0` -- the viewport had not shrunk, so nothing about the offset could have helped.
   * Living in the screen rather than in the card, because the card unmounts with the window while
   * the keyboard's report lands after that.
   */
  const [keyboardPad, setKeyboardPad] = useState(0);
  /**
   * The same value, readable from an event handler without re-subscribing it.
   *
   * A pad is applied from a promise (`revealFieldAboveKeyboard`), so the state alone cannot be
   * read at the moment the app comes back -- and reading it inside a state updater to decide
   * whether to write a diagnostic would be a side effect in a place React is allowed to call twice.
   */
  const padRef = useRef(0);
  const applyPad = useCallback((pad: number) => {
    padRef.current = pad;
    setKeyboardPad(pad);
  }, []);

  /**
   * Bring the bottom of the thread back under the keyboard when a free-text answer opens.
   *
   * The pending question is at the bottom -- the pill that jumps to it scrolls to the same
   * offset, and an inverted list pins offset 0 to the bottom edge whatever the keyboard leaves
   * of the viewport. This is the half of the reveal that can run at focus. The other half waits
   * for the keyboard: on Android its geometry does not exist yet here, and this scroll is a
   * request against a viewport that is about to shrink.
   */
  const revealQuestionField = useCallback((field: TextInput | null) => {
    focusedFieldRef.current = field;
    if (field === null) {
      // Blur, an answer sent, the card gone: the space exists for a field that is on screen, and
      // a pad left behind would push the end of the thread up with nothing to read there.
      applyPad(0);
      return;
    }
    probedRef.current = false;
    setAtBottom(true);
    followNewest(true);
    scrollToNewest(true);
  }, [applyPad, followNewest, scrollToNewest]);

  useEffect(() => {
    // The measurement half. Android announces the keyboard once it is up, and only then is there
    // a geometry to reveal against; iOS announces it before it moves, which is close enough for a
    // measurement taken after the layout has been given the shrunk frame. Either way the field is
    // measured rather than assumed, and the numbers go to the device diagnostics once per focus:
    // a report of "still behind the keyboard" then arrives with the geometry attached instead of
    // being reasoned about from a screenshot.
    const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const subscription = Keyboard.addListener(event, () => {
      const field = focusedFieldRef.current;
      if (field === null) return;
      // Reported once per focus; a re-announcement (the IME changing height) still re-runs the lift.
      const probing = !probedRef.current;
      probedRef.current = true;
      revealFieldAboveKeyboard({
        field,
        metrics: Keyboard.metrics(),
        offset: offsetRef.current,
        scrollTo: offset => listRef.current?.scrollToOffset({ offset, animated: true }),
        // What the scroll cannot deliver, the content gives: see `padFor`. Applied here rather
        // than in the card so that it survives the row unmounting.
        setPad: applyPad,
      })
        .then(probe => {
          if (probing) recordDiag({ kind: 'js', at: Date.now(), message: probeText(probe) });
        })
        .catch(() => {});
    });
    // The keyboard is the pad's whole reason: it goes down, the space goes with it.
    const hidden = Keyboard.addListener('keyboardDidHide', () => applyPad(0));
    /**
     * A pad is a memory of a keyboard, and the trip to the background erases the keyboard without
     * erasing the memory: Android hides the IME as part of the window losing focus, and
     * `keyboardDidHide` is not guaranteed for it (see `keyboardNow`). Coming back to a thread still
     * padded by a keyboard that is gone is the owner's report, so the return asks the platform and
     * the answer overrides the pad -- and RN's own memory of it.
     */
    let firstUp = false;
    const unsubscribe = onKeyboardResume((now, attempt) => {
      const believed = Keyboard.isVisible();
      if (attempt === 0) {
        firstUp = now.visible;
        if (keyboardResumeMismatch(padRef.current, believed, now.visible)) {
          recordDiag({
            kind: 'js',
            at: Date.now(),
            message:
              `keyboard resume: ime=${now.visible ? 'up' : 'down'} height=${Math.round(now.height)}` +
              ` jsVisible=${believed} pad=${Math.round(padRef.current)}`,
          });
        }
      } else if (firstUp && !now.visible) {
        // The case a single answer missed: a keyboard on the way back in that was gone once the
        // window settled. Named once per resume, with when it was seen gone.
        firstUp = false;
        recordDiag({
          kind: 'js',
          at: Date.now(),
          message: `keyboard resume settled: ime=up then down after ${RESUME_CHECKS_MS[attempt]}ms jsVisible=${believed} pad=${Math.round(padRef.current)}`,
        });
      }
      if (now.visible) return;
      applyPad(0);
      probedRef.current = false;
    });
    return () => {
      subscription.remove();
      hidden.remove();
      unsubscribe();
    };
  }, [applyPad]);

  /**
   * Draws one bubble or card. `groupedFlag`/`showTimeFlag` are passed in rather than read from
   * the global index so the same code serves free rows and the children of a run group.
   */
  const renderItemContent = useCallback(
    (item: ChatItem, groupedFlag: boolean, showTimeFlag: boolean, foot?: RunInfo, dense = false) => {
      if (item.kind === 'text' && item.summaryOf) return <CompactionBoundary item={item} />;
      // A `question` card with an ask still pending is the form itself. Once answered or
      // canceled the ask leaves the store and the card falls back to its settled rendering,
      // which is the record of what was asked -- no second card, no state to reconcile.
      if (item.kind === 'tool' && item.name === 'question') {
        const ask = questionByCard.get(item.id);
        if (ask) {
          return (
            <View style={toolColumn}>
              <QuestionCard request={ask} onReply={onQuestionReply} onRevealField={revealQuestionField} />
            </View>
          );
        }
      }
      if (item.kind === 'tool' && isSubAgentTool(item.name, item.args)) {
        return (
          <View style={toolColumn}>
          <SubAgentCard
            item={item}
            threadId={threadId}
            subagent={subagentDoors.get(item.id)}
            spawn={spawnLive?.get(item.id)}
            onOpen={onOpenSubAgent}
          />
          </View>
        );
      }
      // A sub-agent's report is a row of the thread, not a bubble: `role: 'user'` on the wire is a
      // fact about the prompt, and drawing it as a message made the owner read his own voice onto
      // words an agent wrote (owner, 2026-11-13).
      // A provider's note is context about the run, never a bubble: same shape as the reason a
      // run died, and never the raw payload it came with (`components/ProviderNotice.tsx`).
      if (item.kind === 'text' && item.notice) {
        return (
          <View style={toolColumn}>
            <ProviderNotice item={item} />
          </View>
        );
      }
      if (item.kind === 'text' && isSubAgentReturn(item)) {
        // The child this report came from, when the roster still reaches it: it decides both the
        // door and the mark, and it is one lookup so the two can never disagree.
        const child = item.from?.agentId ? subagentsById?.get(item.from.agentId) : undefined;
        return (
          <View style={toolColumn}>
            <SubAgentReturn
              item={item}
              mediaBase={mediaBase}
              deviceInfo={deviceInfo}
              {...(child && onOpenSubAgentById ? { onOpenAgent: () => onOpenSubAgentById(child.id) } : {})}
              {...(child?.type === 'browser' ? { mark: 'browser' as const } : {})}
              onOpenAttachment={openAttachment}
              onOpenMedia={openMedia}
            />
          </View>
        );
      }
      if (item.kind === 'text' && isCronDelivery(item)) {
        return (
          <View style={toolColumn}>
            <CronDelivery
              item={item}
              mediaBase={mediaBase}
              deviceInfo={deviceInfo}
              onOpenAttachment={openAttachment}
              onOpenMedia={openMedia}
              {...(onOpenCronRun
                ? {
                    onOpenRun: (runThreadId: string) =>
                      onOpenCronRun(runThreadId, `${item.from?.label ?? 'scheduled job'} · ${dayAndTime(item.ts)}`),
                  }
                : {})}
            />
          </View>
        );
      }
      if (item.kind === 'tool') {
        const card = (
          <ToolCard
            item={item}
            threadId={threadId}
            expandTools={uiPrefs?.expandTools ?? false}
            dense={dense}
          />
        );
        // A row of the spine is not centred in the tool column: that wrapper narrows and centres a
        // card on a wide screen, and a centred row would sit a few points right of its siblings.
        return dense ? card : <View style={toolColumn}>{card}</View>;
      }
      // A folded row is drawn by the list, not here: it is a row of its own, never a child.
      if (item.kind === 'run') return null;
      return (
        <View style={toolColumn}>
        <Bubble
          item={item}
          dense={dense}
          mediaBase={mediaBase}
          deviceInfo={deviceInfo}
          grouped={groupedFlag}
          showTime={showTimeFlag}
          foot={foot}
          onMenu={onBubbleMenu}
          onCopy={onBubbleCopy}
          menuHasExtras={subagent !== undefined && item.role === 'agent'}
          onResend={onResend}
          onOpenAttachment={openAttachment}
          onOpenMedia={openMedia}
          expandReasoning={uiPrefs?.expandReasoning ?? false}
          threadId={threadId}
        />
        </View>
      );
    },
    [toolColumn, deviceInfo, mediaBase, onBubbleMenu, onBubbleCopy, subagent, onResend, onOpenSubAgent, onOpenCronRun, openAttachment, openMedia, questionByCard, onQuestionReply, revealQuestionField, subagentDoors, subagentsById, onOpenSubAgentById, spawnLive, threadId, uiPrefs],
  );

  const renderRowContent = useCallback(
    (row: ChatRow) => {
      // The live compaction rule, a row of its own: drawing it inside a cell put it on the wrong
      // side of the bubble it belongs to, because an inverted cell lays its children out in
      // `column-reverse` under a scaleY flip (docs/compaction-indicator.md).
      if (row.kind === 'rule') {
        return compacting === undefined ? null : <CompactionRunning since={compacting.since} text={compacting.text} reasoning={compacting.reasoning} stopping={stopping} />;
      }
      // The day a run of rows belongs to. A row of the list, never a decoration on a cell: the
      // inverted list lays a cell's children out the other way round.
      if (row.kind === 'day') {
        return <DaySeparator day={row.day} />;
      }
      // The empreinte alone: a run whose tail is not a message and not a fold still signs its
      // work -- it is the run's only trace (docs/run-grouping.md).
      if (row.kind === 'foot') {
        return <RunFoot run={row.run} />;
      }
      if (row.kind === 'item') {
        // Grouping is a property of reading order, so it is still computed oldest-first and the
        // item index is looked up rather than derived from the row position.
        const chronological = itemIndexById.get(row.item.id) ?? 0;
        return renderItemContent(row.item, grouped[chronological] ?? false, !(grouped[chronological + 1] ?? false), row.foot);
      }
      // The work never travelled: the header draws from counts, and opening it fetches the items
      // that take its place -- docs/run-hydration.md.
      if (row.kind === 'folded') {
        return (
          <FoldedRunGroup
            run={row.run}
            summaries={row.summaries}
            open={expandedFolds.has(foldKeyOf(row))}
            foot={row.foot}
            onToggle={() => toggleFold(foldKeyOf(row))}
            onOpen={openRun}
          />
        );
      }
      // The children group among themselves: the first of a block is not grouped against the row
      // before it, and the time shows on the last one, exactly like free bubbles do.
      return (
        <RunGroup
          items={row.items}
          // One segment is live -- the one being written -- and it spins only while the store
          // agrees a run is actually in flight: an item whose status lags a closed cycle must not
          // leave a spinner running for good.
          live={row.live === true && activeRun}
          open={expandedFolds.has(foldKeyOf(row))}
          foot={row.foot}
          onToggle={() => toggleFold(foldKeyOf(row))}
          renderItem={(item, index, children, dense) => {
            const childGrouped = isGrouped(children, index);
            return renderItemContent(item, childGrouped, !isGrouped(children, index + 1), undefined, dense);
          }}
        />
      );
    },
    [grouped, itemIndexById, renderItemContent, expandedFolds, toggleFold, openRun, compacting, stopping, activeRun],
  );

  /**
   * Every row is drawn inside its own boundary. The screen has one too, and it is the wrong
   * granularity: a single bubble that throws took the whole conversation down with it, and since
   * the item is in the store, reopening the thread hit the same one again.
   */
  const renderRow = useCallback(
    (row: ChatRow) => {
      const key = keyOfRow(row);
      return (
        <RowBoundary itemId={key}>
          {renderRowContent(row)}
        </RowBoundary>
      );
    },
    [renderRowContent],
  );

  /**
   * The three props a FlatList compares by identity.
   *
   * `VirtualizedList` is a `PureComponent`: identical props and it does not re-render at all. An
   * inline arrow and two inline elements meant those props were fresh on every render of this
   * screen, so every keystroke in the composer re-rendered every visible bubble of the
   * conversation. Nothing here reads the draft, and now nothing here changes when it does.
   *
   * The footer is not only about cost. Handed a fresh element while a page is loading, the list
   * re-renders, which schedules the state that renders this screen again, which builds another
   * fresh element: the test that covers this runs the renderer out of memory when the `useMemo`
   * is removed.
   */
  const renderListItem = useCallback(({ item }: { item: ChatRow }) => renderRow(item), [renderRow]);

  /**
   * The content's padding and its column, plus the space a covered field needed.
   *
   * The cap lives here rather than on the wrapper: the scroll surface now spans the whole pane, so
   * that the scrollbar sits at the pane's right edge instead of being glued to a centred column,
   * and the reading column rides inside it (`layout.toolWidth`, centred). An inverted content
   * container pads at the *top* for the bottom edge, because the container is not flipped, the
   * scroll view is -- the same reason the list header is the bottom of the thread. On the web the
   * pad goes where the field is instead, at the bottom. Memoised for the reason below: the list
   * compares its props by identity, and a fresh array on every keystroke is a re-render of every
   * visible row.
   */
  const contentStyle = useMemo(
    () =>
      inverted
        ? [styles.listContent, toolColumn, keyboardPad > 0 && { paddingTop: styles.listContent.paddingTop + keyboardPad }]
        : [styles.listContent, toolColumn, keyboardPad > 0 && { paddingBottom: styles.listContent.paddingBottom + keyboardPad }],
    [inverted, keyboardPad, styles.listContent, toolColumn],
  );

  // Which end of the list carries what, in the order the reader gets. The loose questions sit
  // under the newest message, where the thread actually stops, and so does the compaction rule as
  // long as no send is parked behind it (a parked one takes the rule above itself, `renderRow`).
  // On a phone the newest message is the list header, because the list is inverted; on the web it
  // is the footer, and the older-page spinner takes the header.
  const newestEnd = useMemo(
    () =>
      (compacting !== undefined && ruleBefore === undefined) || questionsLoose.length > 0 || continueOffered || quotaWait !== undefined ? (
        <View style={styles.looseQuestions}>
          {quotaWait !== undefined ? (
            <QuotaWaitBar
              waiting={quotaWait}
              onCancel={() => onQuotaCancel?.()}
              onRetryNow={() => onQuotaRetryNow?.()}
            />
          ) : null}
          {continueOffered ? <ContinueButton onPress={pressContinue} /> : null}
          {compacting !== undefined && ruleBefore === undefined ? (
            <CompactionRunning since={compacting.since} text={compacting.text} reasoning={compacting.reasoning} stopping={stopping} />
          ) : null}
          {questionsLoose.map(ask => (
            <QuestionCard
              key={ask.id}
              request={ask}
              onReply={onQuestionReply}
              onRevealField={revealQuestionField}
            />
          ))}
        </View>
      ) : null,
    [compacting, stopping, ruleBefore, questionsLoose, onQuestionReply, revealQuestionField, styles.looseQuestions, continueOffered, pressContinue, quotaWait, onQuotaCancel, onQuotaRetryNow],
  );

  /**
   * The older page's spinner, at the older end, and the space it needs is always taken.
   *
   * The row used to exist only while a page was in flight, so a page that arrived (or that never
   * arrived, or that failed) changed the content height above the reader by the spinner's own
   * height: on the web the thread shifted by ~40 pt the moment the page landed, which is what the
   * anchor work exists to prevent. A slot of the same size, filled or empty, cannot move anything.
   */
  const olderEnd = useMemo(
    () => (
      <View style={styles.olderSpinner}>
        {loadingOlder ? <ActivityIndicator size="small" color={palette.textFaint} /> : null}
      </View>
    ),
    [loadingOlder, palette.textFaint, styles.olderSpinner],
  );

  const locationLabel = location
    ? addressOverride !== null
      ? addressOverride.trim() || 'Coordinates only'
      : location.address?.formatted ?? 'Resolving address…'
    : undefined;

  /**
   * Where the reader is, and whether that counts as following the newest message.
   *
   * The predicate is `core/threadScroll.ts`'s, so the two geometries cannot drift apart: on a
   * phone the newest message is offset 0, on the web it is the end of the range. The one thing a
   * browser cannot report is the end of a gesture -- there is no touch responder, so a wheel notch
   * and a drag on the scrollbar look like any other scroll. What they do that a programmatic
   * scroll never does is move the offset *up* while the reader is away from the bottom, and that
   * is what unpins the list. Content arriving under a pinned reader changes the content height and
   * leaves the offset alone; it must not read as "a hand put me here".
   */
  const handleScroll = useCallback(
    (event: {
      nativeEvent: {
        contentOffset: { y: number };
        contentSize: { height: number };
        layoutMeasurement: { height: number };
      };
    }) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const offset = contentOffset.y;
      const movedUp = offset < offsetRef.current;
      offsetRef.current = offset;
      // One of our own scrolls answering with an upward offset is the list shrinking under us.
      // Only a move nobody asked for is a hand.
      const ours = ownScrolls.current > 0;
      if (ours) ownScrolls.current -= 1;
      const near = nearNewest(
        { offset, viewport: layoutMeasurement.height, content: contentSize.height },
        inverted,
      );
      if (!inverted) {
        const anchor = prependAnchor.current;
        if (movedUp && !ours) {
          // A hand on the wheel ends the compensation: the reader has taken the position over, and
          // what they are looking at now is where they want to be.
          prependAnchor.current = null;
          if (!near) followNewest(false);
        } else if (anchor !== null && !followingRef.current && offset < anchor.offset) {
          // A prepend is still being measured, and the rows it added above have pushed the text
          // being read off its line. Hold it, on every scroll event rather than on the content
          // size alone: the growth arrives in steps hundreds of milliseconds apart, and between two
          // of them the reader would be left looking at the older page they did not ask to read.
          scrollTo(anchor.offset, false);
        }
        if (near && !followingRef.current) followNewest(true);
      }
      // A pinned reader is at the newest message even in the frame where the content that arrived
      // below them has not been scrolled to yet, so the pill does not flash under a streaming run.
      const atEnd = near || (!inverted && followingRef.current);
      if (atEnd !== atBottom) setAtBottom(atEnd);
      // Only while the reader is on the newest message may the store drop its oldest items:
      // that is what keeps a long session light without ever taking a visible bubble away.
      chatStore.setTrimAllowed(threadId, atEnd);
    },
    [atBottom, followNewest, inverted, scrollTo, threadId],
  );
  /**
   * A hand left the screen, and that is the only thing that decides whether the reader follows.
   * Reading it from `handleScroll` instead would cut the follow on the first item the list drew:
   * the list corrects its own offset when content arrives, and a correction emits a scroll.
   */
  const endGesture = useCallback(
    (event: {
      nativeEvent: {
        contentOffset: { y: number };
        contentSize: { height: number };
        layoutMeasurement: { height: number };
      };
    }) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      followNewest(
        nearNewest(
          { offset: contentOffset.y, viewport: layoutMeasurement.height, content: contentSize.height },
          inverted,
        ),
      );
    },
    [followNewest, inverted],
  );
  /**
   * The content grew. A page of older rows landing above the reader moves everything on screen
   * down by its height, and the offset absorbs it -- what `maintainVisibleContentPosition` does
   * for the inverted list, and nothing does on the web. Any other growth belongs to a pinned
   * reader, who gets the newest message back under their eyes; while they read history, it is
   * left where it is.
   *
   * The anchor is kept across the whole settle, not spent on the first change: a virtualized list
   * grows in steps as the rows above get measured, and compensating only the first step is what
   * put the reader two pages away from the paragraph they were reading (the second page landing
   * on a fresh anchor, itself measured from a half-grown content). Each step absorbs its own
   * growth, and only a hand on the wheel, or a return to the newest message, ends it.
   */
  const onThreadContentSize = useCallback(
    (_width: number, content: number) => {
      contentRef.current = content;
      // The opening's mask: unmask once the height stops moving. A batch step lands within a frame
      // or two of the last one, and 120 ms is well under a beat the eye reads as a blank screen.
      if (!endSettled) {
        clearSettleTimer();
        settleTimer.current = setTimeout(() => setEndSettled(true), 120);
      }
      if (inverted) return;
      const anchor = prependAnchor.current;
      if (anchor !== null && !followingRef.current) {
        const shift = prependShift(anchor.content, content);
        if (shift > 0) {
          anchor.content = content;
          anchor.offset += shift;
          scrollTo(anchor.offset, false);
        }
        return;
      }
      prependAnchor.current = null;
      if (followingRef.current) scrollToNewest(false);
    },
    [clearSettleTimer, endSettled, inverted, scrollTo, scrollToNewest],
  );

  /**
   * A page of older rows, whichever end of the range holds them.
   *
   * On the web that page is inserted *above* the reader, so the anchor is taken before the request
   * and `onThreadContentSize` compensates once the height is known. The inverted list needs none of
   * it: `maintainVisibleContentPosition` keeps the reader where they are.
   *
   * `byList` is the guard only the list's own report needs: mounting in reading order, it starts at
   * the top of the document and reports the start of its range as reached before the pin has moved
   * it, which would page in history nobody asked for and fight the pin itself. A pinned reader is
   * not reading history. The screen's own ask -- a thread shorter than the viewport -- is not that
   * case, and a pinned reader there has no anchor to take: the pin re-applies instead.
   */
  const pageOlder = useCallback(
    (byList: boolean) => {
      if (!inverted) {
        // One page at a time: while a prepend is still settling, the rows above are being measured
        // and the start of the range reads as reached again. A second request there would take a
        // fresh anchor from a half-grown content and throw the reader two pages away.
        if (prependAnchor.current !== null) return;
        if (byList && followingRef.current) return;
        if (!followingRef.current) prependAnchor.current = { offset: offsetRef.current, content: contentRef.current };
      }
      onLoadOlder();
    },
    [inverted, onLoadOlder],
  );
  const pageOlderFromList = useCallback(() => pageOlder(true), [pageOlder]);
  const onListMeasure = useCallback(
    (measure: { viewport: number; content: number }) => {
      viewportRef.current = measure.viewport;
      setListMeasure({ viewport: measure.viewport, content: measure.content });
      setEndSettled(true);
    },
    [],
  );
  const { scrollProps, indicator } = useScrollIndicator({
    onScroll: handleScroll,
    onScrollEndDrag: endGesture,
    onMomentumScrollEnd: endGesture,
    onContentSizeChange: onThreadContentSize,
    onMeasure: onListMeasure,
    inverted,
    // The browser draws its own scrollbar, and it is the only one a mouse can drag, click or page
    // with. The system bar everywhere else is an overlay the platform paints over the rows, so
    // those hide it and get the themed one the hook returns.
    systemBar: !inverted,
  });

  /**
   * A thread shorter than the screen has no scroll range, so it has no end to reach: `onEndReached`
   * fires once at mount, the cursor that says there is older work usually arrives after that, and
   * no gesture is ever left to ask again. The reader sits on three turns with the beginning of
   * their conversation behind them and no way to reach it (owner, 2026-11-05).
   *
   * So the list asks by itself when the content it holds does not fill the viewport, keyed on the
   * cursor rather than on the height: the page that says `hasMore` lands after the first measure,
   * and a guard latched on the content height would call that a second ask and never make it. The
   * store is the only guard that matters -- a page in flight, or nothing older to ask for, and
   * this is a no-op. It is not a second pager, it is the one reach the list cannot make itself.
   */
  const historyPage = useHistoryPage(threadId);
  const askedToFill = useRef<number | null>(null);
  useEffect(() => {
    if (listMeasure === undefined || loadingOlder) return;
    if (!historyPage.hasMore) return;
    if (listMeasure.content > listMeasure.viewport + 1) return;
    if (askedToFill.current === historyPage.nextBefore) return;
    askedToFill.current = historyPage.nextBefore;
    pageOlder(false);
  }, [historyPage.hasMore, historyPage.nextBefore, listMeasure, loadingOlder, pageOlder]);

  return (
    <View style={styles.screen}>
      {subagent ? (
        <View style={column}>
          {/* One row, a bare chevron on the left, exactly like every other screen that stacks over
              another: the way out must be where the hand already looks for it. What this screen
              adds is the standing marker below, not a header shaped differently. */}
          <View style={styles.header}>
            <Pressable
              onPress={onBack}
              style={styles.headerAction}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Back to ${subagent.parentTitle}`}>
              <ChevronIcon direction="left" size={18} tone="text" />
            </Pressable>
            {/* The marker, in the accent and on its own: the title stays the identity and nothing
                else, which is what gets read, selected and copied. A drawn head, not a `◈`: the
                chrome carries no text glyph anywhere else either. */}
            <AgentIcon size={13} tone="accent" />
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={1}>
                {`${subagent.id.replace(/^subagent\//, '')} · ${subagent.type}`}
              </Text>
              {/* The parent is named rather than left to memory: the chevron says there is a way
                  out, this says where it lands. */}
              {/* The model first, like every other header: it is the reading, and the parent is
                  the one piece a chevron already leads to. The message count left this line -- a
                  size, not a state (owner, 2026-11-04, on the same count in the thread header). */}
              <Text style={styles.subtitle} numberOfLines={1}>
                {[subagent.model, subagent.status === 'running' ? 'running' : 'idle', `from ${subagent.parentTitle}`]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <Pressable
              onPress={onSubAgentMenu}
              hitSlop={6}
              style={styles.headerAction}
              accessibilityRole="button"
              accessibilityLabel="Sub-agent actions">
              <MoreIcon vertical size={16} tone="muted" />
            </Pressable>
          </View>
          {/* Standing marker: every chat screen here looks alike, and without it a message meant
              for the main agent lands in the sub-agent. */}
          <View style={styles.subRule} />
        </View>
      ) : (
      <View style={[styles.header, column]}>
        {/* The list is a column of its own on a desktop, so the hamburger goes with it. */}
        {layout.pinnedDrawer ? null : (
          <Pressable
            onPress={onOpenDrawer}
            style={styles.headerAction}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Open conversations">
            <MenuIcon size={16} tone="muted" />
          </Pressable>
        )}
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.subRow}>
            {/* The model name absorbs every point of pressure, and the share does not: it is the
                one figure that moves on its own and the one a narrow header must never lose. As a
                single string both were cut together, so a long provider id ate the percentage
                (owner, 2026-11-04: "des fois on voit pas le % de context sur mobile avec les noms
                de modèle ou provider long"). Two runs, one ellipsis, one integer. */}
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
            {share ? (
              <Text style={[styles.subtitle, styles.share]} numberOfLines={1}>
                {`${subtitle ? ' · ' : ''}${share}`}
              </Text>
            ) : null}
          </View>
        </View>
        {connectionState !== 'connected' ? (
          <Pressable
            onPress={onStatusPress}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Connection status: ${connectionState}`}>
            {/* Connected is the normal case and shows nothing; a degraded state gets the space it
                deserves instead of a 9px dot nobody reads. */}
            <Text
              style={[
                styles.connBadge,
                connectionState === 'connecting' ? styles.connWarn : styles.connBad,
              ]}>
              {connectionState === 'connecting' ? 'connecting' : 'offline'}
            </Text>
          </Pressable>
        ) : null}
        {/* The gauge carries the share, so the metadata line above drops it: one figure, one
            place. Below 560 pt there is no room for three numbers and the share stays in the
            line, which is the one thing a phone header can afford. */}
        {layout.width >= 560 ? meter : null}
        {/* The model picker, where the bar has room for a fourth control. It wears the same box as
            the two chips before it -- same height, same fill, same corner -- so the strip reads as
            one row of controls: a bare 28 pt glyph between a 28 pt gauge and a 24 pt counter was
            "des items qui n'ont pas la même hauteur" (owner, 2026-11-04). `showModelButton` is the
            same predicate the menu uses to drop its Model… entry, so the picker is never offered
            twice. */}
        {showModelButton && onOpenModel ? (
          <Pressable
            onPress={onOpenModel}
            style={styles.controlChip}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Change model">
            <SlidersIcon size={15} tone="muted" />
          </Pressable>
        ) : null}
        {/* The counter closes the group of controls, innermost to outermost: what the run costs
            (the gauge), what it runs on (the model), who it has working (the agents), then the
            menu. It sat before the model button, which put the widest badge in the middle of the
            strip and left the two one-glyph controls on either side of it; the owner reads the
            row left to right as a narrowing: window, model, workers (2026-11-05: "mettre les
            sous-agents tout à droite, puis à sa gauche l'icône des modèles, puis à sa gauche la
            barre de contexte"). */}
        {showAgentsButton && subagentCount && subagentCount.total > 0 && onAgentsPress ? (
          <Pressable
            onPress={onAgentsPress}
            hitSlop={10}
            style={styles.agentsButton}
            accessibilityRole="button"
            accessibilityLabel={`${subagentCount.total} sub-agent${subagentCount.total === 1 ? '' : 's'}${subagentCount.running > 0 ? `, ${subagentCount.running} running` : ''}`}>
            <AgentIcon size={13} tone="muted" />
            <Text style={styles.agentsCount}>{subagentCount.total}</Text>
            {subagentCount.running > 0 ? <View style={styles.agentsLive} /> : null}
          </Pressable>
        ) : null}
        <Pressable
          onPress={onOpenMenu}
          style={[styles.headerAction, styles.headerActionEnd]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Commands">
          <MoreIcon vertical size={16} tone="muted" />
        </Pressable>
      </View>
      )}

      {empty ? (
        // New conversation: the composer itself is the screen. Keyed by thread so switching
        // straight from one empty thread to another re-focuses the field.
        <View style={[styles.hero, column]}>
          <Composer
            key={threadId}
            hero
            autoFocus={autoFocusHero}
            value={draft}
            onChange={changeDraft}
            onFocusChange={focused => {
              focusedRef.current = focused;
              setComposerFocused(focused);
            }}
            onSend={submit}
            onRecorded={stageVoiceNote}
            onRecordingError={setUploadError}
            hint={hint}
            commands={commands}
            attachments={attachments}
            location={location}
            locationLabel={locationLabel}
            onPickAttachment={openAttach}
            onRemoveAttachment={removeAttachment}
          onOpenAttachment={openStaged}
          attachmentThumb={attachmentThumb}
          uploadFailed={uploadFailed}
          onRetryAttachment={retryAttachment}
            onRemoveLocation={removeLocation}
            onPressLocation={openLocationSheet}
            locationBusy={locationBusy}
            onCommandEntered={onCommandEntered}
            uploading={uploading}
            uploadError={uploadError}
            uploadProgress={uploadProgress}
            streaming={streaming}
            onStop={onStop}
            stopping={stopping}
            questionPending={questionPending}
            onRecallLast={recallLast}
            onRecallNewer={recallNewer}
            recallArmed={recallArmed}
          />
        </View>
      ) : (
        <>
          {/* The scroll surface is the pane, not the reading column: the platform scrollbar rides
              its right edge, where a mouse expects it, and the column is capped inside by
              `contentStyle`. A capped scroll surface put the bar against the column, a few hundred
              points short of the window on a wide screen (owner, 2026-11-14). */}
          <View style={styles.listWrap} {...selectableProps()} {...drawerSwipe.panHandlers}>
            {/* Which end is the newest message is a platform decision (`inverted`), and the two
                geometries only share the arithmetic in `core/threadScroll.ts`.

                On a phone the list is inverted: index 0 is the newest and sits at offset 0, so a
                conversation lands on it with no scrolling at all, `scrollToEnd` never has to
                estimate an unmeasurable content height, and the keyboard shrinking the viewport
                leaves the offset where it was. Paging back is `onEndReached`, and the arriving
                page is appended behind the reader with nothing to preserve.

                On the web it cannot be inverted: the DOM order would run backwards from what the
                reader sees, and a browser selects text in DOM order -- which is the owner's
                report of a drag that starts at the bottom of a frame and ends up selecting the
                whole thread. So the document runs oldest-first, the newest message is the end of
                the range, and the list is pinned there: `onThreadContentSize` follows it while
                the reader stays at the bottom, `onStartReached` pages back, and `prependAnchor`
                absorbs the height of a page landing above. */}
            {/* Keyed by thread, like the hero composer above and for a harder reason: a list kept
                across a swap keeps its scroll offset, and offset 3000 of the conversation just
                left is the middle of nowhere in the one arriving. It also fired onEndReached at
                once, paging in old entries nobody asked for, over recycled cells still holding
                the previous thread's rows. */}
            <FlatList
              key={threadId}
              ref={listRef}
              {...scrollProps}
              // The opening's one blind frame: the list is pinned to its last message, so the first
              // frame it can paint is the top of the conversation. Opacity, never a size or a
              // presence, so it lays out and measures exactly as it will once shown -- see
              // `endSettled`, which is true from the first frame everywhere but the web.
              style={endSettled ? undefined : styles.listUnsettled}
              inverted={inverted}
              // Android scrolls a scroll view to a child that takes focus on its own. That is fine
              // for a form, and wrong here: this list is inverted, and the native delta is computed
              // in layout coordinates, which the inversion mirrors. Two writers on one offset, one
              // of them blind to the flip, is how a field ends up under the keyboard after having
              // been put above it.
              scrollsChildToFocus={false}
              // The whole fix for "the page moves while I read": the list adjusts its own offset so
              // the first thing the reader can see keeps its place. The threshold is the other half,
              // and it means "the reader follows", not "how far": carried while a hand last left the
              // list at the bottom, taken away the moment a hand leaves it anywhere else. Native
              // only -- the web pins to the end and anchors its prepends instead.
              // docs/thread-scroll.md
              maintainVisibleContentPosition={
                inverted
                  ? {
                      minIndexForVisible: 0,
                      ...(following ? { autoscrollToTopThreshold: FOLLOW_THRESHOLD } : {}),
                    }
                  : undefined
              }
              data={listRows}
              keyExtractor={keyOfRow}
              contentContainerStyle={contentStyle}
              keyboardShouldPersistTaps="handled"
              renderItem={renderListItem}
              ListHeaderComponent={inverted ? newestEnd : olderEnd}
              ListFooterComponent={inverted ? olderEnd : newestEnd}
              // The end that holds the older messages is the end that pages, and it is the other
              // one once the list stops being inverted.
              onEndReached={inverted ? onLoadOlder : undefined}
              onEndReachedThreshold={0.4}
              onStartReached={inverted ? undefined : pageOlderFromList}
              onStartReachedThreshold={0.4}
              // Bubbles have no knowable height (markdown, images, tool output), so getItemLayout
              // is out and these numbers are the only handle on how much is mounted at once.
              //
              // On the web the first page is mounted whole, and that is not a performance choice:
              // the list is pinned to the end, and a virtualized list grows its content in batches
              // -- each one fires a content-size change, each change re-pins, and the reader watched
              // the thread fill upward in five jumps for a quarter of a second (owner, 2026-11-15).
              // One commit means one height, one pin, and a conversation that is simply already at
              // its last message. A phone has nothing to fix: it is inverted, offset 0 is the newest
              // message, and rows arriving above it move nothing.
              initialNumToRender={inverted ? 12 : Math.min(listRows.length, WEB_FIRST_BATCH)}
              maxToRenderPerBatch={inverted ? 8 : 16}
              updateCellsBatchingPeriod={inverted ? 50 : 16}
              windowSize={11}
              // removeClippedSubviews is deliberately off: the ⋯ menu sits absolutely positioned
              // outside its bubble, and Android clips exactly that away.
            />

        {indicator}

        {/* The floating controls ride the reading column, not the pane.

            They used to sit on the scroll surface's own edges: 6 pt from the window on one side,
            flush against the scrollbar on the other. On a phone that put the stepper a good 130 pt
            left of the bubbles it steps through, and on a desktop it drew the jump arrow in the
            gutter beside the column, past the bubble edge it belongs to (owner, 2026-11-15). One
            rail, the column's width and the thread's own inset, and both ends land where a row
            ends.

            `box-none`, because the rail spans the whole thread: a reader scrolling under it still
            hits the list, and only the two controls take the touch. */}
        <View pointerEvents="box-none" style={styles.floatRail}>
          <View pointerEvents="box-none" style={[styles.floatRow, toolColumn]}>
          {/* The keyboard's Up and Down, for a phone whose keyboard has neither (owner, 2026-11-07):
              the same shape as the jump arrow, stepped. It floats over the thread, so it goes the
              moment it has nothing to walk or nothing to type into -- including a keyboard that
              was dismissed while the caret stayed in the field. `historyPillVisible` is that list. */}
          {historyPillVisible({
            focused: composerFocused,
            keyboardUp,
            draft,
            recallArmed,
            hasHistory: recallLinesOfThread.length > 0,
            pointerFine,
          }) ? (
            <View style={styles.history}>
              <Pressable
                style={styles.historyStep}
                onPress={recallLast}
                accessibilityRole="button"
                accessibilityLabel="Previous message">
                <ArrowIcon direction="up" size={12} tone="text" />
              </Pressable>
              <View style={styles.historyRule} />
              <Pressable
                style={styles.historyStep}
                onPress={recallNewer}
                accessibilityRole="button"
                accessibilityLabel="Next message">
                <ArrowIcon direction="down" size={12} tone="text" />
              </Pressable>
            </View>
          ) : (
            // The rail keeps its two ends whatever is drawn on them, so the jump arrow does not
            // slide to the left edge the moment the stepper goes.
            <View />
          )}

          {!atBottom && items.length > 0 ? (
            <Pressable
              style={styles.jump}
              onPress={() => {
                setAtBottom(true);
                followNewest(true);
                scrollToNewest(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Jump to latest message">
              <ArrowIcon size={13} tone="text" />
            </Pressable>
          ) : null}
          </View>
        </View>
        </View>

        {/* Measured, because the list above it takes whatever this leaves: see `composerHeight`. */}
        <View
          style={column}
          onLayout={event => setComposerHeight(event.nativeEvent.layout.height)}>
        {questionPending ? (
          // A card can be far up a long thread, and the only hint otherwise is a placeholder in
          // the composer. The run is blocked on the answer, so the form is the last thing in the
          // thread: the bottom of the list is where it is.
          <Pressable
            style={styles.questionPill}
            onPress={() => {
              setAtBottom(true);
              followNewest(true);
              scrollToNewest(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Go to the pending question">
            <Text style={styles.questionPillText}>
              {questions.length > 1 ? `${questions.length} questions waiting` : 'A question is waiting'}
            </Text>
            <Text style={styles.questionPillGlyph}>↓</Text>
          </Pressable>
        ) : null}
        <Composer
          value={draft}
          onChange={changeDraft}
          onFocusChange={focused => {
            focusedRef.current = focused;
            setComposerFocused(focused);
          }}
          onSend={submit}
          onRecorded={stageVoiceNote}
          onRecordingError={setUploadError}
          hint={hint}
          commands={commands}
          attachments={attachments}
          location={location}
          locationLabel={locationLabel}
          onPickAttachment={openAttach}
          onRemoveAttachment={removeAttachment}
          onOpenAttachment={openStaged}
          attachmentThumb={attachmentThumb}
          uploadFailed={uploadFailed}
          onRetryAttachment={retryAttachment}
          onRemoveLocation={removeLocation}
          onPressLocation={openLocationSheet}
          locationBusy={locationBusy}
          onCommandEntered={onCommandEntered}
          uploading={uploading}
          uploadProgress={uploadProgress}
          uploadError={uploadError}
          streaming={streaming}
          onStop={onStop}
          stopping={stopping}
          questionPending={questionPending}
          onRecallLast={recallLast}
          onRecallNewer={recallNewer}
          recallArmed={recallArmed}
        />
        </View>
        </>
      )}

      {attachOpen ? (
        <ActionSheet
          preview="add to this message"
          options={[
            { label: 'Photo from gallery', icon: <ImageIcon size={15} tone="muted" />, onPress: pickPhotos },
            { label: 'Take a photo', icon: <CameraIcon size={15} tone="muted" />, onPress: takePhoto },
            { label: 'File', icon: <FolderIcon size={15} tone="muted" />, onPress: pickFiles },
            ...(clipboardImage
              ? [{ label: 'Paste image', icon: <PasteIcon size={15} tone="muted" />, hint: 'The image currently in the clipboard', onPress: pasteImage }]
              : []),
            ...(locationEnabled
              ? [{ label: 'Share current location', icon: <PinIcon size={15} tone="muted" />, hint: 'One-shot GPS position with approximate address', onPress: shareLocation }]
              : []),
          ]}
          onClose={() => setAttachOpen(false)}
        />
      ) : null}

      {locationSheet && location ? (
        <ActionSheet
          preview="Current location"
          onClose={closeLocationSheet}
          options={[
            { label: 'Open in OpenStreetMap', icon: <MapIcon size={15} tone="muted" />, onPress: () => Linking.openURL(locationMapUrl(location)).catch(() => {}) },
            { label: 'Remove location', icon: <MapIcon size={15} tone="danger" />, danger: true, onPress: removeLocation },
          ]}>
          <LocationEditor
            value={locationDraft}
            onChange={setLocationDraft}
            meta={`Approximate · GPS accuracy +/- ${Math.round(location.accuracyMeters)} m · captured ${new Date(location.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          />
        </ActionSheet>
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    // 44 min, the POC's own strip (48 on the web, 44 on a phone; `compact.css` is explicit that
    // the phone is the tighter one). A height set in pixels here would fight the phone's, so the
    // frame is a floor and the padding does the rest.
    //
    // Zero, and the box's own slack becomes the gutter: an action is a 28 pt box around a 16 pt
    // glyph, so 6 pt of padding sits inside each of its edges. This is the optical rule behind "it
    // still looks shifted" -- a strip padded like a text row started the icon's *ink* 14 pt in while
    // the prose under it started at 6, and the eye aligns ink to ink, not box to box. At 0 the glyph
    // lands on the thread's own inset and the strip finally reads as one column with it (owner,
    // 2026-11-04).
    minHeight: 44,
    paddingHorizontal: 0,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  // 26, not the menu glyph's 20: the same chevron at the same size as every other screen's back.
  subRule: {
    height: 1,
    backgroundColor: palette.accent,
    marginTop: space.sm,
  },
  agentsButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    // The context gauge's own box, so the two sit level in one strip. It was 24, and a 24 beside a
    // 28 read as two rows that had drifted into one (owner, 2026-11-04: "des items qui n'ont pas la
    // même hauteur").
    height: control.height,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  /**
   * An action that stands in the bar as a control of its own: the gauge, the counter, the model.
   *
   * Same box as the two chips beside it and the same fill, which is the whole point: `headerAction`
   * draws nothing behind its glyph, so a model button wearing it between two filled chips read as
   * a pair of floating dots rather than as the third control of the row.
   */
  controlChip: {
    width: control.height,
    height: control.height,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: palette.surfaceAlt,
  },
  agentsCount: {
    color: palette.text,
    fontSize: font.small,
    fontWeight: '600' as const,
    fontVariant: ['tabular-nums' as const],
  },
  // A dot of the live colour, drawn: a 5 pt square of accent is the one mark that says a run is
  // in flight, and a text bullet for it was a glyph in the chrome.
  agentsLive: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.accent,
  },
  /**
   * An action of the title bar: the icon and its 28 pt box, nothing behind it.
   *
   * These were 40 pt tiles filled with `surfaceAlt`, which is the shape a *button* takes on a
   * page of controls -- in a title bar the strip became a row of grey chips competing with the
   * context gauge for the same weight. The POC draws no background at all; the hit area is what
   * makes it a target.
   */
  headerAction: {
    width: control.height,
    height: control.height,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    // A control is never squeezed by the text beside it: the title and the facts line are the
    // two things that give way (the ⋮ staying put is what keeps the facts line out from under it).
    flexShrink: 0 as const,
  },
  /**
   * The optical correction of the last action, and the whole answer to "the header still looks
   * shifted".
   *
   * With the strip flush (padding 0) the hamburger's ink lands 8.7 pt from the left edge and the
   * overflow's 12.9 pt from the right: a vertical three-dot glyph fills only 3.2 of its 24 box wide,
   * so it carries 6.9 pt of empty viewport on each side where the three rules carry 2.7. Two edges
   * of one row, 4.3 pt apart, is what the eye catches -- not the offset of either one. Pulled out by
   * that difference, both inks sit at the same distance and the strip reads level.
   */
  headerActionEnd: { marginRight: -4 },
  /**
   * The facts line: the model takes the room, the share keeps its own.
   *
   * `flexShrink: 1` on the name and `flexShrink: 0` on the share is the whole fix. As one string
   * the two were cut together by `numberOfLines={1}`, so any long provider id took the percentage
   * with it -- the one number on this line that is a reading rather than a label.
   */
  subRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, minWidth: 0 },
  share: { flexShrink: 0 as const, fontVariant: ['tabular-nums' as const] },
  headerText: { flex: 1, minWidth: 0, overflow: 'hidden' as const },
  // 14 and 11, the POC's pair rounded to the app's own scale: the title is a line of the
  // conversation's type, not a screen heading, and at 15 it drew the eye before the answer under it.
  title: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  subtitle: { fontSize: font.small, color: palette.textMeta, flexShrink: 1 as const, minWidth: 0 },
  connBadge: {
    fontSize: font.meta,
    fontWeight: '600' as const,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    overflow: 'hidden' as const,
  },
  connWarn: { color: palette.warn, backgroundColor: palette.surfaceAlt },
  connBad: { color: palette.danger, backgroundColor: palette.surfaceAlt },
  listWrap: { flex: 1 },
  /**
   * A thread that has not found its end yet is laid out but not shown: it costs the layout either
   * way, and the reader sees the conversation arrive whole instead of sweeping past.
   */
  listUnsettled: { opacity: 0 },
  // The list is inverted, so its content box is upside down too: what is written as the top
  // padding is drawn under the newest message.
  // The horizontal padding used to come free with the reading column, which was narrower than
  // the pane; now that a tool card is allowed the full width it has to be asked for, or a card
  // is drawn hard against both edges of the window.
  listContent: { paddingTop: space.sm, paddingBottom: space.md, paddingHorizontal: space.sm },
  olderSpinner: { minHeight: 44, justifyContent: 'center' as const, alignItems: 'center' as const },
  hero: {
    flex: 1,
    justifyContent: 'center' as const,
    paddingHorizontal: space.md,
    paddingBottom: space.xl,
  },
  looseQuestions: { paddingTop: space.sm, gap: space.sm },
  questionPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
    marginHorizontal: space.sm,
    marginBottom: space.xs,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.accent,
    backgroundColor: palette.surface,
  },
  questionPillText: { fontSize: font.small, color: palette.accent },
  questionPillGlyph: { fontSize: font.small, color: palette.accent },
  // One geometry for both floating controls: a 34 pt rounded square on the surface, the same
  // border and the same radius the chrome's own boxes use. They are two ends of one rail, so they
  // cannot be a circle and a pill -- that read as two unrelated things that happened to land on
  // the same line.
  jump: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  /**
   * Where the floating controls sit: over the thread, at the bottom of the list's own surface.
   *
   * Two boxes because the outer one is absolute and an absolute child cannot be centred by
   * `alignSelf`: the rail spans the pane and centres the row, the row is the reading column with
   * the thread's own inset. Without that the controls landed on the pane's edges, which on a wide
   * window is a hundred points out from the bubbles they belong to (owner, 2026-11-15).
   */
  floatRail: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: space.md,
    alignItems: 'center' as const,
  },
  floatRow: {
    paddingHorizontal: space.sm,
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    justifyContent: 'space-between' as const,
  },
  // Two steps in one column, the older one on top. The divider is inset on both sides because a
  // hairline meeting the border reads as two boxes rather than one stepper (owner, 2026-11-08),
  // and the steps are a square each so the group is exactly as tall as the jump arrow beside it.
  history: {
    height: 36,
    justifyContent: 'space-between' as const,
    flexDirection: 'column' as const,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden' as const,
  },
  historyStep: {
    width: 36,
    height: 17,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  historyRule: { height: 1, marginHorizontal: 9, backgroundColor: palette.border },
});
