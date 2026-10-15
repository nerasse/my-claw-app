import Decimal from '@jsamr/counter-style/presets/decimal';
import Disc from '@jsamr/counter-style/presets/disc';
import { MarkedListItem, useMarkedList } from '@jsamr/react-native-li';
import React, { Fragment, type ReactNode } from 'react';
import type { TextStyle, ViewStyle } from 'react-native';

/**
 * The library's list, with the markers inked on their own (owner, 2026-10-15: the rendered
 * markdown read as one monotone block). The bullet is the one span of a list that is furniture
 * rather than content, so it is the one allowed to leave the body ink; `react-native-marked`
 * draws it with the item's own text style instead, which is why this replaces `MDList` the way
 * `MarkdownTable` replaces the library's table.
 *
 * Same engine underneath (`@jsamr/react-native-li`), only the marker colour differs, so nesting
 * depth, numbering and start indices behave exactly as before.
 */
export function MarkdownList({
  ordered,
  li,
  listStyle,
  textStyle,
  markerColor,
  startIndex,
}: {
  ordered: boolean;
  li: ReactNode[];
  listStyle?: ViewStyle;
  textStyle?: TextStyle;
  markerColor?: string;
  startIndex?: number;
}): React.JSX.Element {
  const listProps = useMarkedList({
    counterRenderer: ordered ? Decimal : Disc,
    startIndex,
    markerTextStyle: markerColor ? { ...textStyle, color: markerColor } : textStyle,
    markerBoxStyle: listStyle,
    length: li.length,
  });

  return (
    <Fragment>
      {li.map((node, index) => (
        <MarkedListItem key={index} index={index} {...listProps}>
          {node}
        </MarkedListItem>
      ))}
    </Fragment>
  );
}
