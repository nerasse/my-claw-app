import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, FlatList, Platform, Pressable, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { ActionSheet, type SheetEntry } from '../components/ActionSheet';
import { CopyButton } from '../components/CopyButton';
import { DownloadControl } from '../components/DownloadControl';
import { PromptSheet } from '../components/PromptSheet';
import { CodeEditor } from '../components/CodeEditor';
import { DEFAULT_EDITOR_FONT_SIZE } from '../components/codeeditor/protocol';
import { DocumentMarkdown } from '../components/DocumentMarkdown';
import { DocZoomControl } from '../components/DocZoomControl';
import { languageForFile } from '../components/codeeditor/document';
import { FolderIcon } from '../components/icons';
import { useScrollIndicator } from '../components/ScrollIndicator';
import { useHardwareBack } from '../core/hardwareBack';
import { useDismissKeyboard } from '../core/keyboard';
import type { DeviceInfo } from '../core/device';
import { fsStore, sortEntries, useFsStore, type FsOpenFile } from '../core/fsStore';
import { useDocFontScale } from '../core/docZoom';
import { prefs } from '../core/prefs';
import { formatBytes, formatDate, httpOrigin } from '../core/utils';
import { fsDownloadUrl, uploadToFs, type FsLocalFile } from '../core/upload';
import { requestDownload } from '../core/downloadFlow';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';
import type { FsEntry } from '../core/protocol';

/**
 * The system files page: the whole machine my-claw runs on, from the phone.
 *
 * It is not `FilesScreen.tsx`, which lists one conversation's attachments: this one walks the
 * server's real filesystem and opens a CodeMirror on any file that holds text, whatever its
 * extension. Three modes, one store (`core/fsStore.ts`), and the wire contract of the server's
 * `docs/files-page.md` -- an answer echoes the path it answers, and everything this page does
 * hangs off that.
 *
 * What the page owes the owner, and why: a directory listing that hides nothing (node_modules
 * and .git are as visible as anything else) but states its size, date and truncation; a read
 * that follows a growing file; and an editor that never overwrites a save the server refused,
 * never reloads under the owner's fingers, and never lets a dirty buffer walk out the door
 * without asking.
 */

/** The bits of the picker's response this page uses, named here so nothing else imports it. */
type PickedDocument = {
  uri: string;
  name: string | null;
  type: string | null;
};

/**
 * The document picker, loaded on demand rather than at import time.
 *
 * `@react-native-documents/picker` resolves its native spec with `TurboModuleRegistry
 * .getEnforcing` at module evaluation, and that call throws wherever the native module is not
 * registered -- the web bundle, and any Android build that predates the picker. A static import
 * would therefore take the whole page (and with it the web app, which imports every screen at
 * boot) down before it ever rendered. Deferred, the failure costs one gesture and lands in the
 * notice line instead.
 */
async function pickLocalFiles(): Promise<FsLocalFile[] | null> {
  if (Platform.OS === 'web') {
    fsStore.setNotice('sending files is a phone gesture: the browser has no document picker');
    return null;
  }
  const picker = await import('@react-native-documents/picker');
  try {
    const picked: PickedDocument[] = await picker.pick({ allowMultiSelection: true });
    const files: FsLocalFile[] = [];
    for (const item of picked) {
      // A virtual file (a Google Doc) has no bytes anywhere to send: it is a reference the
      // picker resolves, not a file the upload can read.
      const virtual = (item as { isVirtual?: boolean | null }).isVirtual === true;
      if (virtual) continue;
      files.push({
        uri: item.uri,
        name: item.name ?? 'upload',
        type: item.type ?? 'application/octet-stream',
      });
    }
    return files;
  } catch (err) {
    if (picker.isErrorWithCode(err) && err.code === picker.errorCodes.OPERATION_CANCELED) return null;
    throw err;
  }
}

function parentOf(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const cut = trimmed.lastIndexOf('/');
  if (cut <= 0) return '/';
  return trimmed.slice(0, cut);
}

