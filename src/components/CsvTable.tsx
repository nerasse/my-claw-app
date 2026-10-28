import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { parseDelimited } from '../core/delimited';
import { font, space, useThemedStyles, type Palette } from '../theme';

/**
 * A delimited file as a table.
 *
 * A CSV in the code reader is technically readable and practically not: the point of the format is
 * the columns, and a phone shows a phone's worth of them. The first row is the header (every
 * writer means that), the rest scrolls, and columns are capped rather than shrunk -- a 40-column
 * export stays legible by panning instead of by becoming 3px wide.
 */
const MAX_COLUMNS = 12;
const COLUMN_WIDTH = 132;

export function CsvTable({ value }: { value: string }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const table = useMemo(() => parseDelimited(value), [value]);
  const columns = Math.max(...table.rows.map((row) => row.length), 1);
  const shown = Math.min(columns, MAX_COLUMNS);
  const [header, ...body] = table.rows;

  return (
    <ScrollView style={styles.wrapper} contentContainerStyle={styles.content}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          {header ? (
            <View style={[styles.row, styles.headerRow]}>
              {Array.from({ length: shown }, (_, index) => (
                <Text key={index} style={[styles.cell, styles.headerCell]} numberOfLines={1}>
                  {header[index] ?? ''}
                </Text>
              ))}
            </View>
          ) : null}
          {body.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.row}>
              {Array.from({ length: shown }, (_, index) => (
                <Text key={index} style={styles.cell} numberOfLines={1}>
                  {row[index] ?? ''}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      <Text style={styles.foot}>
        {table.rows.length} row{table.rows.length > 1 ? 's' : ''}
        {columns > shown ? ` · ${columns} columns, ${shown} shown` : ''}
        {table.truncated ? ' · cut for display' : ''}
      </Text>
    </ScrollView>
  );
}

const createStyles = (palette: Palette) => ({
  wrapper: { flex: 1, minHeight: 0, backgroundColor: palette.bg },
  content: { padding: space.md, paddingBottom: space.xl },
  row: {
    flexDirection: 'row' as const,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  headerRow: { borderBottomWidth: 1, borderBottomColor: palette.textFaint },
  headerCell: { fontWeight: '700' as const, color: palette.text },
  cell: {
    width: COLUMN_WIDTH,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    fontSize: font.small,
    color: palette.text,
  },
  foot: {
    marginTop: space.md,
    fontSize: font.small,
    color: palette.textFaint,
    textAlign: 'center' as const,
  },
});
