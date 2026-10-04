# The keyboard

Everything the web app does can be done without a mouse. The phone build has no keyboard to speak
of: the walking below is web only (`keyNav.web.ts`), the cross is everywhere.

## Walking menus and pages

One listener for the whole app (`src/core/keyNav.web.ts`, installed by the shell), not a hook per
list: every menu is already a column of buttons in DOM order, so a screen declares only what kind
of layer it is, with `keyLayerProps(kind)` on its root:

| layer | where | keys |
|---|---|---|
| `menu` | ActionSheet, the anchored menus, PromptSheet, the update dialog | ↑ ↓ wrap around, Home/End, Tab stays inside, a letter jumps to the row it starts. Opened from the keyboard it takes the focus (its search field, else the option in effect, else the first row) and gives it back to what opened it when it closes. |
| `page` | the page pane, the jobs, roster and skill layers | ↑ ↓ (no wrap), Home/End, ← → along a row (a header, a grid of tiles). With nothing focused, the first arrow enters the topmost page. |
| `list` | the conversation list | as a page |
| `off` | the live browser picture | nothing: it types into the web page |

Enter and Space press the focused button (react-native-web's Pressable). A one-line field lets
ArrowDown go to the list under it (the model search); a multi-line one keeps its arrows. The
listener is in the capture phase: react-native-web's TextInput stops every key event it sees.

Focus is drawn by `:focus-visible` (keyboard only, `webTheme.web.ts`); a menu row is tinted
instead, because its scroller clips an outline drawn outside it.

The settings index has a search field on top: the arrows reach it like any row, typing lists what
matches (`docs/settings.md`), and Enter opens the first result.

## Shortcuts

One table, `src/core/shortcuts.ts`: the shell binds it, the `?` sheet lists it (each row runs its
action), and the menus print the key beside their entries.

| keys | action |
|---|---|
| ⇧N, Ctrl N | new conversation |
| ⇧S, Ctrl K | search conversations |
| / | write a message |
| ⇧M | model |
| ⇧A | session files (Attachments) |
| ⇧F | files: the machine |
| ⇧B | browser |
| ⇧J | jobs |
| Ctrl / | commands |
| Ctrl , | settings |
| Ctrl B | fold the conversation list |
| ⇧Esc | close everything, back to the conversation |
| ? | this list |
| Esc | leave the field, then back one level |

A Shift letter, `/` and `?` act only outside a text field, where they would otherwise type: Escape
leaves the field first (Gmail, GitHub and Linear work the same way). They do nothing while a menu
is open or during the first-run setup. Escape is never "open": it closes, everywhere.

Chrome keeps Ctrl+N for a new window and never hands it to a page: ⇧N is the one that works in a tab.

## The cross

Back walks a stack one level at a time; the cross at the end of a page header leaves the whole
stack in one press (`CloseButton`, fed by `PageCloseContext`):

- every settings page but the index, whose Back already lands on the conversation, closes settings;
- the jobs pages have their own provider, so a job's cross never closes a settings page under it;
- none during the first-run setup;
- a tag editor with changes asks first, as its own Back does.

## Tests

`src/core/__tests__/keyNavMath.test.ts` (the arithmetic), `shortcuts.test.ts` (the table),
`__tests__/PageClose.test.tsx` (the cross). The DOM half has no jsdom here: `e2e/keyboard.mjs`
drives a real Chromium with the keyboard alone against the server's compose test instance, and
fails at the first step that does not land where it should.
