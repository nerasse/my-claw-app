# Day separators in the thread

The thread showed only a clock on each bubble. A conversation scrolled past midnight read as one
unbroken hour, and nothing said which day a message belonged to (owner, 2026-11-10: "je vois les
heures, mais je ne vois pas du tout la journée"). A divider now opens each day, the way WhatsApp
does it: `Today`, `Yesterday`, then the date.

## A row of the list, never a caption on a bubble

The divider is `{ kind: 'day', day }` in `core/runRows.ts`, inserted by `withDaySeparators`. A row,
for the reason the compaction rule is one: the list is inverted, so a cell lays its children out
`column-reverse` under a scaleY flip, and a header drawn inside the first bubble's cell lands under
it. A row is ordered by the data, which is what the inversion is built on.

`day` is local midnight, computed by `dayOf(ts)` (`core/day.ts`): the identity of the divider, and
the list key (`day:<stamp>`). Two messages an hour apart share it; a run that crosses midnight does
not open a second one, because a group is one row and opens on its first item's day.

## Where the day comes from

Only rows with a time of their own can open a divider:

- a bubble: its `ts`;
- a group: its first item's `ts`;
- a folded row: its first summary's `ts`.

A footer (`RunFoot`) has no say: it belongs to the day the row before it opened, so a run's
signature never divides a day in two. The live compaction rule is the opposite case: it says what
is happening now, so when the message parked behind it opens a new day, the divider goes above the
rule rather than between the two.

`pinnedSends` runs before the dividers. An undelivered send waits at the bottom of the thread, not
where it was typed, and the divider follows the bubble it is drawn above.

## What the label says

`dayLabel(day, now)` reads the name at draw time, not when the row was built: a thread left open
past midnight says `Yesterday` for a day that has just stopped being today as soon as anything
redraws the row.

- the current day: `Today`;
- the day before: `Yesterday`;
- two to six days back: `3 days ago`;
- the week after that: `Last week`;
- past two weeks: the date (dd/MM, and the year when it is not the current one). Counting further
  back stops helping -- the date is what the reader wants (owner, 2026-11-11: "hier, il y a deux
  jours, il y a une semaine, et ensuite ça met les dates").

The locale is the device's, like every other date in the app. The ladder is not the divider's own:
`formatDate` (core/utils.ts) reads it too, so a session row, a file's date and a divider all name a
day the same way, and only today is a bare clock.

## Tests

`src/core/__tests__/day.test.ts`: the day stamp at the edges of a day, and the three labels.

`src/core/__tests__/runRows.test.ts` (`withDaySeparators`): one divider per day, the day carried on
the row, a group opening on its first item, and a footer never opening one.

`src/components/__tests__/daySeparator.test.tsx`: the chip renders the name, and an older day is a
date.
