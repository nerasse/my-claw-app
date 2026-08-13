/**
 * @format
 */

import React from 'react';
import { FlatList, Text, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { useScrollIndicator } from '../src/components/ScrollIndicator';
import { ThemeProvider } from '../src/theme/ThemeProvider';

function Host({ rows, inverted = false }: { rows: number[]; inverted?: boolean }): React.JSX.Element {
  const { scrollProps, indicator } = useScrollIndicator({ inverted });
  return (
    <View>
      <FlatList
        {...scrollProps}
        inverted={inverted}
        data={rows}
        keyExtractor={item => String(item)}
        renderItem={({ item }) => <Text>{item}</Text>}
        accessibilityLabel="host list"
      />
      {indicator}
    </View>
  );
}

function renderHost(rows: number[], inverted = false): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeProvider>
        <Host rows={rows} inverted={inverted} />
      </ThemeProvider>,
    );
  });
  return tree;
}

function listProps(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root.find(node => node.props.accessibilityLabel === 'host list').props;
}

function act(fn: () => void): void {
  ReactTestRenderer.act(() => fn());
}

test('the native scrollbar is off and the custom bar appears only when content overflows', async () => {
  const tree = renderHost([1, 2, 3]);

  // Nothing measured yet: no indicator, and the system indicator is off.
  expect(listProps(tree).showsVerticalScrollIndicator).toBe(false);
  expect(
    tree.root.findAll(node => node.props.testID === 'scroll-indicator-thumb', { deep: true }),
  ).toHaveLength(0);

  act(() => {
    listProps(tree).onLayout({ nativeEvent: { layout: { height: 400 } } });
    listProps(tree).onContentSizeChange(100, 2000);
  });

  // 400px window over 2000px of content: the thumb shrinks to a fifth of the track. The
  // Animated wrapper mirrors the testID onto its host view, so a presence count is enough.
  const thumbs = tree.root.findAll(
    node => node.props.testID === 'scroll-indicator-thumb',
    { deep: true },
  );
  expect(thumbs.length).toBeGreaterThan(0);
  const style = (thumbs[0]!.props.style as unknown[]).find(
    entry => entry && typeof entry === 'object' && 'height' in entry,
  ) as { height: number };
  expect(style.height).toBe(80);

  // Content that fits the window is not scrollable: the bar must not exist.
  act(() => {
    listProps(tree).onContentSizeChange(100, 300);
  });
  expect(
    tree.root.findAll(node => node.props.testID === 'scroll-indicator-thumb', { deep: true }),
  ).toHaveLength(0);

  await ReactTestRenderer.act(async () => tree.unmount());
});

function translateYOf(tree: ReactTestRenderer.ReactTestRenderer): number {
  const thumb = tree.root.find(node => node.props.testID === 'scroll-indicator-thumb');
  return (thumb.props.style as unknown[]).reduce((acc: number, entry: unknown) => {
    if (!entry || typeof entry !== 'object') return acc;
    const transform = (entry as { transform?: unknown[] }).transform;
    if (!transform) return acc;
    for (const op of transform) {
      const translation = (op as { translateY?: { __getValue: () => number } }).translateY;
      if (translation) return translation.__getValue();
    }
    return acc;
  }, 0);
}

test('the thumb rides the scroll offset between the top and the bottom', async () => {
  const tree = renderHost([1, 2, 3]);
  act(() => {
    listProps(tree).onLayout({ nativeEvent: { layout: { height: 400 } } });
    listProps(tree).onContentSizeChange(100, 2000);
  });

  const translateY = () => translateYOf(tree);

  // Halfway through 1600px of travel: the thumb has covered half of its 320px of room.
  act(() => {
    listProps(tree).onScroll({ nativeEvent: { contentOffset: { y: 800 } } });
  });
  expect(translateY()).toBeCloseTo(160, 0);

  act(() => {
    listProps(tree).onScroll({ nativeEvent: { contentOffset: { y: 2000 } } });
  });
  // Past the end: clamped to the last position, never past the bottom.
  expect(translateY()).toBeCloseTo(320, 0);

  act(() => {
    listProps(tree).onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
  });
  expect(translateY()).toBeCloseTo(0, 0);

  await ReactTestRenderer.act(async () => tree.unmount());
});

test('on an inverted list the thumb runs the other way, because offset 0 is the bottom', async () => {
  const tree = renderHost([1, 2, 3], true);
  act(() => {
    listProps(tree).onLayout({ nativeEvent: { layout: { height: 400 } } });
    listProps(tree).onContentSizeChange(100, 2000);
  });

  // Offset 0 on an inverted list is the newest message, at the bottom of the screen. The bar is
  // a sibling of the list, so it is outside the flip the list applies to itself and has to be
  // told: drawn the normal way it points at the top while the reader sits at the bottom.
  act(() => {
    listProps(tree).onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
  });
  expect(translateYOf(tree)).toBeCloseTo(320, 0);

  act(() => {
    listProps(tree).onScroll({ nativeEvent: { contentOffset: { y: 800 } } });
  });
  expect(translateYOf(tree)).toBeCloseTo(160, 0);

  // Scrolled all the way back through the history: the bar has reached the top of its track.
  act(() => {
    listProps(tree).onScroll({ nativeEvent: { contentOffset: { y: 2000 } } });
  });
  expect(translateYOf(tree)).toBeCloseTo(0, 0);

  await ReactTestRenderer.act(async () => tree.unmount());
});
