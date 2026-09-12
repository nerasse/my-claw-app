# Tool call preview (collapsed card)

What a `ToolCard` says about a call before anybody taps it, and where each piece of that line is
allowed to be cut. `src/core/toolSummary.ts` decides what to say, `src/core/utils.ts`
(`summarizeArgs`, `PREVIEW_GUARD`) is the fallback for a tool nothing knows about, and
`src/components/ToolCard.tsx` lays it out.

## The rule: the unit of truncation is the visual line

A preview is never cut by a character count. It is handed over whole and `numberOfLines` cuts it
at the width it is actually drawn in. codex and pi both truncate this way, and `e06ce04` is where
this repo followed them.

A character count cannot know the width it will be drawn in: that depends on the font scale, the
screen, and on the tool name, the failed badge and the duration sharing the row. The preview used
to stop at 72 characters, which was invisible while the chat drew at its design size (the layout
always clipped first) and became a dead ellipsis in the middle of a blank row as soon as the chat
font scale shrank the text and more characters fitted.

`PREVIEW_GUARD = 512` is **not** that cut. It is a guard against measuring a whole file: a tool
called with a 50 kB first argument would otherwise be flattened and laid out in full on every
render. It is far past what any row can show, so it is never the visible end of a preview.

## The count of hidden arguments is laid out, not appended

A tool this module has a table entry for names the one argument that identifies the call, and
everything else is folded on purpose -- there is nothing to count. A tool it knows nothing about
(an MCP server's, a plugin's) falls back to the first argument serialized, and then `+3` is the
only thing on screen saying the call carried three more.

That count is a number on `ToolSummary` (`extraArgs`) and its own `<Text>` in the row. It is not a
suffix on `detail`, and it may not become one again:

- the preview is the row's only `flex: 1` child with `numberOfLines={1}`, so the pixel clip lands
  on it and on nothing else. A sibling is measured at its natural width first, which is what keeps
  the count on screen however long the preview is. At the tail of the clipped string, the denser
  the call the surer the count was the first thing dropped;
- `summarizeArgs` appended the suffix **past** `PREVIEW_GUARD`, so the string it returned could be
  longer than the guard and `clamp()` in `summarizeTool` cut it straight back off. The shortest
  path to losing the count was a call whose first argument was long, which is exactly the call
  that has something to hide.

The alternative -- reserving characters for the suffix inside the preview's budget -- was refused:
it is the character-count reasoning the rule above already threw out, and the budget it would
subtract from is measured in pixels nobody knows at summarize time.

Guards: `keeps the count of what it hides out of the string that gets cut`
(`src/core/__tests__/toolSummary.test.ts`) and `keeps the count of the hidden arguments out of the
line the layout clips` (`src/components/__tests__/toolCard.test.tsx`).

## Where a preview is drawn

- Head row, beside the tool name: everything but a shell command. A path is short, and a column of
  cards stays scannable only while the rows keep a constant height.
- Under the head, wrapped, `numberOfLines={3}`: shell commands only (`ToolSummary.block`). The
  densest argument drawn here, the one where a cut costs real understanding. Three lines like
  codex, not five like pi: on a phone a dozen calls at five lines is the wall the collapsed card
  exists to avoid.
- The ARGUMENTS fold of an open card repeats the same line, count included, for the same reason.

The number of hidden **lines** of a block preview is deliberately absent: Android measures a
clamped `Text` through a layout built with `maxNumberOfLines`, so `onTextLayout` reports the lines
that survived, never the ones that did not. Reporting it means measuring every card twice.
