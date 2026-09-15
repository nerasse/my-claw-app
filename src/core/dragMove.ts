import type { SessionSummary } from './protocol';

/**
 * One drawn line of the conversation list, in the coordinates of the list's own content: `y` is
 * where it starts with the list scrolled to the top, so a finger's position is
 * `event.y + scrollOffset` and nothing has to measure the window.
 */
export interface ListLine {
  key: string;
  /** The section the line belongs to, header included. null = the conversations nobody filed. */
  folderId: string | null;
  /**
   * What the line is. Both a header and a row can be picked up, and what they carry differs: a row
   * carries a conversation, a header carries the folder it names.
   */
  role: 'header' | 'row' | 'empty';
  /** Set on a conversation. */
  threadId?: string;
}

export interface LineBox extends ListLine {
  y: number;
  height: number;
}

/**
 * Where every drawn line sits in the list's content, in the order the list draws them.
 *
 * Heights are summed, never read from `onLayout`: on the web every item of a `FlatList` reports
 * y = 0 -- what react-native-web measures there is the item, not the item in the list -- so a hit
 * test that trusted those y values found no line at all and picking anything up did nothing at
 * all. Heights are right on both platforms, two entries are contiguous, and the list draws
 * `separator` pixels between two of them.
 *
 * The walk stops at the first line with no height: nothing can be over a line that has not been
 * laid out, and where the ones after it would sit is a guess.
 */
export function stackLines(
  lines: readonly ListLine[],
  heights: ReadonlyMap<string, number>,
  separator: number,
): LineBox[] {
  const boxes: LineBox[] = [];
  let y = 0;
  for (const line of lines) {
    const height = heights.get(line.key);
    if (height === undefined) break;
    boxes.push({ ...line, y, height });
    y += height + separator;
  }
  return boxes;
}

/**
 * Where the chip sits while a line is carried: centred on the finger, and held clear above it.
 *
 * Centred sideways, because the chip names what is in hand and the hand goes under it. Not centred
 * the other way: on a finger the chip would sit under the fingertip and hide itself. It rides `gap`
 * pixels above the point instead, its own height included -- and a size nobody has measured yet
 * (0, 0) is the same rule with nothing to add, rather than a case of its own.
 */
export function chipAt(
  finger: { x: number; y: number },
  chip: { width: number; height: number },
  gap: number,
): { x: number; y: number } {
  return { x: finger.x - chip.width / 2, y: finger.y - chip.height - gap };
}

/** The line under a finger, if it is over one. */
export function lineAt(boxes: Iterable<LineBox>, contentY: number): LineBox | undefined {
  for (const box of boxes) {
    if (contentY >= box.y && contentY < box.y + box.height) return box;
  }
  return undefined;
}

/**
 * What a drop would file, or null when it would file nothing.
 *
 * Two ways to file nothing, and both matter. Releasing over no section at all (the gap under the
 * last section, the search row) files the row nowhere: a drag that ends outside is a drag the
 * owner changed his mind about. And releasing over the folder the conversation is already in is
 * the common case -- a long press that goes nowhere is also a way of looking at a conversation --
 * and sending `session.folder` for it would broadcast a listing nobody asked for to every device
 * of the owner.
 *
 * The highlight drawn during a drag is this same function, which is why the section under the
 * finger only lights up when letting go would actually do something.
 */
export function fileDrop(
  thread: Pick<SessionSummary, 'threadId' | 'folderId'>,
  target: Pick<ListLine, 'folderId'> | undefined,
): { kind: 'file'; threadId: string; folderId: string | null } | null {
  if (!target) return null;
  if ((thread.folderId ?? null) === target.folderId) return null;
  return { kind: 'file', threadId: thread.threadId, folderId: target.folderId };
}

/**
 * What a drop would do, whichever thing was picked up. The two carry different payloads -- one
 * conversation to file, or a whole order to keep -- and the drop machinery only ever needs to know
 * which section a release acts on.
 */
export type DropMove =
  | { kind: 'file'; threadId: string; folderId: string | null }
  | { kind: 'reorder'; order: string[]; targetId: string };

/** The section a move acts on: what lights up while the finger is over it. */
export function targetOf(move: DropMove): string | null {
  return move.kind === 'file' ? move.folderId : move.targetId;
}

/**
 * Whether two moves are the same move, so a finger moving inside one section does not re-render
 * the list: the section it acts on decides both payloads, and every line of a section is that
 * section.
 */
export function sameDrop(left: DropMove | null, right: DropMove | null): boolean {
  if (left === null || right === null) return left === right;
  return left.kind === right.kind && targetOf(left) === targetOf(right);
}

/**
 * Where a dragged folder lands when it is let go over another one.
 *
 * The dragged folder takes the place of the one it was dropped on, and the rest closes up around
 * it: that is what a list of names does when a name is moved onto another. Dropping onto the
 * section nobody filed into reorders nothing -- it is not a folder, it has no place in the order --
 * and neither does a drop that would leave the order exactly as it is, which is what dropping a
 * folder back onto its own neighbour does.
 */
export function orderDrop(
  folderId: string,
  order: string[],
  target: Pick<ListLine, 'folderId'> | undefined,
): { kind: 'reorder'; order: string[]; targetId: string } | null {
  if (!order.includes(folderId)) return null;
  const targetId = target?.folderId ?? null;
  // The section nobody filed into is not a folder: it has no place in an order of folders.
  if (targetId === null || targetId === folderId || !order.includes(targetId)) return null;
  const next = order.filter(id => id !== folderId);
  next.splice(next.indexOf(targetId), 0, folderId);
  // Dropping a folder onto its own neighbour is where it already is, and broadcasting the order it
  // already has would be a listing nobody asked for on every device of the owner.
  if (next.every((id, index) => id === order[index])) return null;
  return { kind: 'reorder', order: next, targetId };
}

