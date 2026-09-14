/**
 * Bringing the free-text field of a question card back above the keyboard.
 *
 * The measurement is the point. "Scroll to offset 0, the form is the bottom of the thread" is a
 * guess about a viewport that, on Android, has not shrunk yet when the field takes focus: the
 * platform reports the keyboard once it is up, not before. So the reveal has two halves. The first
 * runs at focus and can only aim at where the form should be. The second waits for the keyboard,
 * measures where the field actually is, and lifts it by the difference.
 *
 * Inverted list, so the arithmetic follows: the newest content sits at offset 0, and raising
 * something on screen means *decreasing* the offset. A lift is therefore always a step back
 * towards 0, never past it. A field covered while the list is already at 0 cannot be revealed by
 * scrolling at all, and `liftFor` says so instead of inventing a negative offset -- that is the
 * one case where the reveal has nothing left to give and the numbers have to be read.
 */

/** Room left under the field, so it is revealed readable rather than flush against the keyboard. */
export const REVEAL_MARGIN = 16;

/** Give up on a node that never calls back: a row unmounted with the keyboard open answers nothing. */
const MEASURE_TIMEOUT_MS = 250;

export interface FieldRect {
  top: number;
  bottom: number;
}

/** What a native host can say about where it is. `TextInput` and `View` both can. */
export interface Measurable {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
}

/** The last keyboard geometry the platform handed over. */
export interface KeyboardGeometry {
  height: number;
  screenY: number;
}

/**
 * The offset that puts a covered field back above the keyboard, or the current one when it is
 * already clear.
 *
 * Clearing, and not merely "somewhere above the keyboard", is what keeps a repeat of the same
 * event idempotent: Android re-announces the keyboard when the IME changes height (a predictive
 * bar, the emoji panel), and a reveal that always moved would walk the thread on each one.
 */
export function liftFor(
  fieldBottom: number,
  keyboardTop: number,
  offset: number,
  margin: number = REVEAL_MARGIN,
): number {
  const covered = fieldBottom + margin - keyboardTop;
  if (covered <= 0) return offset;
  return Math.max(0, offset - covered);
}

/**
 * The pad that stands in for the part of a lift the thread cannot make.
 *
 * The scroll can only ever step back towards offset 0, and the field of a question sits at the
 * newest content: measured on the owner's phone, `field=565..605` under a keyboard whose top was
 * `426`, with the offset already `0`. `liftFor` answered "0 again" and the field stayed covered --
 * not because the arithmetic was wrong but because there was nothing left to scroll. The viewport
 * is what never shrank (the app is edge to edge, so `adjustResize` is inert), and the only lever
 * that does not go through the offset is space *inside* the content.
 *
 * Space added at the start of an inverted list's content is space at the bottom of the screen:
 * the container is not flipped, the scroll view is, and that is the same reason the list header is
 * the bottom of the thread. So the pad pushes the whole content up by exactly what the scroll
 * could not deliver, and the field's bottom lands `margin` above the keyboard.
 */
export function padFor(
  fieldBottom: number,
  keyboardTop: number,
  offset: number,
  margin: number = REVEAL_MARGIN,
): number {
  const covered = fieldBottom + margin - keyboardTop;
  if (covered <= 0) return 0;
  const delivered = offset - liftFor(fieldBottom, keyboardTop, offset, margin);
  return Math.max(0, Math.ceil(covered - delivered));
}

/**
 * Where a host is on screen, or null when it cannot say.
 *
 * The timeout is not a retry loop: `measureInWindow` simply never calls back for a node that has
 * already been unmounted, and a promise that never settles here would leave the reveal of the next
 * field waiting behind this one forever.
 */
export function measureOnScreen(node: Measurable | null): Promise<FieldRect | null> {
  return new Promise(resolve => {
    if (node === null || typeof node.measureInWindow !== 'function') {
      resolve(null);
      return;
    }
    let answered = false;
    const done = (rect: FieldRect | null): void => {
      if (answered) return;
      answered = true;
      resolve(rect);
    };
    // The timer is not cleared on the answering path on purpose: clearing it would mean holding
    // the handle, and the `answered` flag already makes the late one a no-op.
    setTimeout(() => done(null), MEASURE_TIMEOUT_MS);
    node.measureInWindow((_x, y, _width, height) => done({ top: y, bottom: y + height }));
  });
}

