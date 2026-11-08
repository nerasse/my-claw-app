# Tool-run grouping — mockups

Not served, not built, not part of the app. Open `poc.html?v=<1|2|3>&t=<dark|light>&w=<wide|narrow>`.
The screenshots below are the same file captured at 1920×1080 and 390×844.

## What is wrong today

`src/components/RunGroup.tsx`, in the app as of `e29a513`:

1. **The header names the wrong thing.** `headline()` returns `"N tool calls · <firstTool>"`, and the
   first tool of a run is `bash` in almost every case. Thirteen calls that ran tests, read three
   files, wrote two patches and hit the network are announced as *"13 tool calls · bash"*.
2. **Two identical bars.** An open group draws the same `Bar` twice, once above and once below,
   with only the chevron flipped. It reads as two controls for one fold, and the bottom one pushes
   the `RunFoot` down for nothing. `FOOTER_FROM_ITEMS = 5` is what switches it on, so a group grows a
   second bar as soon as it has five children.
3. **A bar for one card.** `items.length === 1` is special-cased to draw the card alone, which is
   right, but the rule is a patch over the real problem: the fold is a box, so it has to be drawn
   even when it holds nothing worth folding.
4. **Thinking phases are billed as "thoughts" and then forgotten.** A run is not a list of tool
   calls: between two calls, and sometimes between two messages with no tool at all, the model
   spends a call thinking and writes nothing. That lands in the group as a `text` item carrying
   `reasoning`, and `headline()` only counts it when there is no tool at all (`"N thoughts"`).
   Inside a mixed run the thought is invisible in the header and only shows up once the fold is
   open, even though it is one of the two things a run is made of.

## What the others do

- **Codex CLI** prints one line per call, colored by real exit state, and the transcript is
  collapsed as a whole, not per segment. No summary line: the count is the scroll.
- **Claude Code** prints a single summary line for a phase (*"Ran 3 commands"*, *"Read 2 files"*)
  and opens the whole phase on click. The noun of the line is the verb, never the first tool name.
- **opencode v2** collapses consecutive tool calls into a *group ticker* showing counts only
  (`+ 1 command, 1 edit`). Its own users ask for a one-line outcome per group so a collapsed row
  still says what happened without expanding (opencode issue 54515), which is the same failure the
  my-claw header has: a count with no subject.
- **Cursor** keeps a live one-line status while running and replaces it with the resulting file
  list once settled.

The pattern shared by all four: **one header, verb-shaped text, composition instead of a count,
and no second bar.**

None of them names a thinking phase in the fold header, which is exactly the case my-claw has and
must answer: `13 calls · 6 shell · 3 read · 2 edits · 1 search · 1 web · 4 thoughts`.

## Thinking phases (the case none of the others have)

A thought is a row of the same list, in its own order, never a separate segment:

- **Header**: it is part of the composition (`· 4 thoughts`), and when a burst has no tool at all
the header drops the count and says only `3 thoughts`. No `3 thoughts · 3 thoughts` duplicate.
- **Row**: no mono tool name and no verdict; a spark glyph, the word `thought` in italics, the
  token count, and the beginning of the reasoning so a collapsed run still says what was being
  figured out. Height 24 instead of 27, so a run of thoughts reads lighter than a run of calls.
- **Order is preserved.** Grouping the body by family was the alternative, and it is what killed
  it: every thought ends up at the bottom, away from the call it introduced.

## Live: before the run settles

`core/runRows.ts:283` folds a run only once it is settled:

```ts
if (!itemRun || itemRun.status === 'running') { rows.push({ kind: 'item', item }); continue; }
```

So today, while a run is in flight, every call is a free `ToolCard` and the fold appears
retroactively when the run ends. With the spine that reads as the whole block changing shape under
the reader's eyes, which is the jump this design has to avoid.

**The group exists from the first call, open and unclosable.** Three consequences:

1. `buildRows` also accumulates a `running` run into a `group` row. The header's counts then grow
   live, which costs nothing: the items array is already rebuilt on every delta.
