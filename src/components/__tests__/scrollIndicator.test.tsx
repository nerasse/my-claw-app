/**
 * The scrollbar a list gets, and who draws it.
 *
 * The owner's report: on the web the thread's bar was a 3pt thumb that could not be dragged or
 * clicked, because the list hid the platform's own. A browser bar is a real control -- drag, click
 * to page, keyboard, assistive tech -- so `systemBar` hands the job back to the platform and draws
 * nothing. Everywhere else the system bar is an overlay painted over the rows, so it stays hidden
 * and the themed thumb is what the reader gets.
 */

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { useScrollIndicator } from '../ScrollIndicator';

function Probe({ systemBar }: { systemBar?: boolean }): React.JSX.Element {
  const { scrollProps, indicator } = useScrollIndicator({ systemBar });
  return (
    <View>
      <View testID="list" {...scrollProps} />
      {indicator}
    </View>
  );
}

function mount(systemBar?: boolean) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<Probe systemBar={systemBar} />);
  });
  const list = tree.root.findByProps({ testID: 'list' });
  // A viewport and content that overflow: the state a bar exists for.
  act(() => {
    (list.props.onLayout as (event: unknown) => void)({
      nativeEvent: { layout: { height: 400, width: 300 } },
    });
    (list.props.onContentSizeChange as (w: number, h: number) => void)(300, 2000);
  });
  return tree;
}

describe('useScrollIndicator', () => {
  it('leaves the platform bar alone, and draws nothing of its own, under systemBar', () => {
    const tree = mount(true);
    expect(tree.root.findByProps({ testID: 'list' }).props.showsVerticalScrollIndicator).toBe(true);
    expect(tree.root.findAllByProps({ testID: 'scroll-indicator-thumb' })).toHaveLength(0);
  });

  it('hides the platform bar and draws the themed thumb everywhere else', () => {
    const tree = mount(false);
    expect(tree.root.findByProps({ testID: 'list' }).props.showsVerticalScrollIndicator).toBe(false);
    expect(tree.root.findAllByProps({ testID: 'scroll-indicator-thumb' }).length).toBeGreaterThan(0);
  });
});
