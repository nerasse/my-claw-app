# Pasting an image into the composer

A screenshot lives in the clipboard, and the shortest path from there to the agent should be one
gesture. The two platforms give very different tools for it, so the feature has two shapes behind
one behaviour: the image lands in the composer as a staged attachment, exactly like a picked file,
and leaves on the next send.

## Web: Ctrl+V, and a menu entry for pointers

`src/core/fileDrop.web.ts` listens for `paste` on the window and hands `clipboardData.files` to the
same staging path as the file picker. Drag and drop shares the listener set, for the same reason.

Two details that are not obvious:

- **The listener is on the window, not on the input.** Aiming at a rectangle is what this replaces.
  The cost is that a paste anywhere in the app would be swallowed by the chat, so a paste is
  accepted only when the focus is on the composer (`COMPOSER_INPUT_ID`, `src/core/domIds.ts`) or on
  nothing at all. A file pasted into a settings field stays with that field.
- **A pasted screenshot often has an empty `File.name`.** The name is what the server stores and
  what the agent later reads, so an extension is derived from the mime type: `pasted-<ts>.png`. The
  clipboard is sure about the type and about nothing else.

`clipboardImage()` on the web bridge reads `navigator.clipboard.read()`. It needs a user gesture and
Firefox does not offer it to a page at all, so it exists as the pointer-only fallback (a tablet with
no keyboard), never as the main path. `clipboardHasImage()` answers "the browser can be asked",
because the only way to know what is in the clipboard is to read it, and reading it prompts.

## Android: a menu entry, because the field cannot be pasted into

React Native 0.86 exposes no paste event, and `ReactEditText` implements neither `commitContent` nor
`setContentMimeTypes`. Verified in `node_modules/react-native/ReactAndroid`, not assumed. A pasted
image therefore **cannot** reach the JS side through the text field: making it work would mean a
Fabric component of our own replacing `TextInput` in the composer, shadow node and text measurement
included, for one gesture.

The clipboard is read on demand instead, from the attachment sheet:

```
sheet opens ──► clipboardHasImage()   description only, silent
tap "Paste image" ──► clipboardImage()   reads the clip, copies it to the cache, returns file://
                 ──► staged like any attachment
```

Why the two calls are split: reading the clip description is silent, reading the clip raises the
Android 12 "pasted from" toast. A menu that toasts every time it opens is worse than no entry.

Why the native side copies the image itself rather than letting `prepareFile` do it later: the URI
permission Android grants over a clipboard `content://` belongs to that read. A second read, one
tick later, can land after the grant is gone.

`getPrimaryClip` is refused outright while the app does not hold focus (Android 10+). That surfaces
as a null clip, which the bridge reports as "no image in the clipboard" rather than as an error.

## Not done

`@react-native-clipboard/clipboard` is in the dependency list and stays there for text. Its image
side is useless here: `getImagePNG` answers `"not supported on Android"`, and `getImage` returns
base64, so a 5 MB screenshot crosses the bridge as 7 MB of string. Thirty lines of Kotlin return a
`file://` uri instead, which the existing upload path already knows how to read.
