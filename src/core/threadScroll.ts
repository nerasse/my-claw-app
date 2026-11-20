import type { ChatRow } from './runRows';

export const NEAR_NEWEST_PX = 120;
export const HISTORY_GUTTER = 44;

// Prepending within the same day moves its divider to the new first message. Anchoring to the
// divider itself leaves the reader at offset zero instead of preserving their first message.
export function threadCells(rows: readonly ChatRow[]): { row: ChatRow; day?: ChatRow }[] {
  const cells: { row: ChatRow; day?: ChatRow }[] = [];
  let day: ChatRow | undefined;
  for (const row of rows) {
    if (row.kind === 'day') day = row;
    else {
      cells.push({ row, day });
      day = undefined;
    }
  }
  return cells;
}
