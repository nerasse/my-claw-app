import React from 'react';
import { View } from 'react-native';
import { CopyButton } from './CopyButton';
import { useThemedStyles, type Palette } from '../theme';

/**
 * How a quote is taken whole, in the idiom of the strip over a fenced block: a 'copy' where the
 * thing it copies is.
 *
 * Pinned inside the quote's top-right corner rather than drawn as a row above it. As a row it cost
 * the quote a whole line of empty height, which read as a gap between the bar and the words: the
 * POC reserves the corner with a padding-right on the quote and floats the button in it (measured
 * 2026-11-04). Overlaying the text is not the risk here it is on a code block's first line -- the
 * quote's own padding keeps that lane free. What it copies is the quote's text, not its markdown:
 * see `quoteText`.
 */
export function QuoteBar({ value }: { value: string }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.bar}>
      <CopyButton value={value} accessibilityLabel="Copy quote" />
    </View>
  );
}

const createStyles = (_palette: Palette) => ({
  bar: { position: 'absolute' as const, top: 2, right: 2 },
});
