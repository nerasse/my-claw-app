# Pictures in the thread, and the full-screen gallery

A browser sub-agent that returns five captures is a normal answer. It used to cost five times
the thread: each attachment was a fixed **190x190** stage with `resizeMode="contain"`, so a wide
capture (1280x520) was drawn 190x77 *inside its own box* and two thirds of the height sat empty
between the picture and the next name. Add one truncated `browser-4c8600a1-…` line per picture and
the message was a screen and a half of mostly nothing (owner, 2026-09-17).

Nothing about that was the server's: it serves each capture, with an id and a poster for videos.
It was the box.

## One picture: its own shape

`useMediaRatio` reads the header with `Image.getSize` before the image is drawn, and the stage
takes **full width** with `height = width / ratio`, clamped between 140 and 360pt. A 2.5:1 capture
in a 350pt bubble is 142pt tall -- no bands, no reserved square. Until the header arrives (or if it
never does) the box is 16:9, so the thread does not jump when the picture lands.

`contain` always: a portrait photo shows at its own shape with side bands rather than being
cropped, and the gallery is one tap away for anything taller than the window.

## Several pictures: a carousel where they sit

`Bubble` walks the attachments in order and collects **consecutive** pictures and videos into a
run; anything else (a document, a deleted attachment, a voice note) keeps its own row, exactly
where the message put it. A run of two or more draws one `MediaCarousel`:

- same geometry as a lone picture, ceiling lowered to **240pt** -- the thread is the point;
- `‹` `›` arrows at the edges, dimmed and inert at the two ends, nothing wraps;
- a `2/5` counter in the corner: the name under the stage belongs to the picture **on** it;
- tapping the stage opens the full-screen gallery **at that index**.

The wording is the owner's: *"un carrousel qui a des flèches previous et next"*, *"le nom sous
chaque image"*. There is deliberately **no swipe on the in-thread carousel**: the thread is the
only vertical scroller in a conversation and a nested scroller competes with it for every drag
(`docs/thread-scroll.md`). Swiping is the gallery's job, one layer up.

A run is only grouped when **every** attachment of it can be drawn. A picture whose bytes are gone
is a chip on its own; folding it into a carousel would put a hole in the middle of someone's
captures and say nothing about it.

## The full-screen gallery

`ImageViewer` takes the run and the index that was tapped: a `pagingEnabled` `ScrollView` with one
`ImageZoom` per page, the same pinch/double-tap as before, arrows for the same reason the carousel
has them, and the name plus `3/5` in the top bar. A lone picture is a gallery of one, so the chat,
the file explorer and the carousel all go through the same viewer.

**Zoom against paging.** At scale 1 the zoom view has nothing to pan and the pager takes the drag;
once zoomed, the pan belongs to the picture. `@likashefqet/react-native-image-zoom` does not expose
its zoom state, so this is the behaviour the library gives rather than one we drive -- the arrows
are the guaranteed path, and the first thing to check on a device.

## The bars, on a desktop

The bars over a full-screen picture were tap-to-toggle only, which is the phone's convention: a tap
flips them, and a touch screen has no other pointer to ask. On a desktop they vanished five seconds
in and the one gesture every lightbox answers to -- moving the mouse -- did nothing; the click that
*was* wired is also a zoom on a picture you can pinch (owner, 2026-09-17).

`src/app/viewerControls.ts` holds the rule both platforms share, as a decision function rather than
a reducer because a mouse crossing the screen fires dozens of events a second and a state update
per event would re-render the zoomable picture dozens of times a second:

- **activity reveals** -- a tap (both platforms), a `pointermove`/`pointerenter` (web, through
  `pointerActivityProps` in `src/core/webProps.ts`);
- **idleness hides**, after `VIEWER_IDLE_MS` (5s), checked on a 1s tick whose last activity lives
  in a ref: no render per event, and no timer at all once the bars are down;
- **hover holds** -- `pointerHoverProps` on the two bars, so the close cross cannot vanish from
  under a mouse on its way to press it;
- **hiding by hand is a decision, not idleness** -- the tick must never undo a deliberate tap, so
  the countdown is reset, not restarted.

The phone keeps everything it had; the only difference on web is that the mouse counts as somebody
being there.

## Files

- `src/components/MediaCarousel.tsx` -- `MediaItem`, `useMediaRatio`, `mediaHeight`,
  `mediaItemsOf`, `isCarouselMedia`, the carousel itself.
- `src/components/AttachmentView.tsx` -- one picture, its own shape; chips unchanged.
- `src/components/Bubble.tsx` -- the run grouping, and `onOpenMedia`.
- `src/app/ImageViewer.tsx` -- the gallery (`images`, `index`), arrows, counter, the bars.
- `src/app/ChatScreen.tsx`, `src/app/FilesScreen.tsx`, `src/app/AppShell.tsx` -- one image entry
  point: `openImage(images, index)`.
- `src/core/webProps.ts` / `webProps.web.ts` -- `pointerActivityProps`, `pointerHoverProps`.
