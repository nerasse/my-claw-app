import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { Bubble } from '../components/Bubble';
import { ToolCard } from '../components/ToolCard';
import { Composer } from '../components/Composer';
import { ActionSheet } from '../components/ActionSheet';
import type { ChatItem, TextItem } from '../core/chat';
import type { DeviceInfo } from '../core/device';
import { connection } from '../core/connection';
import { deviceBridge } from '../core/nativeBridge';
import { useCommands } from '../core/commands';
import { encodeCommandsList, type AttachmentMeta, type LocationData, type LocationInput } from '../core/protocol';
import { uploadMedia, type OutgoingAttachment, type PendingAttachment } from '../core/upload';
import type { VoiceRecording } from '../core/nativeBridge';
import { voiceFilename } from '../core/voice';
import { uuid } from '../core/utils';
import { getCurrentLocation } from '../core/location';
import { locationPreview } from '../core/locationPreview';
import { LocationEditor } from '../components/LocationEditor';
import { locationMapUrl } from '../components/LocationView';
import type { WsState } from '../core/types';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

const GROUP_WINDOW_MS = 120_000;

function pickAssetToPending(asset: { uri?: string; fileName?: string | null; type?: string | null; fileSize?: number | null }): PendingAttachment | null {
  if (!asset.uri) return null;
  const filename = asset.fileName ?? `photo-${Date.now()}.jpg`;
  const mimeType = asset.type ?? 'application/octet-stream';
  const type: AttachmentMeta['type'] = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : 'file';
  return { id: uuid(), uri: asset.uri, filename, type, mimeType, sizeBytes: asset.fileSize ?? undefined };
}

/** Same author, close in time and not split by a tool card: render as one visual block. */
function isGrouped(items: ChatItem[], index: number): boolean {
  const item = items[index];
  const previous = items[index - 1];
  if (!item || !previous || item.kind !== 'text' || previous.kind !== 'text') return false;
  return previous.role === item.role && item.ts - previous.ts < GROUP_WINDOW_MS;
}

