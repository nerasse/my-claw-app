import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, Text, View } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { Bubble } from '../components/Bubble';
import { CompactionBoundary, CompactionRunning } from '../components/CompactionBoundary';
import { FoldedRunGroup, RunGroup } from '../components/RunGroup';
import { ToolCard } from '../components/ToolCard';
import { SubAgentCard } from '../components/SubAgentCard';
import { QuestionCard } from '../components/QuestionCard';
import { Composer } from '../components/Composer';
import { ActionSheet } from '../components/ActionSheet';
import { chatStore, isSubAgentTool, useChatItems, useCompacting, type ChatItem, type RunInfo, type RunSummaryItem, type TextItem } from '../core/chat';
import { buildRows, compactionRuleBefore, withCompactionRule, type ChatRow } from '../core/runRows';
import { requestRunItems } from '../core/runItems';
import { useThreadQuestions } from '../core/questionStore';
import { isGrouped } from '../core/grouping';
import type { DeviceInfo } from '../core/device';
import { connection } from '../core/connection';
import { deviceBridge } from '../core/nativeBridge';
import { useCommands } from '../core/commands';
import { encodeCommandsList, type AttachmentMeta, type LocationData, type LocationInput } from '../core/protocol';
import { uploadMedia, type OutgoingAttachment, type PendingAttachment } from '../core/upload';
import { clearDraft, draftAttachmentsOf, draftTextOf, onRemoteDraft, queueDraftSync, saveDraft } from '../core/drafts';
import type { VoiceRecording } from '../core/nativeBridge';
import { voiceFilename } from '../core/voice';
import { uuid } from '../core/utils';
import { getCurrentLocation } from '../core/location';
import { locationPreview } from '../core/locationPreview';
import { LocationEditor } from '../components/LocationEditor';
import { locationMapUrl } from '../components/LocationView';
import type { WsState } from '../core/types';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { useLayout } from '../core/layout';
import { watchFileDrop } from '../core/fileDrop';
import { selectableProps } from '../core/webProps';
import { RowBoundary } from './RowBoundary';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';

function pickAssetToPending(asset: { uri?: string; fileName?: string | null; type?: string | null; fileSize?: number | null }): PendingAttachment | null {
  if (!asset.uri) return null;
  const filename = asset.fileName ?? `photo-${Date.now()}.jpg`;
  const mimeType = asset.type ?? 'application/octet-stream';
  const type: AttachmentMeta['type'] = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : 'file';
  return { id: uuid(), uri: asset.uri, filename, type, mimeType, sizeBytes: asset.fileSize ?? undefined };
}

const keyOfRow = (row: ChatRow): string => {
  if (row.kind === 'item') return row.item.id;
  // The rule has no id of its own: one compaction runs at a time on a thread, so one rule.
  if (row.kind === 'rule') return 'rule:compaction';
  // Not the run id alone: while one segment of a run is hydrated and the next is not, a group row
  // and a folded row of the same run sit side by side, and two rows sharing a key drop one.
  if (row.kind === 'folded') return `fold:${row.summaries[0]?.id ?? row.run.id}`;
  return `run:${row.run.id}:${row.items[0]?.id ?? ''}`;
};