function joinPath(dir: string, name: string): string {
  return dir === '/' ? `/${name}` : `${dir}/${name}`;
}

/** Every prefix of the normalised path, so the breadcrumb is built from what the server walked. */
function crumbsOf(path: string): Array<{ label: string; path: string }> {
  const crumbs = [{ label: '/', path: '/' }];
  let acc = '';
  for (const part of path.split('/').filter(Boolean)) {
    acc += `/${part}`;
    crumbs.push({ label: part, path: acc });
  }
  return crumbs;
}

function isDirEntry(entry: FsEntry): boolean {
  return entry.kind === 'dir' || entry.targetKind === 'dir';
}

/** The little tag a row wears: folders get the icon, everything else a word. */
function badgeFor(entry: FsEntry): string {
  if (entry.kind === 'symlink') return 'link';
  if (entry.kind === 'other') return '·';
  const name = entry.name;
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return 'file';
  return name.slice(dot + 1).toLowerCase().slice(0, 5);
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function metaOf(file: FsOpenFile, cursor: number, rendered: boolean): string {
  const parts: string[] = [];
  if (file.size !== null) parts.push(formatBytes(file.size));
  if (file.mtimeMs !== null) parts.push(formatDate(new Date(file.mtimeMs).toISOString()));
  // A rendered document has no cursor: claiming a line would be a figure for a caret that is
  // not on screen. It comes back the moment `Edit` hands the file to CodeMirror.
  if (file.text !== null && !rendered) parts.push(`ln ${cursor}`);
  if (file.encoding) parts.push(file.encoding);
  if (file.eol) parts.push(file.eol);
  if (file.text !== null) parts.push(file.watching ? 'live' : 'not watched');
  return parts.join(' · ');
}

/**
 * One row of the listing. Memoized, and the callbacks take the entry rather than closing over
 * it, the way every long list in this app is drawn.
 */
const FileRow = React.memo(function FileRowView({
  entry,
  downloadUrl,
  onOpen,
  onActions,
}: {
  entry: FsEntry;
  /** Where this file can be fetched from, or nothing when the identity is not ready yet. */
  downloadUrl?: string;
  onOpen: (entry: FsEntry) => void;
  onActions: (entry: FsEntry) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const dir = isDirEntry(entry);
  const stamp =
    entry.mtimeMs > 0 ? formatDate(new Date(entry.mtimeMs).toISOString()) : '';
  return (
    <View style={styles.row}>
      <Pressable
        style={styles.rowMain}
        onPress={() => onOpen(entry)}
        onLongPress={() => onActions(entry)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${entry.path}`}>
        {dir ? (
          <View style={styles.rowIcon}>
            <FolderIcon size={18} color={palette.textMuted} />
          </View>
        ) : (
          <View style={styles.rowBadge}>
            <Text style={styles.rowBadgeText}>{badgeFor(entry)}</Text>
          </View>
        )}
        <View style={styles.rowText}>
          <Text style={styles.rowName} numberOfLines={1}>
            {entry.name}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {entry.kind === 'dir' ? 'folder' : formatBytes(entry.size)}
            {entry.kind === 'symlink' ? ' · symlink' : ''}
            {stamp ? ` · ${stamp}` : ''}
          </Text>
        </View>
        {dir ? <Text style={styles.chevron}>›</Text> : null}
      </Pressable>
      {downloadUrl ? (
        <DownloadControl targets={[{ url: downloadUrl, filename: entry.name }]} variant="row" />
      ) : null}
      <Pressable
        onPress={() => onActions(entry)}
        hitSlop={8}
        style={styles.more}
        accessibilityRole="button"
        accessibilityLabel={`Actions for ${entry.name}`}>
        <Text style={styles.moreGlyph}>⋯</Text>
      </Pressable>
    </View>
  );
});

type PromptState =
  | { kind: 'new-file'; dir: string }
  | { kind: 'new-dir'; dir: string }
  | { kind: 'rename'; entry: FsEntry }
  | { kind: 'move'; entry: FsEntry };

/** A confirmation the page raises: the delete of an entry, or the discard of a dirty buffer. */
type ConfirmState = {
  title: string;
  hint?: string;
  confirmLabel: string;
  run: () => void;
};

/**
 * `deviceInfo` is the shell's: it carries the server's media ticket, which a download link needs and
 * the bare identity does not hold.
 */
export function SystemFilesScreen({
  deviceInfo,
  onClose,
}: {
  deviceInfo: DeviceInfo | null;
  onClose: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { dark } = useTheme();
  const state = useFsStore();
  /** The reader's zoom, the one the document readers share: it drives the editor's font too. */
  const scale = useDocFontScale();
  useDismissKeyboard();

  const [sheetEntry, setSheetEntry] = useState<FsEntry | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [cursor, setCursor] = useState(1);
  const [sending, setSending] = useState(false);
  const [mediaBase] = useState(() => httpOrigin(prefs.get().serverUrl));
  const { scrollProps, indicator } = useScrollIndicator();

  useEffect(() => {
    fsStore.open();
    return () => fsStore.close();
  }, []);

  const openEntry = useCallback((entry: FsEntry) => {
    if (isDirEntry(entry)) fsStore.navigate(entry.path);
    else fsStore.openFile(entry.path);
  }, []);

  const sendFiles = useCallback(
    async (dir: string) => {
      if (!deviceInfo) {
        fsStore.setNotice('the device identity is not ready yet');
        return;
      }
      try {
        const files = await pickLocalFiles();
        if (!files || files.length === 0) return;
        setSending(true);
        const result = await uploadToFs(mediaBase, deviceInfo, dir, files);
        fsStore.setNotice(`sent ${result.files.length} file${result.files.length === 1 ? '' : 's'} to ${dir}`);
        fsStore.refresh();
      } catch (err) {
        fsStore.setNotice(`send failed: ${messageOf(err)}`);
      } finally {
        setSending(false);
      }
    },
    [deviceInfo, mediaBase],
  );

  // The same road as the row's arrow: the destinations on a phone, straight down in a browser.
  const download = useCallback(
    (entry: FsEntry) => {
      const url = fsDownloadUrl(mediaBase, deviceInfo, entry.path);
      if (!url) {
        fsStore.setNotice('not connected to the server yet: try again in a moment');
        return;
      }
      // A folder goes down as one ZIP named after it: the server writes it as it sends it.
      const filename = isDirEntry(entry) ? `${entry.name}.zip` : entry.name;
      requestDownload({ targets: [{ url, filename }] });
    },
    [deviceInfo, mediaBase],
  );

  const askDelete = useCallback((entry: FsEntry) => {
    const dir = isDirEntry(entry);
    setConfirm({
      title: `Delete ${entry.name}?`,
      hint: dir
        ? 'the folder and everything inside it are removed; there is no trash on the server'
        : 'the file is removed from the machine; there is no trash on the server',
      confirmLabel: dir ? 'Delete folder and contents' : 'Delete file',
      run: () => fsStore.remove(entry.path, dir),
    });
  }, []);

  /** Leaving a dirty buffer always goes through here, a back press included. */
  const leaveEditing = useCallback(() => {
    const snapshot = fsStore.getSnapshot();
    if (snapshot.dirty) {
      setConfirm({
        title: 'Discard your changes?',
        hint: 'the file on the server is not touched',
        confirmLabel: 'Discard changes',
        run: () => fsStore.leaveFile(),
      });
      return;
    }
    fsStore.leaveFile();
  }, []);

  const goBack = useCallback((): boolean => {
    if (sheetEntry) {
      setSheetEntry(null);
      return true;
    }
    if (prompt) {
      setPrompt(null);
      return true;
    }
    if (confirm) {
      setConfirm(null);
      return true;
    }
    const snapshot = fsStore.getSnapshot();
    if (snapshot.mode === 'edit' || snapshot.mode === 'read') {
      leaveEditing();
      return true;
    }
    // Back walks up the tree, one folder at a time, and the machine root is the last place there
    // is to come back *from* -- so that is where the press leaves the page. Leaving from a folder
    // was the bug: the folder you are standing in is not the thing you asked to close.
    if (snapshot.dir !== null && snapshot.dir !== '/') {
      fsStore.navigate(parentOf(snapshot.dir));
      return true;
    }
    onClose();
    return true;
  }, [confirm, leaveEditing, onClose, prompt, sheetEntry]);

  /**
   * The cross: leave, from wherever you are.
   *
   * It is the one control that always closes -- the chevron walks up a folder at a time -- which
   * is why it is the one that carries the guard: an unsaved buffer is not something a tap on a
   * cross may throw away silently.
   */
  const closeExplorer = useCallback(() => {
    const snapshot = fsStore.getSnapshot();
    if (snapshot.mode === 'edit' && snapshot.dirty) {
      setConfirm({
        title: 'Discard your changes?',
        hint: 'the file on the server is not touched',
        confirmLabel: 'Discard changes',
        run: onClose,
      });
      return;
    }
    onClose();
  }, [onClose]);

  useHardwareBack(goBack);

  /**
   * Picking a row acts and closes the sheet in the same gesture. The sheet used to stay up over
   * the notice that said what had just happened -- a download reported behind its own menu
   * (owner, 2026-09-26).
   */
  const fromSheet = useCallback(
    (act: () => void) => () => {
      setSheetEntry(null);
      act();
    },
    [],
  );

  const sheetOptions = useMemo((): SheetEntry[] => {
    const entry = sheetEntry;
    if (!entry) return [];
    const dir = isDirEntry(entry);
    // Grouped, and in the order a hand reaches for them: what the row is, then what it produces,
    // then how it is filed, then the one that destroys it -- last, and alone.
    const options: SheetEntry[] = [
      {
        label: 'Open',
        hint: dir ? 'walk into this folder' : 'read this file',
        onPress: fromSheet(() => openEntry(entry)),
      },
    ];
    if (dir) {
      options.push(
        { type: 'separator', key: 'create' },
        {
          label: 'New file…',
          hint: `created empty in ${entry.name}`,
          onPress: fromSheet(() => setPrompt({ kind: 'new-file', dir: entry.path })),
        },
        {
          label: 'New folder…',
          hint: `created in ${entry.name}`,
          onPress: fromSheet(() => setPrompt({ kind: 'new-dir', dir: entry.path })),
        },
        {
          label: 'Send files here…',
          hint: 'upload from this device into that folder',
          onPress: fromSheet(() => {
            sendFiles(entry.path);
          }),
        },
        {
          label: 'Download as ZIP…',
          hint: 'the whole folder, in one file',
          onPress: fromSheet(() => {
            download(entry);
          }),
        },
      );
    } else {
      options.push(
        {
          label: 'Edit',
          hint: 'binary and oversized files open read-only',
          onPress: fromSheet(() => fsStore.openFile(entry.path, { edit: true })),
        },
        {
          label: 'Download…',
          hint: Platform.OS === 'web' ? 'save it with the browser' : 'choose where it goes on this device',
          onPress: fromSheet(() => {
            download(entry);
          }),
        },
      );
    }
    options.push(
      { type: 'separator', key: 'arrange' },
      { label: 'Rename…', onPress: fromSheet(() => setPrompt({ kind: 'rename', entry })) },
      { label: 'Move…', onPress: fromSheet(() => setPrompt({ kind: 'move', entry })) },
      {
        label: 'Copy path',
        onPress: fromSheet(() => {
          Clipboard.setString(entry.path);
          fsStore.setNotice(`path copied: ${entry.path}`);
        }),
      },
      { type: 'separator', key: 'danger' },
      { label: dir ? 'Delete folder…' : 'Delete…', danger: true, onPress: fromSheet(() => askDelete(entry)) },
    );
    return options;
  }, [askDelete, download, fromSheet, openEntry, sendFiles, sheetEntry]);

  const listing = state.listing;
  const entries = useMemo(() => (listing ? sortEntries(listing.entries) : []), [listing]);
  const crumbs = crumbsOf(listing?.path ?? state.dir ?? '/');
  const file = state.file;
  const canEdit = file !== null && file.text !== null && !file.binary && !file.truncated && !file.error;
  /**
   * Read mode on a markdown file is a reader, not an editor.
   *
   * The language id comes from the editor's own table (`languageForFile`), so the file the
   * reader renders is exactly the one CodeMirror would highlight as markdown -- one list, and
   * no second opinion about what `.md` means. A truncated read stays in the editor: prose drawn
   * from the first window would hide the fact that the file continues.
   */
  const markdownRead =
    state.mode === 'read' && file !== null && file.text !== null && !file.truncated && !file.error && languageForFile(file.path) === 'markdown';
  /**
   * Anything the reader shows as text gets the copy tile: markdown, prose, a script, a config,
   * a table. The bar is "there are bytes to copy and they are readable", not a short list of
   * extensions -- the owner's `.sh` wanted the tile a README already had (2026-10-28).
   */
  const proseRead =
    state.mode === 'read' && file !== null && file.text !== null && !file.binary && !file.error;
  /**
   * The zoom belongs to any file the page draws as text, in read *and* in edit: the pref drives the
   * editor's font size too, so a script opened in CodeMirror grows with it (2026-10-29).
   */
  const inFile = state.mode === 'read' || state.mode === 'edit';
  const zoomable = inFile && file !== null && file.text !== null && !file.binary && !file.error;
  /** What the chevron goes back to. Nothing above the machine root, so nothing to draw there. */
  const parentDir = state.dir !== null && state.dir !== '/' ? parentOf(state.dir) : null;
  const backLabel = inFile ? 'Back to files' : parentDir !== null ? `Up to ${parentDir}` : null;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        {backLabel !== null ? (
          <Pressable
            onPress={goBack}
            hitSlop={8}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel={backLabel}>
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
        ) : null}
        <View style={styles.headerMain}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {inFile ? file?.name ?? 'file' : 'Files'}
            </Text>
            {state.mode === 'edit' && state.dirty ? <Text style={styles.dirty}>modified</Text> : null}
            {state.mode === 'edit' && state.saving ? <Text style={styles.headerSub}>saving…</Text> : null}
          </View>
          <Text style={styles.headerSub} numberOfLines={1}>
            {inFile && file
              ? metaOf(file, cursor, markdownRead)
              : listing
                ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}${listing.truncated ? ' · cut off by the server' : ''}`
                : 'opening…'}
          </Text>
        </View>
        {zoomable ? <DocZoomControl /> : null}
        {proseRead && file ? (
          <CopyButton value={file.text ?? ''} variant="bar" accessibilityLabel="Copy the whole file" />
        ) : null}
        {state.mode === 'read' && canEdit ? (
          <Pressable
            onPress={() => fsStore.beginEdit()}
            style={styles.headerAction}
            accessibilityRole="button"
            accessibilityLabel="Edit file">
            <Text style={styles.headerActionText}>Edit</Text>
          </Pressable>
        ) : null}
        {state.mode === 'edit' ? (
          <Pressable
            onPress={() => fsStore.save()}
            disabled={state.saving}
            style={[styles.headerAction, styles.headerActionPrimary, state.saving && styles.headerActionOff]}
            accessibilityRole="button"
            accessibilityState={{ disabled: state.saving }}
            accessibilityLabel="Save file">
            <Text style={[styles.headerActionText, styles.headerActionTextOn]}>Save</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={closeExplorer}
          hitSlop={8}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Close files">
          <Text style={styles.closeGlyph}>✕</Text>
        </Pressable>
      </View>

      {!inFile ? (
        <View style={styles.breadcrumbRow}>
          {crumbs.map((crumb, index) => (
            <Pressable
              key={crumb.path}
              onPress={() => fsStore.navigate(crumb.path)}
              style={styles.crumb}
              accessibilityRole="button"
              accessibilityLabel={`Go to ${crumb.path}`}>
              <Text style={[styles.crumbText, index === crumbs.length - 1 && styles.crumbCurrent]} numberOfLines={1}>
                {crumb.label}
              </Text>
              {index < crumbs.length - 1 ? <Text style={styles.crumbSep}>/</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {state.notice ? (
        <Pressable onPress={() => fsStore.setNotice(null)} accessibilityRole="button" accessibilityLabel="Dismiss notice">
          <Text style={styles.notice}>{state.notice}</Text>
        </Pressable>
      ) : null}

      {state.error ? (
        <Text style={styles.error} accessibilityLabel={`Files error ${state.error}`}>
          {state.error}
        </Text>
      ) : null}

      {state.mode === 'edit' ? (
        <>
          {state.banner ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{state.banner.text}</Text>
              <View style={styles.bannerActions}>
                <Pressable
                  onPress={() => fsStore.reload()}
                  style={styles.bannerButton}
                  accessibilityRole="button"
                  accessibilityLabel="Reload from disk">
                  <Text style={styles.bannerButtonText}>Reload from disk</Text>
                </Pressable>
                <Pressable
                  onPress={() => fsStore.dismissBanner()}
                  style={styles.bannerButton}
                  accessibilityRole="button"
                  accessibilityLabel="Hide notice">
                  <Text style={styles.bannerButtonText}>Hide</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {state.conflict ? (
            <View style={styles.conflict}>
              <Text style={styles.conflictText}>
                this file changed on the server since you opened it · nothing was overwritten
              </Text>
              <View style={styles.bannerActions}>
                <Pressable
                  onPress={() => fsStore.reload()}
                  style={styles.bannerButton}
                  accessibilityRole="button"
                  accessibilityLabel="Reload from disk">
                  <Text style={styles.bannerButtonText}>Reload from disk</Text>
                </Pressable>
                <Pressable
                  onPress={() => fsStore.overwrite()}
                  style={styles.bannerButton}
                  accessibilityRole="button"
                  accessibilityLabel="Overwrite anyway">
                  <Text style={styles.bannerButtonText}>Overwrite anyway</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </>
      ) : null}

      {!inFile ? (
        <View style={styles.toolbar}>
          {[
            { label: 'New file', run: () => setPrompt({ kind: 'new-file', dir: listing?.path ?? state.dir ?? '/' }) },
            { label: 'New folder', run: () => setPrompt({ kind: 'new-dir', dir: listing?.path ?? state.dir ?? '/' }) },
            { label: sending ? 'sending…' : 'Send files here', run: () => sendFiles(listing?.path ?? state.dir ?? '/') },
            { label: 'Refresh', run: () => fsStore.refresh() },
          ].map(button => (
            <Pressable
              key={button.label}
              onPress={button.run}
              disabled={button.label === 'sending…'}
              style={styles.chip}
              accessibilityRole="button"
              accessibilityLabel={button.label}>
              <Text style={styles.chipText}>{button.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {!inFile ? (
        <View style={styles.listArea}>
          {state.listingLoading && !listing ? (
            <Text style={styles.empty}>asking the server…</Text>
          ) : listing?.error ? (
            <View style={styles.failure}>
              <Text style={styles.empty}>{listing.error}</Text>
              <Pressable
                onPress={() => fsStore.refresh()}
                style={styles.retry}
                accessibilityRole="button"
                accessibilityLabel="Ask again">
                <Text style={styles.retryText}>ask again</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              {...scrollProps}
              style={styles.list}
              data={entries}
              keyExtractor={entry => entry.path}
              contentContainerStyle={entries.length === 0 ? styles.emptyContent : styles.listContent}
              ListEmptyComponent={<Text style={styles.empty}>empty folder</Text>}
              renderItem={({ item }) => (
                <FileRow
                  entry={item}
                  downloadUrl={isDirEntry(item) ? undefined : fsDownloadUrl(mediaBase, deviceInfo, item.path) || undefined}
                  onOpen={openEntry}
                  onActions={setSheetEntry}
                />
              )}
              initialNumToRender={16}
              maxToRenderPerBatch={12}
              updateCellsBatchingPeriod={50}
              windowSize={9}
            />
          )}
          {indicator}
        </View>
      ) : state.fileLoading && !file ? (
        <Text style={styles.empty}>opening…</Text>
      ) : file?.error ? (
        <View style={styles.failure}>
          <Text style={styles.empty}>{file.error}</Text>
          <Pressable
            onPress={() => fsStore.reload()}
            style={styles.retry}
            accessibilityRole="button"
            accessibilityLabel="Ask again">
            <Text style={styles.retryText}>ask again</Text>
          </Pressable>
        </View>
      ) : file?.binary ? (
        <View style={styles.binaryCard}>
          <Text style={styles.binaryTitle}>
            {`binary file (${file.binary.reason === 'nul' ? 'NUL byte' : 'control characters'}) · nothing to edit`}
          </Text>
          <Text style={styles.rowMeta}>
            {`${file.size !== null ? formatBytes(file.size) : 'unknown size'}${
              file.mtimeMs !== null ? ` · ${formatDate(new Date(file.mtimeMs).toISOString())}` : ''
            }`}
          </Text>
          <Text style={styles.rowMeta}>{file.path}</Text>
        </View>
      ) : markdownRead && file ? (
        <ScrollView
          style={styles.readArea}
          contentContainerStyle={styles.readContent}
          keyboardShouldPersistTaps="handled">
          <DocumentMarkdown value={file.text ?? ''} />
        </ScrollView>
      ) : (
        <View style={styles.editorArea}>
          {file?.truncated ? (
            <Text style={styles.truncated}>
              {`showing the first read window only · the file is ${
                file.size !== null ? formatBytes(file.size) : 'larger'
              } on disk`}
            </Text>
          ) : null}
          <CodeEditor
            value={state.mode === 'edit' ? state.draft ?? '' : file?.text ?? ''}
            language={file ? languageForFile(file.path) : null}
            readOnly={state.mode !== 'edit'}
            dark={dark}
            fontSize={Math.round(DEFAULT_EDITOR_FONT_SIZE * scale)}
            onChange={text => fsStore.editText(text)}
            onCursor={line => setCursor(line)}
            onError={err => fsStore.setNotice(`editor: ${messageOf(err)}`)}
          />
        </View>
      )}

      {sheetEntry ? (
        <ActionSheet
          preview={sheetEntry.path}
          options={sheetOptions}
          onClose={() => setSheetEntry(null)}
        />
      ) : null}

      {prompt ? (
        <PromptSheet
          title={
            prompt.kind === 'new-file'
              ? 'New file'
              : prompt.kind === 'new-dir'
                ? 'New folder'
                : prompt.kind === 'rename'
                  ? 'Rename'
                  : 'Move to'
          }
          hint={
            prompt.kind === 'new-file' || prompt.kind === 'new-dir'
              ? `created in ${prompt.dir}`
              : prompt.kind === 'move'
                ? 'absolute path on the server'
                : 'the folder stays where it is'
          }
          initialValue={prompt.kind === 'rename' ? prompt.entry.name : prompt.kind === 'move' ? prompt.entry.path : ''}
          placeholder={prompt.kind === 'rename' ? 'new name' : prompt.kind === 'move' ? '/absolute/path' : 'name'}
          confirmLabel={
            prompt.kind === 'rename' ? 'Rename' : prompt.kind === 'move' ? 'Move' : prompt.kind === 'new-dir' ? 'Create folder' : 'Create'
          }
          onSubmit={value => {
            const name = value.trim();
            if (name === '') return;
            if (prompt.kind === 'new-file') fsStore.createFile(joinPath(prompt.dir, name));
            else if (prompt.kind === 'new-dir') fsStore.createDir(joinPath(prompt.dir, name));
            else if (prompt.kind === 'rename') fsStore.rename(prompt.entry.path, joinPath(parentOf(prompt.entry.path), name));
            else fsStore.move(prompt.entry.path, name);
          }}
          onClose={() => setPrompt(null)}
        />
      ) : null}

      {confirm ? (
        <ActionSheet
          preview={confirm.title}
          options={[
            {
              label: confirm.confirmLabel,
              hint: confirm.hint,
              danger: true,
              onPress: () => {
                setConfirm(null);
                confirm.run();
              },
            },
          ]}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  screen: { flex: 1, minHeight: 0 },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  backGlyph: { fontSize: 26, lineHeight: 28, color: palette.text },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  closeGlyph: { fontSize: 18, lineHeight: 20, color: palette.text },
  headerMain: { flex: 1, gap: 1 },
  titleRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: space.sm },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  dirty: { fontSize: font.micro, color: palette.warn },
  headerSub: { fontSize: font.small, color: palette.textFaint },
  headerAction: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  headerActionPrimary: { backgroundColor: palette.accent },
  headerActionOff: { opacity: 0.6 },
  headerActionText: { fontSize: font.small, color: palette.text, fontWeight: '600' as const },
  headerActionTextOn: { color: palette.accentText },
  breadcrumbRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    paddingTop: space.xs,
    gap: 2,
  },
  crumb: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2 },
  crumbText: { fontSize: font.small, color: palette.accent },
  crumbCurrent: { color: palette.text, fontWeight: '600' as const },
  crumbSep: { fontSize: font.small, color: palette.textFaint },
  toolbar: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.xs,
    paddingTop: space.sm,
  },
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
  },
  chipText: { fontSize: font.micro, color: palette.textMuted },
  listArea: { flex: 1, minHeight: 0 },
  list: {},
  listContent: { paddingTop: space.xs },
  emptyContent: { flexGrow: 1, justifyContent: 'center' as const },
  empty: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.textFaint,
    padding: space.md,
  },
  failure: { alignItems: 'flex-start' as const, gap: space.sm, paddingHorizontal: space.md },
  retry: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  retryText: { fontSize: font.small, color: palette.text },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  rowIcon: {
    width: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rowBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rowBadgeText: { fontSize: font.micro, color: palette.textFaint, fontWeight: '700' as const },
  rowMain: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.md },
  rowText: { flex: 1, gap: 1 },
  more: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  moreGlyph: { fontSize: font.title, color: palette.textMuted, lineHeight: 22 },
  rowName: { fontSize: font.body, color: palette.text },
  rowMeta: { fontSize: font.small, color: palette.textFaint },
  chevron: { fontSize: font.title, color: palette.textFaint },
  notice: {
    marginTop: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    color: palette.textMuted,
    fontSize: font.small,
  },
  error: {
    marginTop: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    color: palette.danger,
    fontSize: font.small,
  },
  banner: {
    marginTop: space.sm,
    padding: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.warn,
    gap: space.xs,
  },
  bannerText: { fontSize: font.small, color: palette.warn },
  bannerActions: { flexDirection: 'row' as const, gap: space.sm },
  bannerButton: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  bannerButtonText: { fontSize: font.small, color: palette.text },
  conflict: {
    marginTop: space.sm,
    padding: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.danger,
    gap: space.xs,
  },
  conflictText: { fontSize: font.small, color: palette.danger },
  binaryCard: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    gap: space.xs,
  },
  binaryTitle: { fontSize: font.meta, color: palette.text },
  editorArea: { flex: 1, minHeight: 0, overflow: 'hidden' as const, paddingTop: space.sm },
  /** The same box as the editor, so switching to `Edit` does not move the text's top edge. */
  readArea: { flex: 1, minHeight: 0, paddingTop: space.sm },
  readContent: { paddingBottom: space.xl },
  truncated: {
    paddingBottom: space.xs,
    fontSize: font.small,
    color: palette.warn,
  },
});
