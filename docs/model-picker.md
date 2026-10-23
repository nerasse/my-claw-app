# The model picker: what each step is offered for

`ModelSheet` (chat), `AgentModelPickerPage` (agents, fallback) and `TagEditorPage` all render the
same flow: model, then route, then effort, then context window. Only the steps that have
something to decide appear, and the last one applies the combo: there is no confirmation screen
(owner, 2026-10-23). What decides each step is not the same subject for every step.

## The ladder belongs to the subject, the pin belongs to the session

- **Effort.** The rungs offered are those of the model being *picked*: `effortLevels` on its
  catalogue entry, filled from the provider's own answer (docs `model-metadata.md` server side).
  The current pin is the session's (`model.result`), and it is what "default (inherit)" and
  "Keep current" mean. A pin stays reachable on a model with no ladder of its own, because a dead
  pin must stay removable.
- **Context window.** Same shape: `context` on the picked entry, the ceiling of the thread for the
  current value. The standing cap (`context.cap`) is offered on the list even when it is not one of
  the graduations, and so is a ceiling the subject already pinned: a value set from Custom has to
  stay reachable without opening Custom again.
- **Route.** Only on a model served by several providers.
- **Fallback.** The image fallback offers the vision-capable models, and every tag: a tag names a
  route, and the resolver reads the capability of the leaf at run time.

## `effort` is a contract, not a derived flag

The flow takes `effort: { current } | null`, and **`null` is a decision by the caller**: it means
"this flow offers no effort step". `AgentModelPickerPage` passes it for the fallback target, whose
pin is the model alone (`agents.fallback.set` carries no effort).

The bug of 2026-09-11 was reading that field's *availability* off the model in force instead of
taking the caller's word:

```ts
const effortActive = effort?.supported === true && (effort.levels?.length ?? 0) > 0;
effort={effortActive ? { current: effort.level } : null}
```

A thread running `opencode_go/deepseek-flash` (a model whose table publishes no ladder) answered
`supported: false`, so the sheet passed `null` and the whole flow lost the step. Picking Fable 5.1,
six rungs published by Anthropic itself, offered nothing to choose. The server was right the whole
time: it answers `model.result` with `effort: { level, levels, supported }` for the thread's model,
and `model.list` with `effortLevels` per model.

The sheet now always hands the pin over (`effort={{ current }}`), which is the whole fix. The
caller's `null` keeps meaning what it says.
