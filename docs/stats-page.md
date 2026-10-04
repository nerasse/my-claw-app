# Statistics page (app side)

What the install-wide statistics page shows, how it is organised, and what its money means. The
figures themselves are the server's: `docs/stats-page.md` of the my-claw repository, which also
describes the filter the page is asked through.

## One window, one filter, six tabs

- The header: `Statistics`, then the window -- `every conversation of this install · last 30 days`,
  with `· filtered` appended once anything is narrowing.
- Four period buttons: `7d`, `30d`, `90d`, `all`. A period press re-asks the server **with the
  filter on screen**, so the two always travel together.
- **The filter row**: `Workspace`, `Folder`, `Model`, `Endpoint`, `Source`, `Conversation`,
  `Failed only`, `Unpriced`. The first two are the scoping ones -- "how much did that project cost"
  is the question this page gets asked. A chip carries its value once it is set -- `Model · glm-5.2`
  -- so the row *is* the state of the report; a choice chip opens a sheet of values (with a search
  row for models and conversations, the two lists long enough to need one), a predicate chip is its
  own list and a tap is the answer. `✕ clear` appears as soon as anything is set, and a report that
  matches nothing says what narrowed it and offers the way back.
- **Six tabs**: Overview, Models, Conversations, Cache, Reliability, Advanced. They are the answer
  to a page that had grown nine folds in one column: a tab answers one question, and the filter row
  sits above all of them because it narrows all of them.

**Advanced is a drawer, on purpose** (2026-09-22: "cacher les analytiques useless 99% du temps").
The endpoints ranking, the source split and the OpenRouter ledger are tables nobody reads on an
ordinary visit, so they moved out of the rotation together. The vocabulary moved with them:
`Hosts` is `Endpoint`, `Caller` is `Source`, and its values are drawn as `main agent`,
`sub-agents`, `browser`, `compaction`, `compaction · speculative` (`callerLabel`; the rows keep
their raw values, only the labels are spoken).

**Conversations is two sections** (2026-09-22). A run of a sub-agent or the browser is a worker,
not a chat -- measured on this install, 364 of one window's 533 sessions were workers -- so the
conversations section lists the chats and "delegated runs" sits under it, folded by default and
openable. Nothing is merged into the payer's row: the runs keep their own spend where the owner
asked for it.

The tabs and the filter are app-side state; the **narrowing is not**. It leaves with the period as
`stats.get { period, filter }` and the server applies it in SQL, before the aggregation. That is the
whole reason a model ranking can answer "which models did the sub-agents use" -- it carries no
caller, and no amount of summing its rows invents one. `src/core/statsFilter.ts` holds the chips,
the labels and the values, and computes no figure.

## The money

The hero is what the window's traffic is worth at the rates it ran at: `billedUsd + referenceUsd`.

The page used to refuse that sum, and it was right to refuse it **as money**: `billedUsd` is what
somebody was asked to pay, `referenceUsd` is what the flat-plan half would have cost had it been
metered, and one is not a price of the other. What it got wrong was leaving a `$53` hero on an
install where three thousand nine hundred dollars of API time runs on subscriptions -- the reader
concluded the page was broken, and asked why the total was so low.

So the rule is now: **they may be added as a valuation, never quoted as a charge.** The hero is
followed by its two parts, one line each, and they add up to it:

```
$3 995.42   at list price
$53.54 charged · metered endpoints
$3 941.88 on a flat plan · subscription or plan, never billed per token
```

Rankings make the same figure, and name the charged part beside it only where there was one --
`$15.00 · $12.00 charged`. That is a minority of rows on an install that runs on subscriptions, so
the ranking stays readable and no money that left a card is lost inside a sum.

Calls nothing could price are counted and stated (`385 calls nothing could price · counted above,
absent from the money`), never priced at a guess.

## The compaction card

Under the Overview's total, a card says what the window's compactions cost: blocking and background
passes folded together (`caller` `compaction` and `compaction-*`), money at list price and tokens
side by side like the hero, tokens read and written, time, and their share of the window's cost and
tokens (`compactionTotals`, `compactionShareLine`). It is read off the per-source rows the server
already sends, so no new field. A window that did not compact draws no card. The row stays in
Advanced > Source too; the card exists because a pass reads the whole conversation and two of them
cost $6 on 2026-10-04 while hiding there.

## Where the numbers come from, and what an answer has to agree with

One `stats.get` per opening, per period, per filter. The answer lands once (`stats.result`) and
nothing pushes it: a conversation can say it moved, an install-wide total cannot.

The store (`src/core/stats.ts`) therefore keeps **what was asked** -- the window *and* the filter --
and refuses an answer that disagrees with either. A payload for the filter the owner has already
left would otherwise land under the one he is reading, which is the same class of lie as a
seven-day report under a header reading "all". The filter is echoed back by the server rather than
reconstructed here: a page that drew its own filter could show a chip the server never honoured.

`docs/back-cascade.md` has the page as the eleventh rung: back closes it and returns to whatever was
under it.

## The two strips at the top

The period row is a plain `View`; the filter chips and the tabs are horizontal `ScrollView`s,
because both can outgrow a phone's width.

A `ScrollView` carries `flexGrow: 1, flexShrink: 1` from React Native's own base style. Inside the
page's column that made the two rows flex items **of the page** rather than strips above it: the
tall vertical list below claimed the free space and then pushed them under their own content, so
the bottom of every label was cut -- and while the page was short they floated, centered, in a row
taller than they needed. Both read as a styling accident; both were flexbox arithmetic.

`strip: { flexGrow: 0, flexShrink: 0 }` on each row fixes the two halves at once. `flexGrow: 0`
stops a row from floating mid-space, `flexShrink: 0` stops it from collapsing. A layout bug like
this has no string to assert on, so `src/app/__tests__/statsStrips.test.tsx` pins the two properties
themselves.
