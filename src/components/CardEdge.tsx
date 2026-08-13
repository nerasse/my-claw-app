import React from 'react';
import { View } from 'react-native';
import { radius, space, useThemedStyles, type Palette } from '../theme';

/**
 * The bordered, rounded card a settings list is drawn in — but painted one row at a time.
 *
 * Drawn the obvious way, as a single View wrapped around the rows, the card forces every row to
 * be mounted: a virtualized list inside it would have nothing to virtualize, because the card
 * itself is what holds the children. Moving the border onto the rows lets the list own its own
 * scroll range, so a catalogue of hundreds costs the dozen rows actually on screen. The seam is
 * invisible: the first row carries the top edge, the last one the bottom, and the separator
 * rides with the row below it exactly as it did inside the card.
 */
export function CardEdge({
  first,
  last,
  danger = false,
  children,
}: {
  first: boolean;
  last: boolean;
  /** The "no longer exists" card, which is outlined in red rather than in the border colour. */
  danger?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View
      style={[
        styles.edge,
        danger && styles.edgeDanger,
        first && styles.first,
        last && styles.last,
      ]}>
      {first ? null : <View style={[styles.separator, danger && styles.separatorDanger]} />}
      {children}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  edge: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  edgeDanger: { borderColor: palette.danger },
  first: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  last: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  separator: { height: 1, backgroundColor: palette.border, marginLeft: space.md },
  separatorDanger: { backgroundColor: palette.danger },
});