export interface RevealProbe {
  /** Null when the field could not say where it is, which is a finding of its own. */
  field: FieldRect | null;
  /** Top of the keyboard in screen coordinates, null when it is down. */
  keyboardTop: number | null;
  keyboardHeight: number | null;
  offsetBefore: number;
  offsetAfter: number;
  /** Space the thread had to give the content when the scroll could not deliver the whole lift. */
  pad: number;
  /** Where the field ended up, measured after that pad was given a layout pass. */
  settled: FieldRect | null;
}

/**
 * One line for the device diagnostics.
 *
 * A measurement is the whole reason this exists: "the field is still behind the keyboard" is not
 * something to reason about from a phone screenshot, and every number needed to tell a viewport
 * that never shrank from a lift that could not go far enough fits on one line.
 */
export function probeText(probe: RevealProbe): string {
  const field =
    probe.field === null
      ? 'unmeasured'
      : `${Math.round(probe.field.top)}..${Math.round(probe.field.bottom)}`;
  const top = probe.keyboardTop === null ? 'down' : String(Math.round(probe.keyboardTop));
  const height = probe.keyboardHeight === null ? '-' : String(Math.round(probe.keyboardHeight));
  // `settled` is the proof and the pad is what it proves: a second measurement of a field that
  // moved, taken after the space was given a layout pass. Without it the line says what was
  // attempted, which is exactly the reading that kept this bug alive for three releases.
  const settled =
    probe.settled === null
      ? ''
      : ` settled=${Math.round(probe.settled.top)}..${Math.round(probe.settled.bottom)}`;
  const pad = probe.pad > 0 ? ` pad=${Math.round(probe.pad)}` : '';
  return (
    `question field reveal: field=${field} keyboardTop=${top} keyboardHeight=${height}` +
    ` offset=${Math.round(probe.offsetBefore)}->${Math.round(probe.offsetAfter)}${pad}${settled}`
  );
}

export interface RevealOptions {
  field: Measurable | null;
  /** `Keyboard.metrics()`, passed in so the arithmetic below can be read without a device. */
  metrics: KeyboardGeometry | undefined;
  offset: number;
  scrollTo: (offset: number) => void;
  /**
   * Space to give the content under the field when the scroll cannot deliver the whole lift.
   * Absent means the caller only wants the numbers, which is what the tests do.
   */
  setPad?: (pad: number) => void;
}

/**
 * Two frames, so the pad is laid out before the field is measured again.
 *
 * A single frame would measure the old layout: the state that carries the pad has to be flushed,
 * the list has to re-measure the content, and `measureInWindow` of a node that has not moved yet
 * answers the same rect -- which would read as "the pad did nothing".
 */
function afterLayout(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Measure, lift what the scroll can, pad the rest, and hand back the numbers either way. */
export async function revealFieldAboveKeyboard(options: RevealOptions): Promise<RevealProbe> {
  const field = await measureOnScreen(options.field);
  const up = options.metrics !== undefined && options.metrics.height > 0;
  const keyboardTop = up ? (options.metrics as KeyboardGeometry).screenY : null;
  const offsetAfter =
    field !== null && keyboardTop !== null
      ? liftFor(field.bottom, keyboardTop, options.offset)
      : options.offset;
  const pad = field !== null && keyboardTop !== null ? padFor(field.bottom, keyboardTop, options.offset) : 0;
  if (pad > 0) options.setPad?.(pad);
  if (offsetAfter !== options.offset) options.scrollTo(offsetAfter);
  // Measured again only when something was asked to move: a clear field that needs neither a lift
  // nor a pad is already where it is, and a second read of it proves nothing.
  const settled =
    pad > 0 && options.setPad !== undefined
      ? await afterLayout().then(() => measureOnScreen(options.field))
      : null;
  return {
    field,
    keyboardTop,
    keyboardHeight: up ? (options.metrics as KeyboardGeometry).height : null,
    offsetBefore: options.offset,
    offsetAfter,
    pad,
    settled,
  };
}
