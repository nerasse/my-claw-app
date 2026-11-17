# Watching the interface in a real browser

Two layers, and they answer different questions. Neither replaces the other.

## What a test can prove: the ordering

`__tests__` and `src/**/__tests__` drive the real app tree through `test-utils/render.tsx`
(`renderApp`, then `DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) })`).
That is how a scripted run -- reasoning, tool calls, a compaction, a reload -- is replayed without a
server and without a model, and it is the cheapest place to pin *what the reader gets*, in order.

`test-utils/scenario.ts` is the vocabulary for it: `ask`, `answer`, `thought`, `call`, `run`,
`folded`, and `visible(items)`, which returns the row labels the real pipeline
(`buildRows` → `pinnedSends` → `withDaySeparators`) produces. `core/__tests__/orderScenarios.test.ts`
walks one conversation through the three views that have historically disagreed -- live, a reload
mid-run, a reload after the run finished -- and pins the laws between them:

- the same entries read in the same order live and replayed, the `streaming` flag excepted;
- a finished run folds into one row where its work stood, and the free bubbles keep their place;
- a send held behind a compaction is not swallowed by the fold in front of it, and the boundary
  cuts the fold;
- an undelivered send is pinned under the newest work.

Any interface change that touches rows starts with a stage in that file. It is a few lines, it runs
in milliseconds, and it fails when a law moves.

## What only a browser can prove: the layout

Selection direction, a scrollbar a mouse can drag, a thread that opens on its last message, a page
of older rows landing without moving what is being read: all of that is CSS layout and native
browser behaviour, and no DOM simulation sees it.

`scripts/mock-server.mjs` serves the built bundle and plays a scripted conversation on the socket.
It takes its address from the page's own origin (`core/serverUrl.web.ts`), so serving the bundle is
the whole of "point the app at the mock" -- no setting, no storage. No model is called: the run is
a list of frames from `core/protocol.ts`.

```sh
bash scripts/build-web.sh
node scripts/mock-server.mjs --port 8099     # then open http://127.0.0.1:8099/
```

Two conversations are seeded: **Long history** (240 turns, paged 40 at a time) for the scroll, the
scrollbar and the anchoring, and **Scripted run** for a live run (reasoning, a tool call, an
answer, a token count) that a browser can be watched through step by step.

Serve a fresh bundle on a **fresh port** when re-testing: a service worker caches the old one per
origin, and a stale bundle explains every "it did not change".

## The checklist

| check | what must happen |
|---|---|
| opens on the newest message | the last answer is fully visible above the composer, not clipped |
| selection across messages | drag down from a question into its answer: one contiguous highlight, no whole-thread selection, no scroll |
| scrollbar | the thumb is at the window's right edge, and dragging / clicking it scrolls |
| pinning while streaming | text follows the answer while at the bottom, stops when the reader scrolls up, resumes on return |
| paging | an older page lands above without moving the paragraph being read |
| a card's door | the send card and the scheduled job's delivery both show one blue open-in-new icon (the link ink, not the theme accent), and tapping it opens the agent / the run |

## Known gap, measured 2026-11-14

Paging on the web **ends** correct but is not continuous: the reader sits on the older page for
about 1.8 s (2.5 s worst case) before the offset catches up. The end state is exact
(Question 100 returns to the same y), and the cause is measurement rather than arithmetic: a
virtualized list realises the prepended rows in steps hundreds of milliseconds apart, so the
content height grows under the reader faster than `onContentSizeChange` can be compensated. The
two candidate fixes are an index-based anchor (`scrollToIndex` on the row that was at the top,
tolerating an estimate for a frame or two) and a non-virtualized window for the rows just above the
viewport.
