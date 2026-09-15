# Home screen

The app opens on the home screen when no conversation is selected. The home screen is the same
conversation list used by the side drawer:

- active conversations and unread/draft state;
- conversation search;
- Archive, Agents, Jobs, and Settings live behind the single **More** entry in the footer.

On phone and tablet the **New conversation** action sits at the top of the list (the `+` beside
the MyClaw title). It opens the workspace picker. Selecting a workspace creates a new thread and
returns to the empty composer hero, where the first message can be written.

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