2. The screen forces `open` while `run.status === 'running'`, ignoring `expandedFolds`. The chevron
   becomes the spinner, `running` sits on the right, and there is no `hide` control: you do not fold
   work you are watching.
3. On settle, the fold closes, unless `expandTools` is on or the owner tapped during the run, the
   same `userTookControl` rule `ToolCard` already carries for its auto-open.

No remount, because the fold key is `row.items[0].id` and the ids do not change when the run
settles. A run also starts with one call, so the header appears at the **second** item: a lone row
is drawn bare, exactly like today's single-card rule, and the rail starts there. No header flicker
at 1 → 2.

**Yes, every tool visually changes, but not every tool becomes a row.** The split is row vs
container:

- The **row** (state dot, mono name, subject, time, verdict) is one component, used everywhere.
- The **container** (border, radius, surface) is worn only when the row stands alone: the first
  call of a run, a run of one call, and a tool outside any run. Inside a group the group is the
  container, so no per-call box.

That is what keeps a live single call looking like the card the owner already validated, while a
burst stops being a stack of boxes.

## V1 geometry and motion

One number holds the column, and it is **derived**, not tuned:

```css
--gutter: 13px;   /* the icon slot in the header */
--hd-pad: 2px;
--rail-x: calc(--hd-pad + --gutter / 2);   /* 8.5 */
```

The chevron and the live spinner both sit in that `--gutter` slot, centred, so a group's two
header marks cannot drift apart by the 2 px that separate a 13 px chevron from an 11 px spinner
(that was the one real offset: 31.5 vs 32.5). The rail takes `--rail-x` as its centre, the dot is
placed at `--rail-in-row: calc(--rail-x - --body-pad)` so it reaches back onto the line, and the
rail now **starts at the chevron's centre** (`top: -gutter`) behind a fade, instead of beginning
13 px below it and reading as a separate column. There are no connector stubs: the dot sits on
the line.

`?probe=1` prints the boxes from the layout engine. At 1920 wide the five marks all land on
**562.5**; at 390 wide on **22.5**.

| Box | Desktop | Phone |
|---|---|---|
| chevron (box 556..569) | 562.5 | 22.5 |
| rail (column 562) | 562.5 | 22.5 |
| dot (columns 559..565) | 562.5 | 22.5 |
| live spinner | 562.5 | 22.5 |
| live dot | 562.5 | 22.5 |

**The dot is 7 px, and odd on purpose.** A 1 px rail covers exactly one device pixel, so its
centre sits on a half pixel. An even dot at `left: -15px` (a half pixel) is snapped by the
compositor to whole device pixels and lands 0.5 px to the right, which is precisely the offset
that kept showing up. At 7 px the edges are integers: `left: 5`, spanning 559..566, centred on
562.5 like the rail. The pixel columns are checkable without a probe: rail `[562]`, dot
`[559..565]`.


Motion, all under 300 ms, all reduced-motion aware:

| Part | What it does |
|---|---|
| Fold | `grid-template-rows: 0fr → 1fr`, 240 ms `cubic-bezier(.2,.8,.2,1)` |
| Rail | `scaleY(0) → 1` from the top, 280 ms, 40 ms delay |
| Rows | fade + 3 pt rise, staggered 22 ms each |
| Dots | `scale(0) → 1`, staggered 22 ms, 30 ms behind their row |
| Chevron | rotate 90°, 200 ms |
| Running dot | accent halo pulsing every 1.7 s |
| `hide` | fades in last, 240 ms |

A thinking phase gets a **hollow** dot that interrupts the rail instead of filling it, so a run
reads as calls (solid) with thoughts between them (rings) at a glance.

The body is always in the DOM even when folded: an element created on open has nothing to animate
from, and the owner's complaint was precisely that the block jumped.

## Timers and waits: nothing is lost

A fold must not swallow the clocks. Today's inventory, and where each one lives in the spine:

