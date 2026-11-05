# The approvals page

Every prompt of the install, in one place. The drawer's `More` sheet has an `Approvals` entry,
badged with the number of prompts waiting; Settings → Tools keeps the per-tool switches and links
here for the history it used to own.

## Why a page

The sheet only exists while a prompt is raised, and it is broadcast to every window -- but the
owner is often not in that conversation, the app may have been asleep, and a sub-agent's prompt
now lands in its parent's thread. A prompt raised by a node agent on another machine had nowhere
to be read. The page is the queue: it lists them wherever they came from and lets them be answered
from one screen.

## Three tabs

- **Waiting** — `approval.pending`, live. Grouped with machine chips (`this machine`, each node)
  and, when several tools are involved, tool chips. Each row carries the tool, the machine, how
  long it has waited (or `no timeout`), the agent's sentence when there is one, the call's own
  arguments, and four actions: allow once, allow for the conversation (when offered), always allow
  this exact call, deny.
- **History** — the journal (`approval.history`), unchanged, with `allow-always` reading as
  "allowed for good".
- **Always allowed** — `approval.grants`, the exact calls allowed for good. `withdraw` sends
  `approval.grant.remove`; the server answers with a fresh list to every window of the owner.

The tab opens on `Waiting` when something is pending, on `History` otherwise.

## From a node's page

Settings → Nodes → one machine has an "Allowed for good" card: the standing grants whose `origin`
is that node, with `withdraw` per row. It is the same list as the `Always allowed` tab, narrowed to
the machine you are already reading about.

## What does not change

The sheet stays the surface for the prompt in front of you: a question that must be answered to
unblock the run is not worth a navigation. The page is for the ones you are not looking at, and
for reading what happened afterwards.
