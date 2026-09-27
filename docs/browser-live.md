# The live view of the browser

The Browser page opens on **Live**: every window of the agents' browser, as it is now, and the
owner's hand in any of them. The server side (the VNC stage, the relay, the frames) is described in
the server repo, `docs/browser-live.md`. This page covers what the app decides.

## Nothing here holds a window

Watching, "Show in VNC", tapping and typing: none of it reserves a window, and none of it stops an
agent. The owner lends a hand (a button an agent missed, a captcha) and the agent carries on. The
only thing that asks twice is closing a window an agent is working in.

## What is watched

`watchFor` (in `BrowserScreen.tsx`) turns what is on screen into the `browser.watch` frame: the
listing always, plus the shown tab of every window as a tile, or of the one window open at full
size. It is sent again when that changes and on every reconnect, since the server forgets a
device's watch with its socket. It is dropped when the page closes or the app goes to the
background: pictures cost the link and the battery, and nobody looks at them there.

Pictures live in `browserLiveStore` (`src/core/browserLive.ts`), one per tab, and are listened to
per tab: a picture re-renders its own tile, never the wall. A picture older than the one held (they
can cross on the wire after a watch changed) is ignored, and pictures of tabs no longer shown are
dropped.

`LiveImage` draws the next picture over the current one and swaps once it is decoded. Swapping an
image's source in place blanks it while the next one decodes, and at 4 to 15 pictures a second
that is a flicker.

## The same page on every screen

The wall takes as many columns as fit (320 pt at least per tile): one on a phone, two or three on a
tablet, more on a desk. A tile opens its window at full size. On the web, "Pop out" opens that
window in a browser tab of its own (`#browser-window=<id>`, read by `windowFromLocation`), which
opens straight on it: five screens, five windows.

## A window at full size fits the screen

The full view is not in a scroll view: a finger dragged on the page scrolls the page, and a scroll
view around it would take the drag for itself. The controls keep their height and the picture
takes the room left, fitted with its proportions; when the keyboard comes up, the shell shrinks
(`docs/keyboard-avoidance.md`), the picture with it, and the field typed in stays in view beside
the page it types into. The tap is placed on the picture as drawn, so the fit never shifts it.

## The hand

Positions are sent as fractions of the picture (`surfaceMath.ts`, pure and tested), so neither the
picture's size nor the zoom matters to the server.

- **Touch** (`LiveSurface.native.tsx`, RNGH v3): a tap clicks where the finger lands; one finger
  scrolls the page, the page following the finger; a pinch zooms the picture around the fingers,
  two fingers move it, "1:1" resets it. A VNC client on a phone makes the finger push a mouse
  pointer around a desktop; here the finger is the pointer. The gestures are built once and read
  their state from a ref: rebuilt at every picture, they would be torn down under a finger still
  on the glass.
- **Phone keyboard**: a field under the picture. What changes in it is replayed on the page as the
  backspaces and characters that make it (`textEdit`), so autocorrect and swipe typing work. Keys
  a phone keyboard lacks (Tab, Esc, arrows) are buttons.
- **Mouse and keyboard** (`LiveSurface.web.tsx`): press, move and release go through as they are,
  so a drag selects and a hover opens a menu; a release outside the picture is still sent, or the
  page would keep its button held. The wheel scrolls. Once the picture has the focus, keys go to
  the page (`keyInput`): a character typed alone is text, whatever the layout (AltGr included,
  which Windows reports as Control+Alt), and a named key or a shortcut goes as a key with its
  modifiers. Paste sends the clipboard as text.

## Never replayed

Frames sent while offline wait in the native outbox and are replayed on reconnect
(`docs/connection-outbox.md`). A tap replayed on a page that moved since would click something
else, so the live view sends no input while the socket is down, and the server also drops one older
than a few seconds. Controls ("Show in VNC", a new window) go through the outbox like any frame: a
late one does what it said.

## "Show in VNC"

The VNC client cannot choose a window; the app does. "Show in VNC" puts the window on the VNC
screen alone. On a phone, "VNC app" then opens the VNC client through a `vnc://` link, when one is
installed that takes it; otherwise the page says the address to dial.
