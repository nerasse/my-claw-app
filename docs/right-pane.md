# The right-hand column

On a wide window the app has three columns: the conversation list, the conversation, and the
column on the right. This is about that third one -- what it holds, when it changes, and what it
keeps.

Source: `src/core/rightPane.ts` (which page), `src/core/panes.ts` (how wide), `src/app/AppShell.tsx`
(the pages themselves), `src/app/DesktopColumns.tsx` (the column and its handle).

## One value, one page

The shell used to hold a boolean per page (`settingsOpen`, `browserOpen`, `jobsOpen`, `filesOpen`,
`statusOpen`, `statsOpen`, `systemFilesOpen`, `instructionsPageOpen`, `archivesOpen`, plus one per
agent roster), draw them in one chain of ternaries, and *also* mount the full-window pages (jobs,
the rosters) at the root of the tree, over everything. Three bugs came out of that shape, all
reported on 2026-10-26:

1. **Two pages at once.** The chain order and the paint order were two different orders: Settings
   opened while Jobs was up painted *under* Jobs, invisible and still clickable behind it.
2. **The browser under the settings page.** Same cause, the other way round.
3. **Nothing kept.** A conversation switch cleared every page, and a reload started from nothing.

So there is one value: `RightPaneState`.

```ts
{ page: PaneKind, window: WindowKind | null, viewer: ViewerState | null, expanded: boolean, settingsPage }
```

- `page` is the column page: `settings`, `files`, `system-files`, `status`, `stats`, `archives`,
  `instructions`, `browser`, or `none`.
- `window` is a page that takes the whole window instead of a column: `jobs`, `agents`,
  `agents-global`. Setting it clears `page`, so the two can never both be drawn.
- `viewer` is the file/picture/film over the column page. One slot, ten kinds: opening a second
  closes the first, and closing it brings the page back with its scroll (`DesktopColumns`).

Opening a page **replaces** whatever the column held -- `rightPane.show(kind)`. That is the whole
invariant, and it is why "no superposition" is a property of the model rather than a rule every
call site has to remember. The module-level setters in `rightPane.ts` (`setSettingsOpen`,
`setJobsOpen`, ...) are thin wrappers so call sites read as they did; a `false` closes only its own
page, so a late unmount cannot close a page somebody opened after it.

They are module functions, not `useCallback`s, on purpose: a closure that captures one never goes
stale, and -- the reason it matters -- `openThread` does not change identity when a page opens.
Adding the store's `window` to `enterThread`'s dependency list did exactly that, re-ran the boot
effect, and closed the page that had just been opened.

### The same trap, twice

The rule was written down after the `window` half and the `page` half was left in place: `enterThread`
still read `filesOpen`, `statusOpen` and `instructionsPageOpen` out of the render, so opening any of
those three rebuilt `openThread`, replayed the boot effect, re-read the address (`/t/<thread>`, the
conversation already on screen) and called `openThread` again -- which, on a phone, is the branch that
closes the column. The page opened and vanished 19 ms later; the desktop survived it only because its
branch re-reads the page for the thread instead of closing it (owner, 2026-11-16: "la page status ne
fonctionne plus sur mobile").

So `enterThread` reads `rightPane.get().page`, never a flag from the render, and its dependency list
holds only the store's setters and the layout. Nothing that a page can change may appear in it. The
regression is held by the phone case of `__tests__/StatusPane.test.tsx`, which stands in for the
browser router: on Android `initialRoute()` is always null, so the replay has nothing to reopen and
the bug cannot show there.

## What survives a conversation switch

`enterThread` is the one door into a conversation, and it decides per page:

| Page | On a wide window | On a phone |
| --- | --- | --- |
| `settings`, `stats`, `archives`, `browser` | stays | cleared |
| `files`, `status`, `instructions` | stays, **re-read for the new thread** | cleared |
| `jobs`, `agents`, `agents-global` | cleared | cleared |

A page about *the install* has no thread in it, so it stays: that is what "quand on switch de
session, ça garde ce qu'il y a à droite" means. A page about *the conversation* cannot stay as it
was -- yesterday's files under another conversation is the one outcome nobody wants -- so the same
page is reopened on the new thread through `openFilesInner` / `statusStore.open` /
`openInstructionsInner`. A page that took the window always goes: it covers the conversation, so a
tap that landed on one must not leave it on top of the other. On a phone everything goes, for the
same reason (a page there covers the conversation and would hide the tap).

## What survives a reload

Written to the device bag (`prefs.rightPane`, `prefs.panes`), never to the server: a phone and a
desk arrange the same conversations differently, and this is the desk's own furniture -- the rule
`collapsedFolders` already follows. Read back once, at boot, **only on a wide window** (`panes.hydrate`
and `rightPane.hydrate` are both behind `layout.pinnedDrawer`).

- `rightPane` holds the page and the settings level (`{"page":"settings","settingsPage":"models"}`),
  and the viewer with its payload. The viewer's URL carries the media ticket, minted in twelve-hour
  buckets with three buckets of headroom (`media-ticket.ts` in the server repo), so a file opened
  before a reload still answers after it.
- `panes` holds both widths and the folded list. A drag fires on every pointer move, so the write
  waits 400 ms for the hand (`PERSIST_MS`) instead of rewriting the bag per pixel.

A value that cannot be read -- absent, not JSON, an unknown `kind` -- opens nothing rather than a
page nobody can leave, and the same for a width that is not a number.

## Settings reopens where it was left

`reopenPage` in `settingsPages.ts`: the settings level lives in the store, so the cross puts the
settings *away* without throwing away where the owner was. A page that held a draft when it closed
(the tag editor, a provider form, a scope editor, the setup) comes back as its parent, because the
draft is gone with it; every other page comes back as itself.

## What is still a layer

Menus, sheets, the model picker, the selection viewer, confirmations: those are `overlayStore` and
the shell's `backCascade`, not this. They sit *over* the column by design, they are what Back closes
first, and they are not addressed -- see `docs/back-cascade.md`.

## Tests

`__tests__/RightPane.test.tsx` pins the three complaints: settings replacing jobs and back, the
browser replacing the settings page, the column surviving a conversation switch (install-wide pages
stay, conversation pages are re-read, a phone keeps nothing), and the reload round trip including
the bounds of a stored width.
