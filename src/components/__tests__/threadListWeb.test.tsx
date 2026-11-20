import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { ThreadList } from '../ThreadList.web';
import type { HistoryPage } from '../../core/chat';

const page: HistoryPage = { nextBefore: 0, hasMore: false, loading: false, loaded: true, oldestId: null };

// The reading column is centred by `alignSelf`, as it was inside a ScrollView. Under a block
// scroller it sat against the left edge of a wide pane while the composer stayed centred.
test('the scroller lays its column out as a flex column, so the column can centre itself', () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThreadList
        rows={[]}
        rowKey={() => 'row'}
        renderRow={() => <Text>row</Text>}
        contentStyle={{ maxWidth: 1200, width: '100%', alignSelf: 'center' }}
        opening={<Text>opening</Text>}
        olderEnd={<Text>older</Text>}
        newestEnd={null}
        page={page}
        onLoadOlder={() => {}}
        onAtNewest={() => {}}
      />,
    );
  });
  const scroller = tree.root.find(node => node.props['data-testid'] === 'thread-scroll');
  expect(scroller.props.style).toMatchObject({ display: 'flex', flexDirection: 'column' });
  ReactTestRenderer.act(() => tree.unmount());
});
