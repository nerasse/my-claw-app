# Status page (app side)

What the status page of a conversation shows, where it opens, and why it is **pushed** rather than
asked for. The report itself (fields, attribution, prices) is the server's: `docs/status-command.md`
of the my-claw repository.

## What the owner sees

- The header: `Status`, the model the conversation runs on on a line of its own, the tag and the
  effort under it, and a `live` mark once the first report has landed. The model id is the long
  part of that pair: joined to the tag, it was the model the phone cut. No refresh button: there is
  nothing to refresh by hand.
- A run strip when something is going on: `running · main, digger[1]`, `compacting`.
- **Context**: occupied over the effective window, the meter, the auto-compaction threshold, the
  last measured prompt.
- **Usage · total**: one figure for everything the conversation caused, its own calls and every
  sub-agent it drove added together (billed and reference prices added; the split is a sub-line
  when both exist), then tokens (in, cached, out) and calls. Under it, three blocks:
  - `this conversation`, always open: calls, in, out, cost, the wall time spent in the API, and the
    models behind it.
  - the sub-agents as one figure: how many, what they cost together in calls, tokens and money,
    with the models they ran on merged by model **and provider**, so a model six workers drove is
    one line while the same model on two providers stays two.
  - `by sub-agent`, folded one tap below: a row per sub-agent (name, type, a dot while it runs,
    `gone` once its session was killed), a sub-agent's own sub-agents indented under it, each row
    unfolding into its own models.

  A model line is drawn over two lines: the name and its price first, where the calls went, which
  rung of the price ladder priced them, and what they cost in tokens under that. The name is the
  model alone -- the endpoint pin is a route (`@streamlake/fp8`: a provider and a quantization),
  never part of a name, which is what a name read off the whole reference used to say. The line
  under it opens with that provider, so two rows of one model served by two providers
  (`api.anthropic.com` and `claude-sdk`) can be told apart; the server sends them apart for the same
  reason it prices them apart. It is drawn with the provider's own spelling (`StreamLake`, `Z.AI`)
  when the server resolved one and with the verbatim tag when it did not -- the server reads those
  names from a cache it never waits on, so the same route arrives named one minute and bare the
  next. The name is decoration only: the rows are merged on the tag, or one cold read and one warm
  read of a provider would be drawn as two lines of it.
  It closes with the rung that answered (`engine anthropic`, `median of
  28`, `endpoint streamlake/fp8`), because a figure nothing could price and a figure guessed from
  the cross-market median look identical on a page that does not say which one it is. Each price
  carries its markers (`*` not a charge, `~` a neighbouring model's price), and `since <date> (90
  days)` closes the card when the conversation is older than the analytics.
- **The reconciliation line**, ruled off at the foot of the card: `openrouter.ai · they charged
  $12.50 · we recorded $2.00 · gap +$10.50`, with `12 calls · 90 days · their figure runs from the
  key, not the window · balance $7.50` under it. See "The provider's own ledger" below.
- **Details**, folded: started, last active, turns, session id, who spawned a sub-agent, the
  window's provenance, the estimate, the request wall, **the current model with where it is picked
  from and the default it falls back to, and the current effort with the rung it comes from**,
  verbose, approved.

`this conversation` is open because it is the figure every other one is read against: folding it
asked for a tap to answer the page's own question. The sub-agents are the other way round, since
what a glance needs from them is what the delegation cost -- with five workers their names are what
a recap is read past rather than what it is read for.

What was taken out when the page was redrawn (0.6.45): the grid of session counters and the
`cost · 90 days` card showed the same calls and tokens the usage card shows; `active run` was in
three places; `platform · dm` never varied; the raw text of the chat command was a dump of the
same numbers. Duplicates are not context, they are noise to scan past.

## The provider's own ledger

Everything else on the page is what the server *deduced* a call cost. This one line is the other
half: what a provider says it charged the key, beside our sum, and the gap. It is drawn from
`reconciliation` on the report -- an optional field, so a server that predates it costs the page one
line and nothing else.

Three things about it are load-bearing:

- **It is the account's money, not the conversation's.** A provider bills the key, so both halves
  are install-wide and the line sits apart from the figures above it, under a rule. It is therefore
  drawn even on a conversation that has spent nothing, where the card otherwise reads "nothing has
  been called here yet".
- **The gap is not an error.** It is the distance between a ledger and an inference, and the second
  line says why it is expected to be non-zero: our window is ninety days and theirs runs from the
  day the key was made. It is drawn **signed** -- `+` is money the provider took that we did not
  account for, `-` is money we recorded that it never billed (a BYOK route, charged by the upstream
  provider instead), and which way it leans is the whole information.
- **A number that was not read is never drawn.** The server reads the ledger from a cache it
  refuses to wait on, so an API that is down and a cache nothing has warmed yet both arrive as
  `providerUnread`. The line then carries our own sum and `provider not reached`: an unreachable
  provider takes a figure off the line, never the line. The flag wins over any figure left beside
  it, and a missing figure is never rendered anyway -- `$NaN` is the failure mode this replaces.

## Where it opens

A page of the shell like settings or files: in the pane beside the conversation on a wide window
(`layout.sidePane`), in the conversation's place on a phone. Until 0.6.45 it was an absolute layer
over the whole shell, which on a desktop covered the conversation the report was about. The
instructions page moved the same way, its editor now taking the pane instead of stacking a second
layer over the first.

Opening the page from the drawer's menu on another conversation switches to that conversation
first, like the files page does: a report beside a conversation it does not describe reads as a
report of that conversation.

## Live

The page is watched server side from open to close: `status.watch { threadId }` on open, the
server answers with the report and pushes a fresh one each time it moves (a call recorded on the
session or on a sub-agent billed to it, a run starting or ending, a compaction, a model change),
`status.unwatch` on close. `statusStore.receive` keeps a report for the open thread and drops one
for any other; nothing in the app asks.

The previous design asked (`status.get`) on every `model.result` the header lives on and at the
end of a run, and only the thread's own readings reached the app: a sub-agent's calls stream on
the sub-agent's thread, so the parent's delegated figure stood still until the parent itself made
a call. A `fetch === 'loading'` guard against late answers papered over the race between the ask
and the push. Both are gone.

A watch belongs to a socket. `resumeFrames` re-watches the page still open when a new socket comes
up, or a phone back from the background would keep the report of the moment the old socket died.
