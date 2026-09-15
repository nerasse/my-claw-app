# Home screen

The app opens on the home screen when no conversation is selected. The home screen is the same
conversation list used by the side drawer:

- active conversations and unread/draft state;
- conversation search;
- Archive, Agents, Jobs, and Settings live behind the single **More** entry in the footer.

On phone and tablet the **New conversation** action sits at the top of the list (the `+` beside
the MyClaw title). It opens the workspace picker. Selecting a workspace creates a new thread and
returns to the empty composer hero, where the first message can be written.

## Folders are sections

The list is cut into one section per folder, in the server's rank order, and the conversations in
no folder come **last** -- the cabinet reads top to bottom, and the things nobody filed are the
tail. A header carries the count of what is under it; while a search narrows the list it says what
it is narrowing, `3 / 9`, because a heading that says "three" while seven conversations are hidden
is making a claim it cannot back.

Tapping a folder folds it. Folded is not hidden: the header stays with its count, which is the
whole reason to fold one. The fold lives in the shell, next to the workspace filter and for the same
reason -- three mounts, one list -- and is remembered nowhere, like the filter.

What is drawn follows from what the filter left:

- a folder holding a visible conversation is drawn, with it;
- an empty folder is drawn as long as nothing is filtered: a folder the owner just made has to be
  somewhere he can see and file into;
- under a workspace filter, an empty folder is drawn only if it was born in that workspace: the one
  case where he expects to find it, and the only thing left to prove it exists;
- a conversation naming a folder the listing does not carry lands in the unfiled section, which is
  the only honest place for it and keeps a stale folder list from swallowing rows.

The unfiled section is always drawn, empty included, and it is the only one that cannot be folded --
folding everything away would leave a drawer with nothing to tap. It is named `No folder` only once
there are folders to be told apart from: a list with none is the drawer as it has always read, and
naming that section would answer a question nobody asked.

One list, not a `SectionList`: the drawer's tuning, its separators and its scroll are built around a
flat data array, so the sections are flattened into it and a folded folder is a header with no rows
behind it.

Every folder header carries what its conversations are asking of the owner, counted from the rows
under it: `?2` when two are blocked on a question, the accent dot and a count when two have moved.
A question wins when both are true -- one of the two is waiting on a person -- and only one of them
is ever shown. A run in flight counts as activity as well: a folder is exactly what hides a run,
and the badge is the only sign left once it is folded, which it survives (the rows go, the count
stays). The unfiled section carries none: it is a remainder, not a place something was filed into.

The counts come from the rows the section is drawn with, so a folder reflects what its contents say
on screen and nothing else, and they are computed once per list rather than per row: this list
re-renders on every token of a streaming run, which is the one cost it cannot pay.

## Making a folder, and filing into one

The drawer header carries two ways in, side by side: **New conversation** (the accent) and **New
folder**. A folder is named in a sheet and created by the server; when the list is filtered to a
workspace, the folder is born in that workspace, which is both where the owner is looking and what
keeps an empty folder visible under that filter. Nothing else is asked: a folder has a name and
that is all.

A conversation is filed from its own menu, **Move to folder…**, which says where it sits today and
offers every folder plus **No folder** -- the one row that takes it out of all of them. The row
moves in the list as soon as the tap lands, before the server's listing comes back: waiting for the
round trip reads as a tap that did nothing. The listing then confirms, as it does for every other
session edit.

Rename and **Delete folder** sit behind the `⋯` on the folder's own header, the same control a
conversation row carries. Deleting asks first, and the question says what it leaves behind: a
folder holds nothing, so its conversations are unfiled and none of them is deleted. The server
unfiles them, and the drawer follows the listing like it does for everything else.

Three things are deliberately absent. Nothing drags, because the server's rank order is already the
order folders are shown in and a drag would need a rank field written on every drop. Nothing nests,
because a folder in a folder is a tree to walk and to keep consistent. And a folder does not carry a
status of its own -- its badge is derived from its conversations, which is step six.

## Filtering by workspace

The funnel beside the search field narrows the list to one workspace, and **masks every other one**
-- the rows, their counts, and nothing else. The sheet offers the workspaces the listing actually
has conversations in, most recently used first, each with how many it holds: a workspace the owner
declared and never used has nothing to filter, and the counts are what say which one is worth
narrowing to before narrowing to it. Past eight of them the sheet grows a search row, because a
filter that holds a hundred entries is one you look things up in, not one you read.

An active filter leaves a removable chip under the search field. A mask with no trace on screen is
a list that has lost conversations for no reason the owner can see -- and a filter the owner cannot
find is a filter he cannot undo.

The value lives in the shell, not in the panel that reads it: the drawer, the pinned column and the
home list are three mounts of one listing, and a filter each of them kept to itself would be three
listings. Persisted nowhere, like the search: it is a lens on the list, not a setting.

## Navigation

On phone and tablet layouts:

- boot with no deep link → home;
- selecting a conversation → chat;
- pressing Back from chat → home;
- pressing Back from home → the platform handles the exit;
- opening the side drawer keeps the same list and actions.

On desktop layouts, the conversation list is a permanent left column. The column uses the same
header (`MyClaw` title and `+` action), so there is no duplicate home page in the main pane: with
no conversation selected the main pane stays empty, and the owner picks from the column.

The `MyClaw` title is the home action in every drawer shape. It is safe to press while already on
home and does not create a new conversation.

## Boot

The app boots on the home screen rather than reopening the last conversation. A deep link (`/t/<id>`
on web, `myclaw://thread/<id>` from a notification tap on Android) is the only thing that addresses
a conversation at boot. `lastThreadId` is kept as a trace of where the owner was but is never read
back at boot.

## Rendering contract

The home is represented by `activeThread === null`. A newly created thread has an id but no
messages, so it still renders the existing empty composer hero. These are separate states:

- `null` means no conversation is selected and renders the session list;
- a thread id with no messages means a new conversation and renders the composer;
- a thread id with messages renders the conversation.

The server remains authoritative for sessions, pins, unread state, drafts, and ordering. The home
only changes where the existing session list is rendered; it does not introduce a second session
store or protocol.
