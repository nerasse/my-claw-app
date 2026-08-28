# Home screen

The app opens on the home screen when no conversation is selected. The home screen is the same
conversation list used by the side drawer:

- pinned conversations, including drag and drop reordering;
- active conversations and unread/draft state;
- conversation search;
- Archived, Agents, Jobs, and Settings in the footer.

The **New conversation** action is a full-width button at the top of the list. It opens the
workspace picker. Selecting a workspace creates a new thread and returns to the empty composer
hero, where the first message can be written.

## Navigation

On phone and tablet layouts:

- boot with no stored conversation → home;
- selecting a conversation → chat;
- pressing Back from chat → home;
- pressing Back from home → the platform handles the exit;
- opening the side drawer keeps the same list and actions.

On desktop layouts, the conversation list is a permanent left column. The column uses the same
home header and actions, so there is no duplicate home page in the main pane. The column is 360pt
wide, which gives session titles, workspace labels, and row actions enough room without changing
the chat pane's behavior.

The `MyClaw` title is the home action in every drawer shape. It is safe to press while already on
home and does not create a new conversation.

## Rendering contract

The home is represented by `activeThread === null`. A newly created thread has an id but no
messages, so it still renders the existing empty composer hero. These are separate states:

- `null` means no conversation is selected and renders the session list;
- a thread id with no messages means a new conversation and renders the composer;
- a thread id with messages renders the conversation.

The server remains authoritative for sessions, pins, unread state, drafts, and ordering. The home
only changes where the existing session list is rendered; it does not introduce a second session
store or protocol.
