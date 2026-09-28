# Downloads

One arrow for every file (a bubble's attachment, a session file, a row of the explorer, the bar of
every viewer, the carousel), and the explorer's "Download…" action, all through one flow:
`core/downloadFlow.ts`.

## The menu is never drawn where the arrow is

`ActionSheet` fills its parent. The arrow used to render its sheet beside itself, so the sheet
filled the row, the chip or the bar that held it: the menu opened inside the element, on the phone
and on the web alike (2026-09-28). A control deep in the tree now asks `overlayStore`
(`core/overlay.ts`), and `OverlayHost`, mounted once and last in the shell, draws the menu over
the whole screen, viewers and the selection viewer included. The back cascade reads the store
before any other layer (`docs/back-cascade.md`, rung 0).

The same host carries the notice, one line near the bottom for a few seconds. The arrow is 32
points wide and has no room to say "Saved to Downloads"; most surfaces had nowhere to say it at
all, so a save used to be silent. The arrow itself turns into a check, or goes red, for two seconds.

## A phone and a browser do not have the same destinations

| | Phone (APK) | Browser (desktop or mobile) |
|---|---|---|
| one file | bottom sheet: Downloads, the gallery (pictures and films only), "Save as…" | downloads at once, no menu |
| a series (carousel, gallery) | the same sheet, plus "Save all N…"; past ten it asks once | a short menu hung under the arrow: "This file" / "All N files" |
| progress | the arrow's spinner, the notice at the end | the browser's own download bar |
| feedback | the notice, always | the notice for a series or a failure |

A browser has one destination and its own dialog, so offering "Downloads", "the gallery" and
"Save as" there was three names for the same thing. It downloads through an anchor with the
`download` attribute: the browser streams the file itself instead of the app holding it in memory,
and the credential rides in the URL (`authQuery`), so no header is needed. A series is spaced by
`BROWSER_SERIES_GAP_MS`, because a browser keeps only the first of anchors clicked back to back.

The anchored menu (`menuPosition`) is under the arrow, right edges aligned, kept inside the window,
and above the arrow when the room below is too short. A click anywhere else closes it; Escape and
the browser's Back go through the back cascade like every layer.

## What a transfer answers

`saveOne` and `saveMany` answer `{ ok, message }`, or `null` when the owner dismissed "Save as".
A dismissal is not a failure and says nothing. The previous string answer was classified by
prefix, and `"Saved to Downloads".startsWith("Saved ")` read every success as a failure.