export function ChatScreen({
  threadId,
  title,
  subtitle,
  connectionState,
  items,
  mediaBase,
  deviceInfo,
  hint,
  autoFocusHero,
  onOpenDrawer,
  onStatusPress,
  onSend,
  locationEnabled,
  onBubbleMenu,
  onOpenImage,
  onOpenText,
  onOpenVideo,
  onOpenFile,
  onOpenMenu,
  onCommandEntered,
  onTagCommand,
  streaming,
  onStop,
  onNewThread,
  subagentCount,
  onAgentsPress,
  subagent,
  subagentDoors,
  onOpenSubAgent,
  onSubAgentMenu,
}: {
  threadId: string;
  title: string;
  subtitle: string;
  connectionState: WsState;
  items: ChatItem[];
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
  hint?: string;
  autoFocusHero: boolean;
  onOpenDrawer: () => void;
  onStatusPress: () => void;
  onSend: (text: string, attachments?: OutgoingAttachment[], location?: LocationInput) => void;
  /** Server capability; false until the post-connect capability frame says otherwise. */
  locationEnabled: boolean;
  onBubbleMenu: (item: TextItem) => void;
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
  onOpenSubAgent?: (toolItemId: string) => void;
  onSubAgentMenu?: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const listRef = useRef<FlatList<ChatItem>>(null);
  // What the list is doing right now, tracked from its own events: the keyboard resizes the
  // viewport without scrolling, so keeping the visible content anchored needs the before/after.
  const viewportRef = useRef(0);
  const offsetRef = useRef(0);
  const contentRef = useRef(0);
  const [draft, setDraft] = useState('');
  const [atBottom, setAtBottom] = useState(true);
  const commands = useCommands();
  const inCommandRef = useRef(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
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
  }, [threadId]);

  useEffect(() => {
    if (!atBottom) return;
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 40);
    return () => clearTimeout(timer);
  }, [items, atBottom]);

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
      setDraft('');
      return;
    }
    // /new is the wire form of the + button: a fresh conversation, not a reset of this one.
    // Intercepted here so it works even when the slash-menu is closed, and never reaches the
    // server as a command about a conversation the user is leaving.
    if (!stagedLocation && attachments.length === 0 && text.toLowerCase() === '/new') {
      onNewThread();
      setDraft('');
      return;
    }
    if (attachments.length > 0) {
      if (!deviceInfo) {
        setUploadError('device not initialized');
        return;
      }
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
        } finally {
          setUploading(false);
        }
      })();
    } else {
      setLocation(undefined);
      setAddressOverride(null);
      onSend(text, undefined, locationToSend);
    }
    setDraft('');
  }, [attachments, deviceInfo, draft, location, addressOverride, mediaBase, onNewThread, onSend, threadId, onTagCommand]);

  const empty = items.length === 0;

  const locationLabel = location
    ? addressOverride !== null
      ? addressOverride.trim() || 'Coordinates only'
      : location.address?.formatted ?? 'Resolving address…'
    : undefined;

  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    offsetRef.current = contentOffset.y;
    contentRef.current = contentSize.height;
    const nearBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 120;
    if (nearBottom !== atBottom) setAtBottom(nearBottom);
  }, [atBottom]);
  const handleContentSize = useCallback((_width: number, height: number) => {
    contentRef.current = height;
    if (atBottom) listRef.current?.scrollToEnd({ animated: false });
  }, [atBottom]);
  const handleListLayout = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    const previous = viewportRef.current;
    viewportRef.current = height;
    // A shrink (the keyboard opening, the composer growing) cuts the bottom of the viewport off
    // the content without moving the offset. Scroll down by exactly what was cut, clamped to the
    // new maximum: the message that was just above the keyboard stays where it was, and a list
    // read from the bottom stays at the bottom. A grow needs nothing: the content keeps its spot.
    if (previous <= 0 || height >= previous) return;
    const shrink = previous - height;
    const max = Math.max(contentRef.current - height, 0);
    const target = Math.min(offsetRef.current + shrink, max);
    if (target === offsetRef.current) return;
    listRef.current?.scrollToOffset({ offset: target, animated: false });
    offsetRef.current = target;
    if (target + height >= contentRef.current - 120) setAtBottom(true);
  }, []);
  const { scrollProps, indicator } = useScrollIndicator(handleScroll, handleContentSize, handleListLayout);

  return (
    <View style={styles.screen}>
      {subagent ? (
        <View style={styles.subHeader}>
          {/* Names the parent rather than saying "back": the way out must be legible without
              remembering how you got in. */}
          <Pressable
            onPress={onOpenDrawer}
            style={styles.backRow}
            accessibilityRole="button"
            accessibilityLabel={`Back to ${subagent.parentTitle}`}>
            <Text style={styles.backGlyph}>‹</Text>
            <Text style={styles.backLabel} numberOfLines={1}>
              {subagent.parentTitle}
            </Text>
          </Pressable>
          <View style={styles.subIdentity}>
            <Text style={styles.subGlyph}>◈</Text>
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={1}>
                {`${subagent.id.replace(/^subagent\//, '')} · ${subagent.type}`}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {`${subagent.status === 'running' ? 'running' : 'idle'} · ${subagent.messageCount} msg${subagent.messageCount === 1 ? '' : 's'}`}
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
      <View style={styles.header}>
        <Pressable
          onPress={onOpenDrawer}
          style={styles.menuButton}
          accessibilityRole="button"
          accessibilityLabel="Open conversations">
          <Text style={styles.menuGlyph}>☰</Text>
        </Pressable>
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
          style={styles.menuButton}
          accessibilityRole="button"
          accessibilityLabel="Commands">
          <Text style={styles.menuGlyph}>⋮</Text>
        </Pressable>
      </View>
      )}

      {empty ? (
        // New conversation: the composer itself is the screen. Keyed by thread so switching
        // straight from one empty thread to another re-focuses the field.
        <View style={styles.hero}>
          <Composer
            key={threadId}
            hero
            autoFocus={autoFocusHero}
            value={draft}
            onChange={setDraft}
            onSend={submit}
            onRecorded={stageVoiceNote}
            onRecordingError={setUploadError}
            hint={hint}
            commands={commands}
            attachments={attachments}
            location={location}
            locationLabel={locationLabel}
            onPickAttachment={() => setAttachOpen(true)}
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
          />
        </View>
      ) : (
        <>
          <View style={styles.listWrap}>
            <FlatList
              ref={listRef}
              {...scrollProps}
              data={items}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item, index }) =>
                item.kind === 'tool' ? (
                  <ToolCard
                    item={item}
                    {...(subagentDoors.get(item.id)
                      ? { subagent: subagentDoors.get(item.id)!, onOpenSubAgent: () => onOpenSubAgent?.(item.id) }
                      : {})}
                  />
                ) : (
                  <Bubble
                    item={item}
                    mediaBase={mediaBase}
                    deviceInfo={deviceInfo}
                grouped={isGrouped(items, index)}
                showTime={!isGrouped(items, index + 1)}
                onMenu={() => onBubbleMenu(item)}
                onOpenAttachment={(kind, target) =>
                  kind === 'image'
                    ? onOpenImage(target)
                    : kind === 'text'
                      ? onOpenText(target)
                      : kind === 'video'
                        ? onOpenVideo(target)
                        : onOpenFile(target)
                }
              />
            )
          }
        />

        {indicator}

        {!atBottom && items.length > 0 ? (
          <Pressable
            style={styles.jump}
            onPress={() => {
              setAtBottom(true);
              listRef.current?.scrollToEnd({ animated: true });
            }}
            accessibilityRole="button"
            accessibilityLabel="Jump to latest message">
            <Text style={styles.jumpGlyph}>↓</Text>
          </Pressable>
        ) : null}
        </View>

        <Composer
          value={draft}
          onChange={setDraft}
          onSend={submit}
          onRecorded={stageVoiceNote}
          onRecordingError={setUploadError}
          hint={hint}
          commands={commands}
          attachments={attachments}
          location={location}
          locationLabel={locationLabel}
          onPickAttachment={() => setAttachOpen(true)}
          onRemoveAttachment={id => setAttachments(current => current.filter(item => item.id !== id))}
          onRemoveLocation={removeLocation}
          onPressLocation={openLocationSheet}
          locationBusy={locationBusy}
          onCommandEntered={onCommandEntered}
          uploading={uploading}
          uploadError={uploadError}
          streaming={streaming}
          onStop={onStop}
        />
        </>
      )}

      {attachOpen ? (
        <ActionSheet
          preview="add to this message"
          options={[
            { label: 'Photo from gallery', onPress: pickPhotos },
            { label: 'Take a photo', onPress: takePhoto },
            { label: 'File', onPress: pickFiles },
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
  subHeader: {
    paddingBottom: space.sm,
  },
  backRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingVertical: 2,
  },
  backGlyph: {
    color: palette.accent,
    fontSize: 20,
    lineHeight: 22,
    marginTop: -2,
  },
  backLabel: {
    flex: 1,
    color: palette.accent,
    fontSize: font.small,
  },
  subIdentity: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
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
  listContent: { paddingTop: space.md, paddingBottom: space.sm },
  hero: {
    flex: 1,
    justifyContent: 'center' as const,
    paddingHorizontal: space.md,
    paddingBottom: space.xl,
  },
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