export function ChatScreen({
  threadId,
  title,
  subtitle,
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
  onResend,
  onOpenImage,
  onOpenText,
  onOpenVideo,
  onOpenFile,
  onOpenMenu,
  onCommandEntered,
  onTagCommand,
  streaming,
  onStop,
  onQuestionReply,
  onNewThread,
  subagentCount,
  onAgentsPress,
  subagent,
  subagentDoors,
  spawnLive,
  onOpenSubAgent,
  onSubAgentMenu,
  onLoadOlder,
  loadingOlder,
  uiPrefs,
}: {
  threadId: string;
  title: string;
  subtitle: string;
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
  /** A message of the owner's that never got its receipt is sent again, same id. */
  onResend: (item: TextItem) => void;
  onOpenImage: (target: { url: string; filename: string; sizeBytes?: number }) => void;
  onOpenText: (target: { url: string; filename: string }) => void;
  onOpenVideo: (target: { url: string; filename: string }) => void;
  onOpenFile: (target: { url: string; filename: string; sizeBytes?: number }) => void;
  /** The command menu of the app (model, stop, clear, ...). */
  onOpenMenu: () => void;
  /** A slash command was chosen; true when the app handled it natively. */
  onCommandEntered: (command: string) => boolean;
  /** A submitted /tag text was handled natively; true keeps it out of the wire. */
  onTagCommand?: (text: string) => boolean;
  /** A run is answering on this thread (streaming or between tools): the composer offers Stop. */
  streaming: boolean;
  onStop: () => void;
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
  subagent?: { id: string; type: string; status: 'idle' | 'running'; messageCount: number; parentTitle: string };
  /**
   * Which `spawn` cards lead to a sub-agent that still exists, keyed by chat item id. Built from
   * the roster, so a killed sub-agent stops offering a door instead of opening a dead thread.
   */
  subagentDoors: Map<string, { label: string; status: 'idle' | 'running' }>;
  /** Live sub-agent lifecycle state per spawn card, pushed by `chat.spawn.start/end` frames. */
  spawnLive?: Map<string, { subagentId: string; displayName: string; status: 'running' | 'complete' | 'error' | 'aborted' }>;
  onOpenSubAgent?: (toolItemId: string) => void;
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
  // A conversation is prose: past ~90 characters a line stops being readable, however wide the
  // window is. The column is centred inside the pane rather than stretched across it.
  const column = useMemo(
    () => ({ maxWidth: layout.readingWidth, width: '100%' as const, alignSelf: 'center' as const }),
    [layout.readingWidth],
  );
  // Every row of the thread, bubble or card, sits in this one column. A tool card is not prose
  // and wants more than the reading width, but giving the two their own centred columns put their
  // left edges 60pt apart, and a thread whose rows do not share an edge reads as broken
  // alignment. So one column decides where a row starts and ends, and prose is capped inside its
  // own bubble (88% of it, which lands on the reading width by design).
  const toolColumn = useMemo(
    () => ({ maxWidth: layout.toolWidth, width: '100%' as const, alignSelf: 'center' as const }),
    [layout.toolWidth],
  );
  const listRef = useRef<FlatList<ChatRow>>(null);
  // Subscribed here rather than handed down: a growing bubble must not re-render the shell that
  // holds every page of the app, only the conversation showing it.
  const items = useChatItems(threadId);
  // A compaction running on this conversation: thread state, drawn as a rule at the bottom of the
  // list rather than as an item in it (CompactionRunning says why).
  const compactingSince = useCompacting(threadId);
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
    chatStore.setTrimAllowed(threadId, true);
  }, [threadId]);

  /**
   * A draft belongs to its conversation, not to this component. The cleanup runs both when the
   * screen is unmounted (a page covering the chat on a phone) and just before the swap to
   * another conversation, which is what stops a message written here from being sent there.
   */
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  useEffect(() => {
    setDraft(draftTextOf(threadId));
    setAttachments(draftAttachmentsOf(threadId));
    return () => saveDraft(threadId, draftRef.current, attachmentsRef.current);
  }, [threadId]);

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
   * A draft written on another device. Applied only into a composer that is empty, or that the
   * owner is not typing in: replacing live text loses characters and throws the caret to the end,
   * and the phone in a pocket is exactly the surface that should catch up.
   */
  const focusedRef = useRef(false);
  useEffect(
    () =>
      onRemoteDraft(changed => {
        if (changed !== threadId) return;
        if (draftRef.current.trim() && focusedRef.current) return;
        setDraft(draftTextOf(threadId));
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
    }
  }, []);

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
  const stageVoiceNote = useCallback((recording: VoiceRecording) => {
    const filename = voiceFilename();
    setUploadError(null);
    setAttachments(current => [
      ...current,
      {
        id: `voice-${recording.uri}`,
        uri: recording.uri,
        filename,
        type: 'audio',
        mimeType: 'audio/mp4',
        sizeBytes: recording.sizeBytes,
        audioAsVoice: true,
        durationMs: recording.durationMs,
      },
    ]);
  }, []);

  const submit = useCallback(() => {
    // The button is disabled while an upload runs, and this is what covers the keyboard: Enter
    // does not read the button's state.
    if (uploadingRef.current) return;
    const text = draft.trim();
    if (!text && attachments.length === 0 && !location) return;
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
      consumeDraft();
      return;
    }
    // /new is the wire form of the + button: a fresh conversation, not a reset of this one.
    // Intercepted here so it works even when the slash-menu is closed, and never reaches the
    // server as a command about a conversation the user is leaving.
    if (!stagedLocation && attachments.length === 0 && text.toLowerCase() === '/new') {
      onNewThread();
      consumeDraft();
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
            const uploaded = await uploadMedia(mediaBase, deviceInfo, threadId, attachment, (bytes, total) => {
              setUploadProgress(current => ({ ...current, [attachment.id]: Math.round((bytes / total) * 100) }));
            });
            refs.push({
              id: uploaded.id,
              type: uploaded.type,
              uri: attachment.uri,
              filename: attachment.filename,
              ...(attachment.audioAsVoice ? { audioAsVoice: true } : {}),
              ...(attachment.durationMs === undefined ? {} : { durationMs: attachment.durationMs }),
            });
          }
          setAttachments([]);
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
    consumeDraft();
  }, [attachments, consumeDraft, deviceInfo, draft, location, addressOverride, mediaBase, onNewThread, onSend, threadId, onTagCommand]);

  /** Up arrow on an empty composer: the last thing sent, back in the field. */
  const recallLast = useCallback(() => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item?.kind === 'text' && item.role === 'user' && item.text.trim()) {
        changeDraft(item.text);
        return;
      }
    }
  }, [changeDraft, items]);

  const empty = items.length === 0;

  // `grouped[i]` says row i continues the previous author's block. Computed once per items change
  // rather than twice per row on every render: the whole list re-renders on each streaming delta,
  // and this used to be O(rows) comparisons per frame for an answer that changed by one letter.
  const grouped = useMemo(() => items.map((_, index) => isGrouped(items, index)), [items]);

  // Stable identities, or the memo on Bubble/ToolCard never holds. onBubbleMenu and the four
  // viewer setters come from AppShell as state setters, so this closure only changes when the
  // screen genuinely changes.
  const openAttachment = useCallback(
    (kind: 'image' | 'text' | 'video' | 'file', target: { url: string; filename: string; sizeBytes?: number }) => {
      if (kind === 'image') return onOpenImage(target);
      if (kind === 'text') return onOpenText(target);
      if (kind === 'video') return onOpenVideo(target);
      return onOpenFile(target);
    },
    [onOpenImage, onOpenText, onOpenVideo, onOpenFile],
  );

  // Newest first, because the list is inverted. Reversing the data rather than the reading of it
  // keeps every index the list hands back pointing at the right bubble.
  // Item index by id, so a free row knows where it sits in the chronological list for grouping.
  const itemIndexById = useMemo(() => new Map(items.map((item, index) => [item.id, index])), [items]);

  // A finished run's work folds under one row (its header), which is why the list is built from
  // rows and not from raw items: a collapsed group is one row, an open one renders its children
  // inside it -- docs/run-grouping.md.
  const ruleBefore = useMemo(
    () => (compactingSince === undefined ? undefined : compactionRuleBefore(items)),
    [compactingSince, items],
  );
  // A finished run's work folds under one row (its header), which is why the list is built from
  // rows and not from raw items: a collapsed group is one row, an open one renders its children
  // inside it -- docs/run-grouping.md. The compaction rule is a row too, inserted above the send
  // it holds -- `withCompactionRule`.
  const rows = useMemo(() => withCompactionRule(buildRows(items), ruleBefore), [items, ruleBefore]);
  const reversedRows = useMemo(() => [...rows].reverse(), [rows]);

  /**
   * Which run groups the reader has opened, by run id.
   *
   * Here rather than inside `RunGroup` because the row is remounted under their fingers: a folded
   * group whose work arrives becomes a group of real items, with a different list key, and state
   * held in the component meant the group they just opened snapped shut the moment it filled. The
   * run id is the one identity that survives that -- and it is also why the two halves of a run
   * cut by an injection open together, which reads right: it is one turn.
   */
  const [expandedRuns, setExpandedRuns] = useState<ReadonlySet<string>>(() => new Set());
  // This screen is not remounted when the reader changes thread, so the set has to be emptied by
  // hand: a group is folded again every time a thread is opened, and holding run ids of threads
  // nobody is reading is a leak. It is no longer what keeps an empty group from being drawn --
  // being open is what fetches now (`FoldedRunGroup`), so a group reopened by a redraw fills
  // itself instead of sitting on a skeleton.
  useEffect(() => setExpandedRuns(new Set()), [threadId]);
  // Stable per thread: the group asks for its work from an effect keyed on this, and a fresh
  // closure every render would re-run it on every store change for nothing.
  const openRun = useCallback((summaries: RunSummaryItem[]) => requestRunItems(threadId, summaries), [threadId]);
  const toggleRun = useCallback((run: RunInfo) => {
    setExpandedRuns(current => {
      const next = new Set(current);
      if (!next.delete(run.id)) next.add(run.id);
      return next;
    });
  }, []);

  /**
   * Draws one bubble or card. `groupedFlag`/`showTimeFlag` are passed in rather than read from
   * the global index so the same code serves free rows and the children of a run group.
   */
  /**
   * Bring the bottom of the thread back under the keyboard when a free-text answer opens.
   *
   * The pending question is at the bottom -- the pill that jumps to it scrolls to the same
   * offset, and an inverted list pins offset 0 to the bottom edge whatever the keyboard leaves
   * of the viewport. The field is the last thing in the card, so this puts it right above the
   * composer instead of off screen under the keyboard.
   */
  const revealQuestionField = useCallback(() => {
    setAtBottom(true);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const renderItemContent = useCallback(
    (item: ChatItem, groupedFlag: boolean, showTimeFlag: boolean) => {
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
      if (item.kind === 'tool' && isSubAgentTool(item.name)) {
        return (
          <View style={toolColumn}>
          <SubAgentCard
            item={item}
            threadId={threadId}
            subagent={subagentDoors.get(item.id)}
            spawn={spawnLive?.get(item.id)}
            onOpen={onOpenSubAgent}
            expandTools={uiPrefs?.expandTools ?? false}
          />
          </View>
        );
      }
      if (item.kind === 'tool') {
        return (
          <View style={toolColumn}>
            <ToolCard item={item} threadId={threadId} expandTools={uiPrefs?.expandTools ?? false} />
          </View>
        );
      }
      // A folded row is drawn by the list, not here: it is a row of its own, never a child.
      if (item.kind === 'run') return null;
      return (
        <View style={toolColumn}>
        <Bubble
          item={item}
          mediaBase={mediaBase}
          deviceInfo={deviceInfo}
          grouped={groupedFlag}
          showTime={showTimeFlag}
          onMenu={onBubbleMenu}
          onResend={onResend}
          onOpenAttachment={openAttachment}
          expandReasoning={uiPrefs?.expandReasoning ?? false}
        />
        </View>
      );
    },
    [toolColumn, deviceInfo, mediaBase, onBubbleMenu, onResend, onOpenSubAgent, openAttachment, questionByCard, onQuestionReply, revealQuestionField, subagentDoors, spawnLive, threadId, uiPrefs],
  );

  const renderRowContent = useCallback(
    (row: ChatRow) => {
      // The live compaction rule, a row of its own: drawing it inside a cell put it on the wrong
      // side of the bubble it belongs to, because an inverted cell lays its children out in
      // `column-reverse` under a scaleY flip (docs/compaction-indicator.md).
      if (row.kind === 'rule') {
        return compactingSince === undefined ? null : <CompactionRunning since={compactingSince} />;
      }
      if (row.kind === 'item') {
        // Grouping is a property of reading order, so it is still computed oldest-first and the
        // item index is looked up rather than derived from the row position.
        const chronological = itemIndexById.get(row.item.id) ?? 0;
        return renderItemContent(row.item, grouped[chronological] ?? false, !(grouped[chronological + 1] ?? false));
      }
      // The work never travelled: the header draws from counts, and opening it fetches the items
      // that take its place -- docs/run-hydration.md.
      if (row.kind === 'folded') {
        return (
          <FoldedRunGroup
            run={row.run}
            summaries={row.summaries}
            open={expandedRuns.has(row.run.id)}
            onToggle={toggleRun}
            onOpen={openRun}
          />
        );
      }
      // The children group among themselves: the first of a block is not grouped against the row
      // before it, and the time shows on the last one, exactly like free bubbles do.
      return (
        <RunGroup
          run={row.run}
          items={row.items}
          open={expandedRuns.has(row.run.id)}
          onToggle={toggleRun}
          renderItem={(item, index, children) => {
            const childGrouped = isGrouped(children, index);
            return renderItemContent(item, childGrouped, !isGrouped(children, index + 1));
          }}
        />
      );
    },
    [grouped, itemIndexById, renderItemContent, expandedRuns, toggleRun, openRun, compactingSince],
  );

  /**
   * Every row is drawn inside its own boundary. The screen has one too, and it is the wrong
   * granularity: a single bubble that throws took the whole conversation down with it, and since
   * the item is in the store, reopening the thread hit the same one again.
   */
  const renderRow = useCallback(
    (row: ChatRow) => (
      <RowBoundary itemId={keyOfRow(row)}>{renderRowContent(row)}</RowBoundary>
    ),
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

  // The list is inverted, so its header is the bottom of the screen: the loose questions sit under
  // the newest message, where the thread actually stops, and so does the compaction rule as long as
  // no send is parked behind it (a parked one takes the rule above itself, `renderRow`).
  const listHeader = useMemo(
    () =>
      (compactingSince !== undefined && ruleBefore === undefined) || questionsLoose.length > 0 ? (
        <View style={styles.looseQuestions}>
          {compactingSince !== undefined && ruleBefore === undefined ? (
            <CompactionRunning since={compactingSince} />
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
    [compactingSince, ruleBefore, questionsLoose, onQuestionReply, revealQuestionField, styles.looseQuestions],
  );

  const listFooter = useMemo(
    () =>
      loadingOlder ? (
        <View style={styles.olderSpinner}>
          <ActivityIndicator size="small" color={palette.textFaint} />
        </View>
      ) : null,
    [loadingOlder, palette.textFaint, styles.olderSpinner],
  );

  const locationLabel = location
    ? addressOverride !== null
      ? addressOverride.trim() || 'Coordinates only'
      : location.address?.formatted ?? 'Resolving address…'
    : undefined;

  // Offset 0 is the newest message: the list is inverted, so the bottom is the start of the
  // scroll range. That is the whole point of inverting it — no scrollToEnd on open, no content
  // height to estimate, and the keyboard shrinking the viewport leaves offset 0 where it was.
  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    const nearBottom = event.nativeEvent.contentOffset.y <= 120;
    if (nearBottom !== atBottom) setAtBottom(nearBottom);
    // Only while the reader is on the newest message may the store drop its oldest items:
    // that is what keeps a long session light without ever taking a visible bubble away.
    chatStore.setTrimAllowed(threadId, nearBottom);
  }, [atBottom, threadId]);
  const { scrollProps, indicator } = useScrollIndicator({ onScroll: handleScroll, inverted: true });

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
              style={styles.menuButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Back to ${subagent.parentTitle}`}>
              <Text style={styles.backGlyph}>‹</Text>
            </Pressable>
            {/* The marker, in the accent and on its own: the title stays the identity and nothing
                else, which is what gets read, selected and copied. */}
            <Text style={styles.subGlyph}>◈</Text>
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={1}>
                {`${subagent.id.replace(/^subagent\//, '')} · ${subagent.type}`}
              </Text>
              {/* The parent is named rather than left to memory: the chevron says there is a way
                  out, this says where it lands. */}
              <Text style={styles.subtitle} numberOfLines={1}>
                {`${subagent.status === 'running' ? 'running' : 'idle'} · ${subagent.messageCount} msg${subagent.messageCount === 1 ? '' : 's'} · from ${subagent.parentTitle}`}
              </Text>
            </View>
            <Pressable
              onPress={onSubAgentMenu}
              hitSlop={8}
              style={styles.menuButton}
              accessibilityRole="button"
              accessibilityLabel="Sub-agent actions">
              <Text style={styles.menuGlyph}>⋮</Text>
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
            style={styles.menuButton}
            accessibilityRole="button"
            accessibilityLabel="Open conversations">
            <Text style={styles.menuGlyph}>☰</Text>
          </Pressable>
        )}
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        {subagentCount && subagentCount.total > 0 && onAgentsPress ? (
          <Pressable
            onPress={onAgentsPress}
            hitSlop={10}
            style={styles.agentsButton}
            accessibilityRole="button"
            accessibilityLabel={`${subagentCount.total} sub-agent${subagentCount.total === 1 ? '' : 's'}${subagentCount.running > 0 ? `, ${subagentCount.running} running` : ''}`}>
            <Text style={styles.agentsGlyph}>◈</Text>
            <Text style={styles.agentsCount}>{subagentCount.total}</Text>
            {subagentCount.running > 0 ? <Text style={styles.agentsRunning}>●</Text> : null}
          </Pressable>
        ) : null}
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
        <Pressable
          onPress={onOpenMenu}
          style={[styles.menuButton, layout.dense && styles.menuButtonDense]}
          accessibilityRole="button"
          accessibilityLabel="Commands">
          <Text style={styles.menuGlyph}>⋮</Text>
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
            onFocusChange={focused => (focusedRef.current = focused)}
            onSend={submit}
            onRecorded={stageVoiceNote}
            onRecordingError={setUploadError}
            hint={hint}
            commands={commands}
            attachments={attachments}
            location={location}
            locationLabel={locationLabel}
            onPickAttachment={openAttach}
            onRemoveAttachment={id => setAttachments(current => current.filter(item => item.id !== id))}
            onRemoveLocation={removeLocation}
            onPressLocation={openLocationSheet}
            locationBusy={locationBusy}
            onCommandEntered={onCommandEntered}
            uploading={uploading}
            uploadError={uploadError}
            uploadProgress={uploadProgress}
            streaming={streaming}
            onStop={onStop}
            questionPending={questionPending}
            onRecallLast={recallLast}
          />
        </View>
      ) : (
        <>
          {/* The list itself fills the pane: each row caps its own width above, because a bubble
              and a tool card do not want the same one. */}
          <View style={[styles.listWrap, toolColumn]} {...selectableProps()}>
            {/* Inverted: the newest message is index 0 and sits at offset 0, so opening a
                conversation lands on it with no scrolling at all. scrollToEnd on a list of
                unmeasured rows aims at an estimated content height and stops short of the last
                message, which is exactly the bug this replaces. Scrolling up towards older
                messages is then the list's own end, so paging back is onEndReached and the
                arriving page is appended — no scroll position to preserve, on either platform. */}
            {/* Keyed by thread, like the hero composer above and for a harder reason: a list kept
                across a swap keeps its scroll offset, and offset 3000 of the conversation just
                left is the middle of nowhere in the one arriving. It also fired onEndReached at
                once, paging in old entries nobody asked for, over recycled cells still holding
                the previous thread's rows. */}
            <FlatList
              key={threadId}
              ref={listRef}
              {...scrollProps}
              inverted
              data={reversedRows}
              keyExtractor={keyOfRow}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              renderItem={renderListItem}
              ListHeaderComponent={listHeader}
              onEndReached={onLoadOlder}
              onEndReachedThreshold={0.4}
              ListFooterComponent={listFooter}
              // Bubbles have no knowable height (markdown, images, tool output), so getItemLayout
              // is out and these numbers are the only handle on how much is mounted at once.
              initialNumToRender={12}
              maxToRenderPerBatch={8}
              updateCellsBatchingPeriod={50}
              windowSize={11}
              // removeClippedSubviews is deliberately off: the ⋯ menu sits absolutely positioned
              // outside its bubble, and Android clips exactly that away.
            />

        {indicator}

        {!atBottom && items.length > 0 ? (
          <Pressable
            style={styles.jump}
            onPress={() => {
              setAtBottom(true);
              listRef.current?.scrollToOffset({ offset: 0, animated: true });
            }}
            accessibilityRole="button"
            accessibilityLabel="Jump to latest message">
            <Text style={styles.jumpGlyph}>↓</Text>
          </Pressable>
        ) : null}
        </View>

        <View style={column}>
        {questionPending ? (
          // A card can be far up a long thread, and the only hint otherwise is a placeholder in
          // the composer. The run is blocked on the answer, so the form is the last thing in the
          // thread: the bottom of the list is where it is.
          <Pressable
            style={styles.questionPill}
            onPress={() => {
              setAtBottom(true);
              listRef.current?.scrollToOffset({ offset: 0, animated: true });
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
          onFocusChange={focused => (focusedRef.current = focused)}
          onSend={submit}
          onRecorded={stageVoiceNote}
          onRecordingError={setUploadError}
          hint={hint}
          commands={commands}
          attachments={attachments}
          location={location}
          locationLabel={locationLabel}
          onPickAttachment={openAttach}
          onRemoveAttachment={id => setAttachments(current => current.filter(item => item.id !== id))}
          onRemoveLocation={removeLocation}
          onPressLocation={openLocationSheet}
          locationBusy={locationBusy}
          onCommandEntered={onCommandEntered}
          uploading={uploading}
          uploadProgress={uploadProgress}
          uploadError={uploadError}
          streaming={streaming}
          onStop={onStop}
          questionPending={questionPending}
          onRecallLast={recallLast}
        />
        </View>
        </>
      )}

      {attachOpen ? (
        <ActionSheet
          preview="add to this message"
          options={[
            { label: 'Photo from gallery', onPress: pickPhotos },
            { label: 'Take a photo', onPress: takePhoto },
            { label: 'File', onPress: pickFiles },
            ...(clipboardImage
              ? [{ label: 'Paste image', hint: 'The image currently in the clipboard', onPress: pasteImage }]
              : []),
            ...(locationEnabled
              ? [{ label: 'Share current location', hint: 'One-shot GPS position with approximate address', onPress: shareLocation }]
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
            { label: 'Open in OpenStreetMap', onPress: () => Linking.openURL(locationMapUrl(location)).catch(() => {}) },
            { label: 'Remove location', danger: true, onPress: removeLocation },
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
    gap: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  // 26, not the menu glyph's 20: the same chevron at the same size as every other screen's back.
  backGlyph: { fontSize: 26, lineHeight: 28, color: palette.text },
  subGlyph: {
    color: palette.accent,
    fontSize: font.meta,
  },
  subRule: {
    height: 1,
    backgroundColor: palette.accent,
    marginTop: space.sm,
  },
  agentsButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    paddingHorizontal: space.xs,
  },
  agentsGlyph: {
    color: palette.accent,
    fontSize: font.meta,
  },
  agentsCount: {
    color: palette.text,
    fontSize: font.small,
    fontVariant: ['tabular-nums' as const],
  },
  agentsRunning: {
    color: palette.accent,
    fontSize: font.micro,
  },
  menuButtonDense: { width: 32, height: 32 },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  menuGlyph: { fontSize: 20, lineHeight: 22, color: palette.text },
  headerText: { flex: 1 },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  subtitle: { fontSize: font.small, color: palette.textFaint },
  statusButton: { padding: 2 },
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
  // The list is inverted, so its content box is upside down too: what is written as the top
  // padding is drawn under the newest message.
  // The horizontal padding used to come free with the reading column, which was narrower than
  // the pane; now that a tool card is allowed the full width it has to be asked for, or a card
  // is drawn hard against both edges of the window.
  listContent: { paddingTop: space.sm, paddingBottom: space.md, paddingHorizontal: space.sm },
  olderSpinner: { paddingVertical: space.md, alignItems: 'center' as const },
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
  jump: {
    position: 'absolute' as const,
    right: 0,
    bottom: space.md,
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  jumpGlyph: { fontSize: 16, color: palette.text, lineHeight: 20 },
});