# Run grouping

A run's work between two messages collapses into one row: a header saying what the run touched,
and its children hanging off a left rail. This is what that row is, and the rules it carries.

Reference mockup, with the motion captured frame by frame:
`docs/reference/tool-group-poc/`.

## The header says what the run touched

`composition()` in `components/RunGroup.tsx` turns the children into a count plus a breakdown:

```
13 tool calls    · 6 shell · 3 read · 2 edits · 1 search · 4 thoughts
3 thoughts
```

The old line was `13 tool calls · bash`, and `bash` is the first call of nearly every run: it said
nothing about the other twelve. A family is coarser than a tool (`write` and `apply_patch` are both
`edits`), and a tool nobody classified keeps its own name, so an MCP server still reads sensibly.

A burst with no tool at all says `3 thoughts` and nothing else. `3 thoughts · 3 thoughts` is the
duplicate to avoid.

## One control, not two

An open group draws **one** header. A long one (five children and up) adds a quiet `hide` word at
its bottom, right aligned. It used to draw the same bar at both ends with only the chevron flipped,
which read as two controls for one fold.

## The rail and the dots

The chevron lives in a 13 pt slot and the rail runs through that slot's centre: 2 pt of header
padding plus half the slot, 8.5. The dot is placed from the same number, and its diameter is odd
(7) on purpose: a 1 pt rail covers one device pixel, so its centre is a half pixel, and an even dot
at a half-pixel left gets snapped right by the compositor and reads off-centre. This was reported
three times as "the dots are a few pixels to the right of the line" before it was measured.

| Mark | Where its centre is |
|---|---|
| chevron slot | 8.5 in the group's coordinates |
| rail | 8.5 |
| dot (7 pt wide, left 5) | 8.5 |

Five dot states, because a run is read at a glance: `ok`, `fail`, `running` (accent), `thought`
(hollow: it interrupts the line instead of filling it) and `waiting`.

## A running run is a group too

`core/runRows.ts` groups a run whether it is settled or in flight. A run drawn as free cards that
collapse into a fold the moment it ends changed the whole block's shape under the reader's eyes.

While `status === 'running'` the group is **open and cannot be closed** (`live`): you do not fold
the work you are watching. The chevron becomes a spinner and the header carries the run's chrono,
`running · 1 m 12 s`, which is the only place a live run can have one. `RunFoot` takes over when it
ends, so the two are never both on screen.

A live run with no tool yet draws nothing: its waiting bubble is hoisted (see below), so there is
no group to draw. The wait is the bubble's own `WaitLine`, where it has always been.

## What the fold never swallows

`isHoisted()` keeps three things out of a group, and each is a row of its own:

- a bubble the owner wrote, a command output, a notice, an error, a compaction summary;
- a compaction rule (`kind: 'rule'`), which is the boundary the fold is cut at;
- a message the agent actually wrote (`isAgentMessage`): the answer is what the reader follows;
- **a sub-agent call** (`spawn`, `send`): a door, not a result. It is the one thing the reader
  waits on, and inside a spine of thirteen rows it would be the least visible of them.

The fold cuts around every hoisted row, so the order the work was written in survives.

## A boundary cuts the fold

A compaction is a rule across the thread and a cut through the fold: the run it interrupts does not
continue into the work written after it. The work before the boundary is one group, closed; what
follows opens another. Only the work after the last boundary can be the segment being written
(`markLiveSegment`), so a boundary with nothing after it leaves no group spinning.

## A thought never stands outside

A thought the store holds **without a run** -- a live bubble whose start frame was missed, a run the
server folded as no longer running -- joins the fold being written instead of drawing between it and
the message it produced. The owner photographed exactly that on 2026-11-13: four blocks reading
`55 steps · 28 shell · 7 web · 20 thoughts`, a bare `Reasoning` line, then the message, while a
reasoning that *did* carry its run sat in the fold like every other step.

The rule is narrow on purpose: a phase that only thought (no words, no file), only while the run is
still `running`. A message keeps its place whatever run it wears -- hoisting is what makes the answer
readable, and a stray thought with nothing being written around it stays a row of its own.

## An opened row

Clicking a row does not move it. Its body hangs under it on the page:

- no container, no fill, no frame: mono text on the page background, at the row's own text column;
- the only chrome is an 18 pt caption (`OUTPUT`, `copy`), which is also the separator;
- the opened row is marked by ink, not by a fill (name and subject come up to full `text`, a
  chevron appears after the verdict);
- a diff reads by sign and colour, an 11 % tint on the changed rows only;
- tall output scrolls in place instead of pushing the next rows off screen.

The dot hangs off the **head line**, not off the row: an opened row also contains its block, and a
dot centred on the row would land in the middle of the output.

## The duplicate the body never prints

`contentNeedsBlock()` in `core/toolSummary.ts`: the row already carries the subject of a call
(`bash.command`, `read.path`), so the body does not print it again. Three things still earn a
block:

- an argument the row is not showing at all (`write.content`, `apply_patch.edits`: the row shows a
  path);
- a value with newlines, which the row flattens;
- anything past 96 characters, which does not fit the line.

The subject therefore stays on the line even while the card is open. Hiding it there made a bash
command vanish at the very moment the reader asked what ran.

## Open state

It lives in the screen, keyed by run id (`foldKeyOf`), never in the row: a folded group whose work
arrives is replaced by a group of real items, and state held in the component meant the group the
reader just opened snapped shut the moment it filled. `docs/run-hydration.md`.
