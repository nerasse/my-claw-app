import React, { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlatList, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { ChatRow } from '../core/runRows';
import { NEAR_NEWEST_PX } from '../core/threadScroll';
import { useScrollIndicator } from './ScrollIndicator';
import type { ThreadListProps } from './threadListTypes';

// The native anchor compares against an offset it has already corrected, not the reader's intent.
const FOLLOW_THRESHOLD = 2_147_483_647;

export function ThreadList({
  ref, rows, rowKey, renderRow, contentStyle, olderEnd, newestEnd, page, onLoadOlder, onAtNewest,
}: ThreadListProps): React.JSX.Element {
  const list = useRef<FlatList<ChatRow>>(null);
  const offset = useRef(0);
  const lastViewport = useRef<number | undefined>(undefined);
  const [following, setFollowing] = useState(true);
  const [measure, setMeasure] = useState<{ viewport: number; content: number }>();
  const data = useMemo(() => [...rows].reverse(), [rows]);
  const renderItem = useCallback(({ item }: { item: ChatRow }) => renderRow(item), [renderRow]);
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
    onAtNewest(offset.current <= NEAR_NEWEST_PX);
  }, [onAtNewest]);
  const endGesture = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setFollowing(event.nativeEvent.contentOffset.y <= NEAR_NEWEST_PX);
  }, []);
  const { indicator, scrollProps } = useScrollIndicator({
    inverted: true,
    onScroll: handleScroll,
    onScrollEndDrag: endGesture,
    onMomentumScrollEnd: endGesture,
    onMeasure: setMeasure,
  });

  useImperativeHandle(ref, () => ({
    getOffset: () => offset.current,
    scrollTo: position => list.current?.scrollToOffset({ offset: position, animated: true }),
    scrollToNewest: animated => {
      setFollowing(true);
      onAtNewest(true);
      list.current?.scrollToOffset({ offset: 0, animated });
    },
  }), [onAtNewest]);

  const viewport = measure?.viewport;
  useLayoutEffect(() => {
    if (viewport !== undefined && lastViewport.current !== undefined && viewport < lastViewport.current && following) {
      list.current?.scrollToOffset({ offset: 0, animated: false });
    }
    lastViewport.current = viewport;
  }, [following, viewport]);

  useEffect(() => {
    if (!page.hasMore || page.loading || page.failed || !measure) return;
    const overflow = measure.content - measure.viewport;
    if (overflow <= 1 || (page.countOnly && overflow - offset.current <= 1)) onLoadOlder();
  }, [measure, onLoadOlder, page]);

  return (
    <>
      <FlatList
        ref={list}
        {...scrollProps}
        inverted
        scrollsChildToFocus={false}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
          ...(following ? { autoscrollToTopThreshold: FOLLOW_THRESHOLD } : {}),
        }}
        data={data}
        keyExtractor={rowKey}
        contentContainerStyle={contentStyle}
        keyboardShouldPersistTaps="handled"
        renderItem={renderItem}
        ListHeaderComponent={newestEnd}
        ListFooterComponent={olderEnd}
        onEndReached={onLoadOlder}
        onEndReachedThreshold={0.4}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={11}
      />
      {indicator}
    </>
  );
}
