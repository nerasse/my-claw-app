import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { PlusIcon, SendIcon } from './icons';
import { commandQuery, filterCommands, type CommandDef } from '../core/commands';
import { COMPOSER_INPUT_ID } from '../core/domIds';
import { editorIntent } from '../core/editorKeys';
import { useLayout } from '../core/layout';
import { autoGrow } from '../core/webProps';
import type { VoiceRecording } from '../core/nativeBridge';
import type { LocationData } from '../core/protocol';
import { StagedVoiceList } from './StagedVoiceList';
import { VoiceRecorder } from './VoiceRecorder';
import { micSupported } from '../core/platform';
import type { PendingAttachment } from '../core/upload';
import { formatBytes } from '../core/utils';
import { font, lineHeightFor, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';

export function Composer({
  value,
  onChange,
  onFocusChange,
  onSend,
  hint,
  hero,
  autoFocus,
  commands,
  onCommandEntered,
  attachments,
  location,
  locationLabel,
  onPickAttachment,
  onRemoveAttachment,
  onRemoveLocation,
  onPressLocation,
  locationBusy,
  uploading,
  uploadError,
  uploadProgress,
  onRecorded,
  onRecordingError,
  streaming,
  onStop,
  stopping,
  questionPending,
  onRecallLast,
}: {
  value: string;
  onChange: (text: string) => void;
  /** Whether the field holds the caret: a draft from another device must not interrupt typing. */
  onFocusChange?: (focused: boolean) => void;
  onSend: () => void;
  /** Shown above the field when something is worth knowing (offline, queued frames). */
  hint?: string;
  /** A question sheet is asking on this thread: the field says so instead of pretending.
   *  Typing here cancels the question (the message becomes the answer, server-side). */
  questionPending?: boolean;
  /** Large centered variant for empty conversations: the empty state is an invitation to type. */
  hero?: boolean;
  /** Auto-focus only when the user just created the thread, never at boot. */
  autoFocus?: boolean;
  /** Server-provided catalog for the slash-menu. */
  commands?: CommandDef[];
  /**
   * The user picked a command from the slash-menu. Returns true when the app handled it
   * natively (the menu's text must then stay out of the field); false keeps the old text
   * insertion for commands that still want arguments typed by hand.
   */
  onCommandEntered?: (command: string) => boolean;
  /** Files staged for the next message. */
  attachments?: PendingAttachment[];
  /** One-shot location staged for the next message. */
  location?: LocationData;
  /** Address line of the staged location: the preview value, the edit or its pending state. */
  locationLabel?: string;
  /** Opens the attachment picker sheet. */
  onPickAttachment?: () => void;
  onRemoveAttachment?: (id: string) => void;
  onRemoveLocation?: () => void;
  /** Opens the staged location editor: address preview, edit and removal. */
  onPressLocation?: () => void;
  locationBusy?: boolean;
  uploading?: boolean;
  uploadError?: string | null;
  /** Percent of each staged file already on the server, keyed by attachment id. */
  uploadProgress?: Record<string, number>;
  /** A finished voice note. Absent means the composer offers no microphone at all. */
  onRecorded?: (recording: VoiceRecording) => void;
  onRecordingError?: (message: string) => void;
  /** A run is answering in the conversation: the empty composer offers Stop instead of Send. */
  streaming?: boolean;
  onStop?: () => void;
  /**
   * A stop is in flight on this thread, from this device or another surface. The corner shows a
   * loader where the ■ was, wearing the same word the session menu does, and the press goes
   * nowhere: `chatStore.claimStop` refuses while one is in flight, so no second frame leaves and
   * no second bubble is drawn for the one stop.
   */
  stopping?: boolean;
  /**
   * Up arrow on an empty field: bring back the last message sent, to fix a typo and send it
   * again. A desktop habit, and there is no arrow key to press on a phone.
   */
  onRecallLast?: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  // Pill buttons sized for a thumb look like toys under a cursor, and eat the field's height.
  const { dense } = useLayout();
  const empty = value.trim().length === 0;
  const staged = (attachments?.length ?? 0) + (location ? 1 : 0);
  // An attachment on its own is a message. Gating on text alone made the button dead for a
  // photo sent without a caption, even though the send path already accepted it.
  // An upload in flight already holds the staged files: a second tap would upload them again
  // and send a second, empty message beside the first.
  const nothingToSend = (empty && staged === 0) || uploading === true;
  const [recording, setRecording] = useState(false);
  /**
   * The microphone is offered as long as nothing has been typed, so several notes can be
   * recorded in a row. It only steps aside for a written message, which is the one case where
   * the two would compete for the same corner. Once anything is staged the send arrow appears
   * beside it, so adding another note and sending are both one tap away.
   */
  // A browser on a plain-HTTP origin has no microphone at all: no button rather than a button
  // that fails at the moment it is held.
  const micVisible = onRecorded !== undefined && empty && micSupported;
  /**
   * Mid-run the corner belongs to whatever is composed. A message sent while the agent is
   * answering is injected into that same turn (the server's mailbox, docs/injection.md), so a
   * Stop button sitting on top of a written message forced a choice between steering the run and
   * killing it -- and the text had to be held until the run ended. Stop is what the corner shows
   * when there is nothing to send, which is exactly the state you are in when interrupting is
   * the only thing left to do.
   */
  const stopVisible = streaming === true && !recording && nothingToSend;
  const sendVisible = !recording && !stopVisible && (!micVisible || staged > 0);
  const recordings = attachments?.filter(item => item.audioAsVoice) ?? [];
  const files = attachments?.filter(item => !item.audioAsVoice) ?? [];

  const query = commandQuery(value);
  const menu = query !== null && commands ? filterCommands(query, commands) : null;
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    setSelected(0);
  }, [query]);

  const insert = useCallback(
    (name: string) => {
      // A command the app handles natively (model picker, new thread) must not be typed as
      // text: it would be sent to the model as a question instead of opening the menu. The
      // "/name" draft goes away with it, since there is nothing left to finish typing.
      if (onCommandEntered?.(name) === true) {
        onChange('');
        return;
      }
      onChange(`/${name} `);
    },
    [onChange, onCommandEntered],
  );

  const submitOrSelect = useCallback(() => {
    if (menu && menu.length > 0) {
      insert(menu[Math.min(selected, menu.length - 1)]!.name);
      return;
    }
    onSend();
  }, [insert, menu, onSend, selected]);

  const onKeyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      const menuOpen = (menu?.length ?? 0) > 0;
      switch (editorIntent(event, { menuOpen, empty: value.length === 0 })) {
        case 'submit':
          submitOrSelect();
          return;
        case 'complete':
          if (menu && menu.length > 0) insert(menu[Math.min(selected, menu.length - 1)]!.name);
          return;
        case 'menu-down':
          if (menu) setSelected(index => (index + 1) % menu.length);
          return;
        case 'menu-up':
          if (menu) setSelected(index => (index - 1 + menu.length) % menu.length);
          return;
        case 'recall':
          onRecallLast?.();
          return;
        default:
      }
    },
    [insert, menu, onRecallLast, selected, submitOrSelect, value.length],
  );

  /**
   * A textarea has one height in a browser, so the field is resized to its content on every
   * change. No-op on Android, where the multiline TextInput grows by itself.
   *
   * The ceiling is the very same number the stylesheet caps the field at. They used to disagree
   * (180 here, `maxHeight: 112` there): the inline height was clamped by the CSS while the
   * overflow stayed hidden, so a fifth line was neither visible nor reachable by scrolling.
   */
  const inputRef = useRef<TextInput>(null);
  const maxTextHeight = hero
    ? MAX_TEXT_HEIGHT.hero
    : dense
      ? MAX_TEXT_HEIGHT.dense
      : MAX_TEXT_HEIGHT.compact;
  useEffect(() => {
    autoGrow(inputRef.current, maxTextHeight);
  }, [value, maxTextHeight]);

  return (
    <View style={[styles.wrap, hero && styles.wrapHero]}>
      {menu && menu.length > 0 ? (
        <View style={styles.menu}>
          {menu.map((command, index) => (
            <Pressable
              key={command.name}
              style={[styles.menuItem, index === selected && styles.menuItemSelected]}
              onPress={() => insert(command.name)}
              accessibilityRole="button"
              accessibilityState={{ selected: index === selected }}
              accessibilityLabel={`Command ${command.name}: ${command.description}`}>
              <Text style={styles.menuName}>/{command.name}</Text>
              <Text style={styles.menuDesc} numberOfLines={2}>
                {command.description}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {uploadError ? <Text style={styles.uploadError}>{uploadError}</Text> : null}
      {location ? (
        <View style={styles.locationChip}>
          <Pressable
            style={styles.locationMain}
            onPress={onPressLocation}
            accessibilityRole="button"
            accessibilityLabel="Edit current location">
            <Text style={styles.locationTitle}>Current location</Text>
            {locationLabel ? (
              <Text style={styles.locationAddress} numberOfLines={1}>
                {locationLabel}
              </Text>
            ) : null}
            <Text style={styles.locationMeta}>
              Approximate · GPS accuracy +/- {Math.round(location.accuracyMeters)} m
            </Text>
          </Pressable>
          {onRemoveLocation ? (
            <Pressable
              onPress={onRemoveLocation}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Remove current location">
              <Text style={styles.chipRemove}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {/* Recordings get a full row each; anything else stays a chip, since a file name is all
          there is to show about it. */}
      {recordings.length > 0 ? (
        <StagedVoiceList attachments={recordings} onRemove={onRemoveAttachment} />
      ) : null}
      {files.length > 0 ? (
        <View style={styles.chips}>
          {files.map(attachment => {
            const percent = uploadProgress?.[attachment.id];
            return (
              <View key={attachment.id} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>
                  {attachment.filename}
                  {attachment.sizeBytes ? ` · ${formatBytes(attachment.sizeBytes)}` : ''}
                  {percent !== undefined && percent < 100 ? ` · ${percent}%` : ''}
                </Text>
                {onRemoveAttachment ? (
                  <Pressable
                    onPress={() => onRemoveAttachment(attachment.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove attachment ${attachment.filename}`}>
                    <Text style={styles.chipRemove}>✕</Text>
                  </Pressable>
                ) : null}
                {percent !== undefined ? (
                  <View style={styles.chipTrack}>
                    <View style={[styles.chipFill, { width: `${percent}%` as never }]} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      <View style={styles.row}>
        {onPickAttachment && !recording ? (
          <Pressable
            style={[styles.attach, hero && styles.sendHero, dense && !hero && styles.buttonDense]}
            onPress={onPickAttachment}
            disabled={uploading || locationBusy}
            accessibilityRole="button"
            accessibilityLabel="Add attachment">
            {uploading || locationBusy ? (
              <ActivityIndicator size="small" color={palette.textFaint} />
            ) : (
              <PlusIcon size={20} color={palette.accent} />
            )}
          </Pressable>
        ) : null}
        {recording ? null : (
        // The frame is the wrapper's, never the field's: border, background and padding on the
        // input itself scroll away with the text on Android, which is why a long message came to
        // sit across the rounded edge, cut in the middle of a line.
        <View style={[styles.field, hero && styles.fieldHero, dense && !hero && styles.fieldDense]}>
          <TextInput
            ref={inputRef}
            // Read back by the window paste listener on web: a paste is for the chat only when the
            // focus is here or nowhere.
            id={COMPOSER_INPUT_ID}
            style={[styles.input, hero && styles.inputHero, dense && !hero && styles.inputDense]}
            value={value}
            onChangeText={onChange}
            onFocus={() => onFocusChange?.(true)}
            onBlur={() => onFocusChange?.(false)}
            onSubmitEditing={submitOrSelect}
            onKeyPress={onKeyPress}
            placeholder={hero ? (questionPending ? 'Answer the pending questions' : 'Ask anything') : questionPending ? 'Answer the pending questions' : 'message'}
            placeholderTextColor={palette.textFaint}
            autoFocus={autoFocus}
            multiline
            blurOnSubmit={false}
            accessibilityLabel="Message to send"
          />
        </View>
        )}
        {micVisible ? (
          <VoiceRecorder
            hero={hero}
            onRecorded={onRecorded}
            onError={onRecordingError ?? (() => {})}
            onActiveChange={setRecording}
          />
        ) : null}
        {sendVisible ? (
          <Pressable
            style={[
              styles.send,
              hero && styles.sendHero,
              dense && !hero && styles.buttonDense,
              nothingToSend && styles.sendIdle,
            ]}
            onPress={onSend}
            disabled={nothingToSend}
            accessibilityRole="button"
            accessibilityLabel="Send message">
            <SendIcon
              size={hero ? 22 : 20}
              color={nothingToSend ? palette.textFaint : palette.accentText}
            />
          </Pressable>
        ) : null}
        {stopVisible ? (
          <Pressable
            style={[styles.send, hero && styles.sendHero, dense && !hero && styles.buttonDense, styles.sendStop]}
            onPress={onStop}
            accessibilityRole="button"
            accessibilityLabel={stopping ? 'Stopping…' : 'Stop generating'}>
            {stopping ? (
              // The abort is travelling: nothing left to interrupt, so the ■ gives way to the
              // loader and the same word every other surface shows.
              <ActivityIndicator size="small" color={palette.accentText} />
            ) : (
              <Text style={styles.stopGlyph}>■</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * How tall the text may grow before it scrolls inside its frame, per variant. Text only: the
 * padding and the border belong to the wrapper, so this is the number the stylesheet caps the
 * field at and the number the browser's autoGrow stops at, and there is only one of it.
 */
const MAX_TEXT_HEIGHT = { compact: 94, dense: 188, hero: 218 };

const createStyles = (palette: Palette) => ({
  wrap: { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: space.sm, gap: space.xs },
  wrapHero: { borderTopWidth: 0, paddingTop: 0 },
  hint: { fontSize: font.small, color: palette.textMuted, paddingHorizontal: space.xs },
  // Inverted dropdown: sits above the field, never over the keyboard.
  menu: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: '100%' as const,
    marginBottom: space.sm,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingVertical: space.xs,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  menuItem: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: 1 },
  menuItemSelected: { backgroundColor: palette.accentSoft },
  menuName: { fontSize: font.meta, fontFamily: 'monospace', color: palette.accent, fontWeight: '600' as const },
  menuDesc: { fontSize: font.small, color: palette.textMuted, lineHeight: lineHeightFor(font.small) },
  row: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: space.sm },
  attach: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.xs },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    maxWidth: '90%' as const,
    backgroundColor: palette.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 4,
  },
  chipText: { flexShrink: 1, fontSize: font.small, color: palette.text },
  chipRemove: { fontSize: font.meta, lineHeight: 15, color: palette.textMuted },
  chipTrack: {
    position: 'absolute' as const,
    left: 2,
    right: 2,
    bottom: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: palette.surfaceAlt,
    overflow: 'hidden' as const,
  },
  chipFill: { height: 2, backgroundColor: palette.accent },
  uploadError: { fontSize: font.small, color: palette.danger, paddingHorizontal: space.xs },
  locationChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.md,
    backgroundColor: palette.accentSoft,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  locationMain: { flex: 1, gap: 2 },
  locationTitle: { fontSize: font.meta, fontWeight: '600' as const, color: palette.text },
  locationAddress: { fontSize: font.small, color: palette.textMuted },
  locationMeta: { fontSize: font.small, color: palette.textFaint },
  field: {
    flex: 1,
    // Same height as the send button so the two pills align exactly.
    minHeight: 44,
    justifyContent: 'center' as const,
    paddingHorizontal: space.md,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: palette.border,
    // Half the collapsed height, not `radius.pill`. A pill radius is 999: empty, the field is a
    // perfect pill either way, but grown to six lines it becomes a stadium whose ends are
    // 88pt half-circles, and the first line of text is then drawn outside the shape that is
    // supposed to contain it. Half the height rounds the corners and leaves the sides straight.
    borderRadius: 22,
    backgroundColor: palette.surfaceAlt,
  },
  fieldHero: {
    minHeight: 50,
    paddingHorizontal: space.lg,
    paddingVertical: 11,
    borderRadius: radius.lg,
  },
  input: {
    maxHeight: MAX_TEXT_HEIGHT.compact,
    // Android's EditText ships its own padding, and the frame owns the spacing now.
    padding: 0,
    fontSize: font.body,
    color: palette.text,
  },
  inputHero: {
    maxHeight: MAX_TEXT_HEIGHT.hero,
    fontSize: 16,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sendHero: { width: 50, height: 50 },
  buttonDense: { width: 36, height: 36 },
  // A mouse can scroll a tall field and a desktop has the room: four lines is a phone's ceiling.
  fieldDense: { minHeight: 36, paddingVertical: 6, borderRadius: 18 },
  inputDense: { maxHeight: MAX_TEXT_HEIGHT.dense },
  sendIdle: { backgroundColor: palette.surfaceAlt, borderWidth: 1, borderColor: palette.border },
  sendStop: { backgroundColor: palette.danger },
  stopGlyph: { fontSize: 16, lineHeight: 18, color: palette.accentText },
});
