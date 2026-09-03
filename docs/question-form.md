# The question form

The `question` tool asks the owner and blocks the run. The wire side is in the server repo
(`docs/my-claw-app-channel.md`, "Ask questions"); this is the shape it takes on screen.

**One question per page, inside the conversation, then a recap that is the only place Send lives.**

```
┌ Question 2 of 4 ─────────────── waiting for you ┐
│ FENETRES                                        │
│ Combien ? (select all that apply)               │
│  ( ) 1        ( ) 2        ( ) Type your own    │
│ ‹ Back                              Next ›      │
└─────────────────────────────────────────────────┘
                     ...
┌ Review ──────────────────────── waiting for you ┐
│ LANGUE                                    edit  │
│ fr                                              │
│ FENETRES                                  edit  │
│ 1, 2                                            │
│ ‹ Back            2/4 answered         [ Send ] │
└─────────────────────────────────────────────────┘
```

## Why a stepper again

This is the third shape, and the second stepper. Worth knowing before changing it back:

1. **A modal sheet with a stepper.** The paging was forced: a sheet is narrow. The sheet itself
   was the bug -- a question took the whole app hostage, and a question is precisely a reason to
   go and read something first (the thread above, a file, another conversation).
2. **A flat form in the conversation.** Fixed the modal by drawing the form on the tool card where
   the run stopped. But it fixed only the modal: six questions at once are a wall in the middle of
   a conversation, and the batch went out without ever being seen as a whole.
3. **A stepper in the conversation.** Both, kept. The thread stays readable underneath, and one
   question is on screen at a time.

## The rules

- **A lone question skips the pager and the recap.** It is the page, and it sends. A review page
  for one answer sitting a tap above the button is ceremony.
- **Send is on the recap and nowhere else** (`isRecapPage`). Nothing goes out unseen.
- **Send is never blocked.** A question walked past is sent as an empty array: unanswered is an
  answer, and the recap says `unanswered` for it in as many words.
- **A single-choice pick advances on its own**, 250 ms later (`AUTO_NEXT_MS`) -- long enough to see
  the pick land. Multiple choice never does: the answer is still being built after the first tick.
  One pending hop at a time, cleared on unmount and by any manual move, so two quick picks never
  stack two pages.
- **The recap cuts an answer to three lines** (`RECAP_LINES`); tapping it opens it in place, the
  pencil goes back to the question. A pasted paragraph is a legitimate answer and it must not bury
  the five questions around it.
- **The page lives in the draft** (`QuestionDraft.page`, in `questionStore`), not in the component.
  The list unmounts a row that scrolls off, and going away to check something is the whole point of
  asking in the chat: a page held in the card sends the owner back to question 1 every time he
  looks away. Which recap lines are open is *not* in the draft -- that is reading state, worth
  nothing once the card is gone.
- **Leaving a question closes its free-text field and keeps the text** (`draftGoto`): coming back
  to a page whose keyboard pops open by itself is how you lose sight of what you are answering.
- **The page is clamped on read** (`draftPage`). `question.pending` replays an ask and drafts
  survive it, so a shorter ask must not leave the form pointing past its own end.

## Keyboard, web only

Bare `←` / `→` walk the pages (`questionKeys.web.ts`, a no-op on Android). Three refusals, each
pinned by a test, because the failure is silent:

- **a caret in a field wins** (`input`, `textarea`, `select`, `contenteditable`) -- including the
  composer underneath the card and the form's own free-text answer;
- **any modifier** is someone else's shortcut (Alt+Left is Back, Shift+Left is a selection);
- **an IME mid-word** is picking a candidate with those arrows.

The listener is bound on `window` in the **capture** phase: react-native-web's `TextInput` calls
`stopPropagation()` on key events, so a bubble-phase listener never fires while a field has focus.
One card owns the arrows at a time (the oldest mounted, module-level claim): the card is drawn from
two places -- inside its tool row, and loose above the list when its row never arrived -- and
neither knows about the other.

No swipe. A horizontal gesture inside a vertically scrolling conversation is a fight over the
first few pixels of every drag, and the buttons are one tap.
