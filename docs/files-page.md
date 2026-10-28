# System files page (app side)

The whole machine my-claw runs on, from the phone: browse, read, edit, create, rename, move,
delete, download, upload, follow. The protocol and the semantics are the server's --
`docs/files-page.md` of the my-claw repository.

## One page, three modes

- **List**: a breadcrumb built from the path the *server* normalised (so it is what was walked,
  not what was typed), rows with name, size and date, directories first. Nothing is hidden:
  `node_modules`, `.git`, `/proc` and `/sys` list like anything else, because a filter the owner
  cannot see the edge of is worse than a long list. `truncated` says when the server cut at
  `FS_LIST_LIMIT`.
- **Read**: CodeMirror, read-only, with the cursor's line in the header — except for a markdown
  file, which is read as a document (`DocumentMarkdown`, the reader the text viewer and the skill
  reader already use).
- **Edit**: the same editor, mutable, with a save button and a conflict banner. Markdown included:
  editing is where the raw text is the point.

An entry opened from a session starts at that session's workspace (`fs.session.root`, resolved
server-side); opened from More it starts wherever the owner last was. The two entries are
distinct on purpose: **Session files** is the conversation's own attachments, **System files** is
the machine.

## Getting back out

Three controls, three meanings, and none of them is a trap:

- **The chevron, top left**: *back*. It walks up one folder at a time, and the label says where to
  (`Up to /home/neras`). Opening a file turns it into `Back to files`, which is the same move --
  a file is one level below the listing you came from. There is nothing above the machine root, so
  at `/` the chevron is not drawn at all rather than drawn doing something else.
- **The hardware back key**: the same walk, through the same function, so the two can never
  disagree. The press that has nowhere to go is the one that leaves the page.
- **The cross, top right**: *leave*, from wherever you are, without walking the tree first. It is
  the one control that always closes, which is why it is the one that carries the guard: a dirty
  buffer gets the discard question, never a silent close.

Leaving from a folder on a back press was the bug the owner reported: the folder you are standing
in is not the thing you asked to close, and getting out meant walking up to the root through the
breadcrumb. The breadcrumb is still the way to *jump* several levels at once; it is no longer the
only way up.

## The editor is one component with two hosts

`src/components/CodeEditor.tsx` is the interface; `CodeEditor.native.tsx` runs CodeMirror 6
inside a `react-native-webview` page built at release time by `scripts/build-codeditor.js`
(`assets/codeditor/index.html`, checked in, copied into the APK by Gradle), and
`CodeEditor.web.tsx` runs the same CodeMirror directly through `@uiw/react-codemirror`.

The wrapper we did **not** use is worth recording: `@actualwave/react-native-codeditor` exists,
is MIT, and bundles CodeMirror 6 for React Native — but it cannot express `readOnly` nor clear
the undo history (its `historyClear` is a no-op since `@codemirror/commands` 6.7 dropped the
effect), and an undo after opening a second file would replay the first file's edits. Its README
also documents two Android IME bugs it had to fix, which is the part that makes the WebView host
worth owning.

**The editor owns no keyboard.** It sits inside the shell's one `KeyboardAvoidingView`
(`docs/keyboard-avoidance.md`), which already gives up exactly the overlap for every page it
holds, so the keyboard reaches the editor as a plain resize of the WebView and the page's `resize`
handler scrolls the caret back into view (`page.ts`). It used to pad itself as well, by the height
measured at `keyboardDidShow` through `revealField.ts`: a second owner of the same inset,
measured against a frame the first owner had not moved yet, so the WebView was resized by the sum
of the two. After that resize it drew nothing until something else forced a repaint, which is the
owner's "full dark when the keyboard opens to place the cursor" and what closed that door.
`adjustResize` is declared in the manifest for Android 14 and below, where the window really does
shrink; above that the app is edge to edge and it is inert.

Reading a markdown file is a reader, not an editor: the same `DocumentMarkdown` renders it, the
header stops claiming a cursor line (there is no caret to number), and `Edit` hands the raw text
back to CodeMirror, highlight and all. Which file that is stays a single decision: the editor's
own `languageForFile` table decides what is markdown, so the reader and the highlighter can never
disagree about `.md`.

## The reader is a frame, and the frame owns the scroll (2026-10-28)

The owner reported that a long document opened on the right, when he scrolled, took the whole
interface with it: the text ran past the bottom of the window and the conversation list and the
composer were gone. Two things were wrong, and both are now structural rather than a `maxHeight`
on one screen:

1. **CodeMirror never filled its box.** `.cm-editor` kept its natural content height (a 6 000 px
div inside an 800 px pane: the WebView host fills its parent, the web host did not), so the text
escaped the pane downwards and grew the page. The web host now states `height: 100%` and gives
`.cm-scroller` its own `overflow: auto` -- the reader scrolls, the box does not move.
2. **Nothing clipped.** `html` and `body` scrolled, so an overflowing document became an
overflowing *page*, and one wheel past the end of a file carried the interface up. `web/index.html`
now sets `overflow: hidden` on `html`/`body` and `#root`, and the chain from the shell down to
`ViewerStage` carries `minHeight: 0` with `overflow: hidden` on the panes (`AppShell`,
`DesktopColumns`, `ViewerChrome`, `TextViewer`, `CsvTable`). A list or a document that outgrows
its pane scrolls *inside* it, whatever it holds.

The rule the next viewer inherits: **a pane is a frame; a viewer's root is `flex: 1` + `minHeight: 0`
+ `overflow: hidden`, and the scrolling lives in one child of it.** Checked the same way for the
text reader (markdown, text, CSV, code), the image, video, SVG, PDF, HTML and archive viewers.

## One tap for the whole document

Markdown and plain text -- the two readers that show prose -- carry a copy tile in their top bar,
next to the zoom and the download (`CopyButton variant="bar"`); the same tile sits in this page's
header in read mode. A code file does not get one: its selection is the way out, and the tile would
sit over its own scroll bar. Copying takes the whole text as read from the server, not what the
renderer made of it, and acknowledges on the tile itself because the clipboard is invisible
(`docs/text-selection.md`).

## What the store refuses to do

`src/core/fsStore.ts` holds one directory and one open file, and it is where the honesty of the
page lives:

1. An answer for a path the owner has left is **dropped**, never drawn under the new one.
2. The read's `etag`, `encoding` and `eol` travel back with the save. A latin1 file rewritten as
   UTF-8 corrupts every accent, and CodeMirror hands back `\n` for a file that was CRLF -- the
   server is what puts the file back the way it was, and it can only do that if it is told.
3. A conflict (the agent edited the file between the read and the save) is never a silent
   overwrite: the page offers **reload** or **overwrite anyway**.
4. A file changed under the reader is followed (append from `nextFrom` when it only grew,
   reload otherwise); under the **editor** it raises a banner and touches nothing. Reloading a
   file somebody is typing in deletes the work.
5. Our own write raises no banner: the `fs.changed` it causes is recognised by its etag.
6. A binary file shows its metadata and offers no editing.