| Signal | Today | In the spine |
|---|---|---|
| Run total, settled | `RunFoot`, "run · 4 m 12 s" + status | unchanged, still signs the run's end |
| Run total, live | nowhere | the header's right side: `running · 1 m 12 s`, gone the moment `RunFoot` takes over (never both) |
| One call's time | the card's right column, ticking while running | the row's right column, same |
| Thinking duration + tokens | `ReasoningLine`, "1.2k tokens · 12 s" | the thought row, same figures |
| Waiting for the model | `WaitLine` inside the bubble, a counter | a **row**: `waiting for the model` + the counter, pulsing accent dot on the rail, turning into the thought row where it stands when the first token lands |
| Sub-agent | `SubAgentCard` with its own elapsed and ring | **never folded**: `spawn` and `send` are doors, hoisted out of the group like an agent message, so the run that is waiting on a child says so at the run's level |

The last line is a real fix, not a consequence of the design: `isHoisted` (`core/runRows.ts:94`)
only covers `text` items, so a `spawn` card is folded into the group today. In the spine it would
become one row among thirteen, and the one thing the owner waits on would be the least visible.
Adding `isSubAgentTool(item.name, item.args)` to `isHoisted` is what hoists it; the fold already
cuts around whatever stays.

## V1 — Spine

No box at all. One line: chevron, `13 tool calls`, then the composition in muted ink
(`6 shell · 3 read · 2 edits · 1 search · 1 web`). Open, the children hang off a 1 px rail under
the chevron, each with a 6 px state dot (ok / fail) and a connector tick. No footer bar; a quiet
`hide` word ends a long group.

Cheapest to read in a dense thread: nothing is boxed, so a folded run does not compete with a real
card, and the composition can truncate to `6 shell · 3 read · +3` on a phone.

## An opened row

The body is not a panel. A bordered code sheet on a `codeBg` fill was the first attempt and it read
as a foreign object in a borderless thread, so:

- **No container, no fill, no frame.** The output is mono text on the page background, hung under
  the row at the row's own text column (28 px), so the eye never changes column.
- **The caption is the only chrome**: `OUTPUT` in 9.5 px letterspaced faint, `copy` on the right,
  18 px tall, no rule under it. It is also the separator, which is why nothing else is needed.
- **The opened row is marked by ink, not by a fill**: its name and subject come up to full `text`
  and a small chevron appears after the verdict. A background band on a borderless list is exactly
  the "cadre de trop" the owner rejected.
- **A diff reads by sign and colour**: `-`/`+` prefixes, the line's own ink, and an 11 % tint
  (`color-mix`) on the changed rows only. No filled sheet around it.
- **Tall output scrolls in place** (`max-height: 224px`), instead of pushing the run's next rows
  off screen.

The dot hangs off the head line, not off the row: an opened row also contains its block, and a dot
centred on the row lands in the middle of the output. The block pulls back over the rail's gutter
with the page background, so the spine stops behind it instead of running through the output.

## Recommendation

V1, the one that was picked. What it means, concretely:

- Header: `chevron` + `N calls` + the composition in muted ink (`6 shell · 3 read · 2 edits`),
  with `· N thoughts` when the run thought. On a narrow screen it truncates, and the count alone
  still stands.
- Body: rows on the rail, no per-row box: state dot, mono name, subject, time, verdict.
- One `hide` control at the end, quiet and right-aligned; the header above always closes too. Never
  a second full-width bar.
- Composition in words; the count is `N tool calls`, or `N thoughts` when there is no call at all
  (never both, that duplicate reads as slop).
- Thoughts as rows in place, lighter than a call row, named in the composition.
- A single tool call still renders as the card alone, unchanged; a burst of thoughts keeps its
  fold, because that is the only thing standing for it.
- Family sections in the body were dropped: they cost the chronological order, and the header
  composition already answers "what did this run touch" without opening anything.
- A row is a **head line** plus, when opened, a body under it. The dot hangs off the head line, not
  off the row: an opened row also contains its block, and a dot centred on the row lands in the
  middle of the output. The block carries the page background and pulls back over the rail's
  gutter, so the spine stops behind it instead of running through the output.
