import React from 'react';
import { View } from 'react-native';
import { CopyButton } from './CopyButton';
import { space, useThemedStyles, type Palette } from '../theme';

/**
 * How a quote is taken whole, in the idiom of the strip over a fenced block: a 'copy' in the
 * block, where the thing it copies is.
 *
 * Drawn as the quote's first row, right-aligned, rather than floating over the text: a floating
 * button on a long first line covers the words it is offering (the same call as `CodeBlockBar`,
 * docs/markdown-blocks.md). What it copies is the quote's text, not its markdown -- see
 * `quoteText`.
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
  bar: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const, marginBottom: space.xs },
});
