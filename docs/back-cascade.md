# The back cascade

What a back press closes, in which order, and where that decision lives.

`src/app/backCascade.ts` (`closeTopLayer`) holds it. `AppShell` keeps the `useCallback`
(`handleBack`) that takes the snapshot and hands it over, and three inputs read that one callback:
Android's back key (`useHardwareBack`), the browser's Back button (`watchBack`) and Escape
(`useHotkeys`). They all mean the same thing, so they share the same answer. `false` is "nothing
left to close": the only thing that lets Android leave the app or the browser leave the page.

## The order is the behaviour

The cascade is a flat list of `if`s, innermost layer first, and a swap of two blocks is a change of
what the back key does. In groups, top to bottom:

1. **The selection viewer.** It covers everything, including whatever opened it.
2. **Sub-agent confirmations**, then the sub-agent menu.
3. **Absolute pages**: the agents roster (thread and global), the status page, the instructions
   page (its editor first), the jobs page (its editor, then its runs page, then the list).
4. **Viewers**: image, text, video, file.
5. **Queued approvals**: one press dismisses one request.
6. **Confirmations and sheets** named in the list: delete a file, rename a conversation, the model
   sheet (which walks its own picker flow before it closes), tune, the tag and provider prompts.
7. **Menus**: the command menu, More, a message or conversation menu.
8. **The drawer**, unless it is pinned -- pinned it is a column of the layout, not a layer, and
   closing it would eat the press and change nothing on screen.
9. **Skill sheets and the skill reader.**
10. **The settings stack**, one page at a time: a picker group, then the picker, then the page,
    then the index, then settings itself. A habit press from a subpage can never fall through to
    the launcher.
11. **Screens over the conversation**: archives, browser, files.
12. **Where a conversation was reached from**: a sub-agent chat hands back to its parent, a thread
    opened from the archive returns to the archive, a run opened from a job's runs page returns
    there.
13. **The conversation itself**, on a phone: back goes home, not out of the app.
14. Nothing left: `false`, and the platform does its thing.

`__tests__/BackCascade.test.tsx` pins the rungs a press can actually walk in one sitting (menu over
drawer over conversation over exit, and a screen over the conversation it covers). The settings
stack, the pickers, the viewers and the files screen are pinned by their own suites.

## Why it is a function and not a method of the shell

It was 314 lines in the middle of a 4700-line component, and it reads state and calls setters --
nothing else. As a function of a snapshot it can be read whole (which is the only way to check an
order), and the shell keeps what only the shell can own: **when** that snapshot is taken. The
dependency list of `handleBack` is unchanged by the move, deliberately: it decides the identity of
the callback, which decides when the back handler is re-registered and when the browser's Back
listener is rebuilt.

Two of the fields exist for that reason. The cascade is handed `approvalCount` and `pinnedDrawer`
rather than the approvals array and the layout object, because the dependency list keys on
`approvals.length` and `layout.pinnedDrawer` and always has: passing the objects would make every
unrelated change of either one a new callback and a new registration. The single write to the
queue is a functional update, so it never reads a stale one.

The parameter type says what may happen here:

- a layer the cascade only has to *find* is `unknown`. What it holds belongs to the screen that
  draws it;
- a closer takes `null` or `false`, never a value. Nothing in this file can open anything, and the
  compiler is what says so.

## What the characterisation found, and did not fix

Written before the extraction, against the behaviour as it stood. Two of its observations are
worth knowing:

- **A sheet the cascade does not name is invisible to a back press.** `workspacePicker`,
  `confirmDelete`, `jobToDelete`, `handoff`, `tagEditorDiscard`, `skillsNotice` and the app-update
  dialog are rendered as overlays but appear nowhere in the list. A press aimed at one of them
  reaches through it and closes what is underneath: the drawer goes, the sheet stays, over a shell
  that moved. The third test in the suite pins this as it is, so the extraction could not change
  it by accident. It is not an endorsement.
- **The last condition carries four checks that can never be false there.** The phone
  "back goes home" branch tests `!settingsOpen && !archivesOpen && !filesOpen &&
  !subagentRef.current`, and each of those four states returns earlier in the cascade whenever it
  is set. The branch reads as if they were reachable; they are not.

Some orders in the list cannot be observed from the UI at all, because the two layers never
coexist: opening the rename sheet from a conversation menu closes that menu on the way, so the
`threadToRename` block sitting above the menu block is a precaution rather than a rule anybody can
see. Left as it is.
