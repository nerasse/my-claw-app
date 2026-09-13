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
2. **Sub-agent confirmations**, then the sub-agent menu, then the hand-back sheet.
3. **Absolute pages**: the agents roster (thread and global), the status page, the instructions
   page (its editor first), the delete confirmation of a job, then the jobs page (its editor, then
   its runs page, then the list).
4. **Viewers**: image, text, video, file.
5. **Queued approvals**: one press dismisses one request.
6. **Confirmations and sheets** named in the list: delete a file, delete a conversation, the
   workspace picker, the discard question of a dirty tag editor, rename a conversation, the model
   sheet (which walks its own picker flow before it closes), tune, the tag and provider prompts.
7. **Menus**: the command menu, More, a message or conversation menu.
8. **The drawer**, unless it is pinned -- pinned it is a column of the layout, not a layer, and
   closing it would eat the press and change nothing on screen.
9. **Skill sheets and the skill reader.**
10. **The settings stack**, one page at a time: a picker group, then the picker, then the page,
    then the index, then settings itself. A habit press from a subpage can never fall through to
    the launcher.
11. **Screens over the conversation**: archives, browser, statistics, files.
12. **Where a conversation was reached from**: a sub-agent chat hands back to its parent, a thread
    opened from the archive returns to the archive, a run opened from a job's runs page returns
    there.
13. **The conversation itself**, on a phone: back goes home, not out of the app.
14. Nothing left: `false`, and the platform does its thing.

`__tests__/BackCascade.test.tsx` pins the rungs a press can actually walk in one sitting (menu over
drawer over conversation over exit, and a screen over the conversation it covers). The settings
stack, the pickers, the viewers and the files screen are pinned by their own suites.

## Every layer is named, or it is not a layer

A sheet the list does not name is invisible to a back press: the press reaches through it and
closes what is underneath, so the question stays on screen over a shell that moved, and the next
press aimed at the question hits whatever was under that. Six surfaces were in that state; five
are layers and are now named, one was never a layer at all.

| Surface | Where it sits | Pinned by |
|---|---|---|
| Delete a conversation | over the drawer or the menu that asked | `BackCascade.test.tsx` |
| Workspace picker | over the drawer or the conversation | `BackCascade.test.tsx` |
| Delete a job | over the jobs editor | `Jobs.test.tsx` |
| Discard a dirty tag route | over the tag editor | `Tags.test.tsx` |
| Hand an answer back | over a sub-agent chat | `SubAgents.test.tsx` |
| Skills transfer notice | a line on the skills page | `Skills.test.tsx` |

The transfer notice is the odd one: it is a `Text` on the page, with no backdrop, that swallows
nothing. Giving it a press of its own would be a press that appears to do nothing, which is the
reason the pinned drawer is not a layer either. What it did wrong was different: the screen's own
back arrow cleared it and the hardware key did not, so the line came back stale the next time the
page opened. The cascade now drops it on the way out of the page, in the same press.

The jobs confirmation needed a second half. `JobsEditorScreen` registers a back handler of its own
and answered every press, so it closed the editor under the question. It now declines that one
case (`deleting`), and the press falls through to the shell. Declining matters: the shell's handler
is usually the last registered and therefore the first asked, but the editor's is rebuilt on every
render of the shell (its `onBack` is an inline arrow) while the shell's is rebuilt only when the
cascade's dependencies move. One unrelated render between opening the question and pressing back is
enough to reverse the order. The test in `Jobs.test.tsx` forces that render, or it would pass
without the fix.

## The app-update dialog is deliberately not a layer

It is the owner's decision to take, not the back key's, so it stays out of the cascade. The
residual behaviour, measured rather than assumed (`appUpdatePhase: available`, phone layout):

- the dialog does **not** take the press;
- the press closes whatever the cascade finds underneath instead. On a conversation it leaves the
  conversation and lands on home, with the dialog still drawn over the home screen;
- on home, with nothing left to close, the press returns `false` and Android leaves the app, the
  dialog still up.

So the dialog cannot be dismissed with the back key, and a press aimed at it moves the shell behind
it. That is a known and accepted remainder, not an oversight.

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

## What the characterisation found

Written before the extraction, against the behaviour as it stood. Both of its findings have since
been acted on, and both are worth keeping in writing:

- **A sheet the cascade does not name is invisible to a back press.** Six of them were, and are
  handled above. The app-update dialog still is, on purpose.
- **The last condition carried four checks that could never be false there.** The phone
  "back goes home" branch tested `!settingsOpen && !archivesOpen && !filesOpen &&
  !subagentRef.current`, and each of those four states returns earlier in the cascade whenever it
  is set. They are gone. What proves the removal neutral is that all four legs are pinned with the
  hardware key: settings (`SettingsStack.test.tsx`), the archive (`BackCascade.test.tsx`), the
  files screen (`Files.test.tsx`) and a sub-agent chat (`SubAgents.test.tsx`). Moving the branch
  above them takes 23 tests down across 10 suites.

Some orders in the list cannot be observed from the UI at all, because the two layers never
coexist: opening the rename sheet from a conversation menu closes that menu on the way, so the
`threadToRename` block sitting above the menu block is a precaution rather than a rule anybody can
see. Left as it is.

One more came out of naming the six surfaces: a conversation menu closes itself before it opens
the question it asked (delete, change workspace), so the sheet is alone on screen with the drawer
behind it. That is why each of those tests asserts the drawer is **still** there afterwards: it is
the layer the press used to eat, and the only witness that nothing under the question moved.
