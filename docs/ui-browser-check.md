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
# a long thread, rich rows, a late image and a page delay
MOCK_LONG_TURNS=22000 MOCK_RICH_HISTORY=1 MOCK_HISTORY_DELAY=220 \
  node scripts/mock-server.mjs --bundle /tmp/build --port 8100
```

Two conversations are seeded: **Long history** for the scroll, the scrollbar and paging, and
**Scripted run** for a live run (reasoning, a tool call, an answer, a token count). Long history
has 120 turns by default (`MOCK_LONG_TURNS` changes that); `MOCK_RICH_HISTORY=1` gives answers of
different heights and ends on a 1,000 px image that loads 650 ms late.

Three scenario flags add the pages only they can check:

| flag | what it seeds |
|---|---|
| `MOCK_AGENTS=1` | a `send` card and a `subagents.list` roster, so the badge, the roster sheet and the door into a sub-agent chat can be walked |
| `MOCK_SUBAGENT=1` | that sub-agent's own thread (`sub-0123456789abcdef`) with a live run behind `/__mock/sub`, and a browser task (`sub-0123456789abcdee`) inside it: the two-level address, its reload and Back/Forward |
| `MOCK_FILES=1` | a **Files** conversation carrying one attachment of every reader kind (`fixture.pdf`, `fixture.md`, `fixture.ts`, `notes.txt`), served by `/media/<id>` with the real server's inline disposition |

`/__mock/sub` drives the sub-agent's run: `POST ?step=start|grow|finish`, `GET` for its state. It
answers with what the session log holds while the run is in flight (the question and settled
cards, never the answer), so a reload mid-run exercises the same journal replay the server does.

`/__mock/timeline` drives Long history through the three states and records what the app asked
for (the last 300 requests):

| request | effect |
|---|---|
| `GET` | `step` and the request log: `session.sync`, `session.history` (`before`, `beforeId`, `first`, `fold`), `session.run.items` |
| `POST ?step=start` | a run starts live: question, reasoning, a read tool, the start of an answer |
| `POST ?step=grow` | the answer grows by a paragraph |
| `POST ?step=finish` | the run ends; a reload now gets it folded, and opening the fold answers `session.run.items` |

So the same run is checked live, reloaded while it runs, and replayed from history. A collapsed
run must never send `session.run.items` before it is opened, and must send it once when it is.

Serve a fresh bundle on a **fresh port** when re-testing: a service worker caches the old one per
origin, and a stale bundle explains every "it did not change".

## The checklist

| check | what must happen |
|---|---|
| centred column | on a wide window the thread column has the same gap left and right, and its left edge lines up with the composer's |
| opens on the newest message | the last answer is fully visible above the composer, not clipped |
| selection across messages | drag down from a question into its answer: one contiguous highlight, no whole-thread selection, no scroll |
| scrollbar | the thumb is at the window's right edge, and dragging / clicking it scrolls |
| pinning while streaming | text follows the answer while at the bottom, stops when the reader scrolls up, resumes on return |
| paging | an older page lands above without moving the paragraph being read |
| a card's door | the send card and the scheduled job's delivery both show one blue open-in-new icon (the link ink, not the theme accent), and tapping it opens the agent / the run |

## Measured 2026-11-20

The 0.6.232 web list on 44,000 entries opened with frames up to 8,332 px above the bottom, stopped
after two older pages, and left a 20-message hole at one seam. The virtualized list that replaced
it, on the same fixture (desktop 1919x958, and 390x844 for the three states):

- **Open**: the thread stays hidden until it is at its end. First and final visible gaps 0. One
  rAF read of 970 px when the late 1,000 px image sized in, gone the next frame.
- **Paging**: four wheel rounds, four requests, four distinct cursors, `fold: true`, nothing while
  parked. The question being read stayed at the same y on one prepend (0.0 px) and drifted 73 px on
  another, because a row above it finished measuring 30 ms after the page landed.
- **Three states**: no jump while reading 400 px up during a stream, follows the answer at the
  bottom, one copy of the answer after a reload mid-run, zero `session.run.items` before the
  finished group is opened, one when it is, none on reopen.

A requestAnimationFrame sampler reads before ResizeObserver corrections, so a one-frame gap it
reports may never be painted. Count consecutive frames before calling it a jump. The late-measure
drift on a prepend is the open item: rows above the anchor are estimated (96 px) until they mount.
