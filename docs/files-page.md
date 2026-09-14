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
- **Read**: CodeMirror, read-only, with the cursor's line in the header.
- **Edit**: the same editor, mutable, with a save button and a conflict banner.

An entry opened from a session starts at that session's workspace (`fs.session.root`, resolved
server-side); opened from More it starts wherever the owner last was. The two entries are
distinct on purpose: **Session files** is the conversation's own attachments, **System files** is
the machine.

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
worth owning. `docs/keyboard-avoidance.md` is unchanged: the host lifts itself by the height
measured at `keyboardDidShow` and CodeMirror keeps the caret in view; `adjustResize` stays out of
the manifest, where it is inert.

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
