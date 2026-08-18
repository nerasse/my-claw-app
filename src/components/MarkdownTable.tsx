import React, { type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

/**
 * A markdown table that fits the width it is given.
 *
 * react-native-marked hands every column a hard `windowWidth * 1.3 / 3` and puts the result in a
 * horizontal ScrollView (`utils/table.ts`), so a two-column table of yes/no was 86% of the screen
 * of mostly nothing, and a four-column one had to be dragged sideways inside a chat list that is
 * already inverted and vertically scrollable. Neither is a width the content asked for.
 *
 * Here the columns share the available width in proportion to what they hold, cells wrap, and a
 * wide table grows down instead of sideways.
 */

/** Column weights are character counts, clamped: one long cell must not starve its neighbours. */
const MIN_WEIGHT = 4;
const MAX_WEIGHT = 24;

/** The text a cell will draw, whatever nesting the inline renderer wrapped it in. */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

/** How wide each column wants to be, relative to the others. */
export function columnWeights(header: ReactNode[][], rows: ReactNode[][][]): number[] {
  const columns = [header, ...rows].reduce((max, row) => Math.max(max, row.length), 0);
  return Array.from({ length: columns }, (_unused, index) => {
    const longest = [header, ...rows].reduce((max, row) => Math.max(max, textOf(row[index]).length), 0);
    return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, longest));
  });
}

export function MarkdownTable({
  header,
  rows,
  tableStyle,
  rowStyle,
  cellStyle,
}: {
  header: ReactNode[][];
  rows: ReactNode[][][];
  tableStyle?: ViewStyle;
  rowStyle?: ViewStyle;
  cellStyle?: ViewStyle;
}): React.JSX.Element {
  const weights = columnWeights(header, rows);
  const all = [header, ...rows];
  return (
    <View style={tableStyle}>
      {all.map((cells, rowIndex) => (
        <View
          key={rowIndex}
          style={[
            styles.row,
            rowStyle,
            // The header is told apart by its rule alone: a tint would have to know which
            // surface the table sits on, and the same sheet serves a bubble and a document.
            rowIndex === 0 ? styles.headerRow : null,
            rowIndex === all.length - 1 ? styles.lastRow : null,
          ]}>
          {cells.map((cell, cellIndex) => (
            <View
              key={cellIndex}
              style={[cellStyle, { flex: weights[cellIndex] ?? MIN_WEIGHT }, cellIndex === cells.length - 1 ? styles.lastCell : null]}>
              {cell}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  headerRow: { borderBottomWidth: 2 },
  // The container draws the outer frame; a border here would double it.
  lastRow: { borderBottomWidth: 0 },
  lastCell: { borderRightWidth: 0 },
});
