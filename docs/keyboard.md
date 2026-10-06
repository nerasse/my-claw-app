# The keyboard

Everything the web app does can be done without a mouse, and on Android with a physical keyboard
(Bluetooth, DeX) since v0.6.139: same shortcuts, same Escape, menus walked the same way. The DOM half
below is the web's (`keyNav.web.ts`); Android's is at the end of this page. The cross is everywhere.

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

## Android with a physical keyboard

React Native hands a page no key events, so the keys are caught in the activity
(`MainActivity.dispatchKeyEvent` → `HardwareKeys.kt`) before the views see them:

- **Shortcuts.** `useHotkeys` (`hotkeys.ts`) registers the combos the shell binds with the activity
  (`setHotkeys`), each time they change. The activity has to decide on the spot whether a key is
  taken, so it takes exactly those, spelled like the web's (`KeyboardEvent.key`: Shift+/ is `?` on
  QWERTY, the layout decides), sends them back as `claw:hotkey`, and takes their key-up too (Escape's
  up would otherwise go back a second time). Same rule as the web: in a text field only Ctrl combos
  and Escape are taken. The soft keyboard is never a shortcut source (its device is virtual).
- **Escape** is the shell's `escape`: leave the field (`TextInput.State`), else back one level,
  through the same cascade as Android's back key (`closeTopLayer`). At the root it does nothing; it
  never closes the app the way back does.
- **Walking** is Android's own focus: the arrows go to the nearest focusable view, Tab to the next,
  Enter presses (a Pressable is focusable and clickable), and Android draws its own focus highlight
  outside touch mode. A menu (`ActionSheet`) adds the web's `menu` layer on top (`menuFocus.ts`):
  opened from the keyboard it takes the focus (`focusIfKeyboard`: its search field, else the option
  in effect, else the first row) and gives it back to what opened it when it closes; the arrows and
  Tab go round its ends (`nextFocusUp`/`Down`/`Forward`), left and right stay on the row, and the
  backdrop is a tap's way out, not a keyboard stop. Opened by a tap, Android is in touch mode and
  nothing moves.
- `/` puts the caret in the composer: Android has no DOM to find it by label, so the composer
  registers itself (`keyField`).
- ⇧S on the phone's home screen focuses the home list's own search: the slide-over drawer is a
  second mount of the same list, and it used to open on top of the home list and take the focus
  into a field nobody could see. Only the mount on screen answers `focusSearch` (`Drawer`), and the
  home screen opens nothing over itself (`openSessions`). The web had the same bug at phone width.

Tested on an emulator (API 35) with its kernel keyboard (`sendevent` on the AT keyboard device: what
a Bluetooth keyboard looks like to Android, unlike `adb input`, whose events come from a virtual
device and are rightly ignored).

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

Android: `src/core/__tests__/hotkeysNative.test.tsx` (the registration and the round trip),
`__tests__/ActionSheet.test.tsx` (the menu's focus and its ends), `__tests__/BackCascade.test.tsx`
(what Escape and back close).
