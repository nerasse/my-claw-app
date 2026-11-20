/// <reference lib="dom" />
import React, { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { observeElementRect, useVirtualizer } from '@tanstack/react-virtual';
import { View } from 'react-native';
import { space } from '../theme';
import { HISTORY_GUTTER, threadCells } from '../core/threadScroll';
import type { ThreadListProps } from './threadListTypes';

const AT_END_PX = 2;
const FOOTER_KEY = 'thread:footer';
const estimateSize = () => 96;
const surface: React.CSSProperties = {
  position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden',
  overflowAnchor: 'none', overscrollBehaviorY: 'contain',
};
const hiddenSurface: React.CSSProperties = { ...surface, visibility: 'hidden' };
const unpaddedColumn = { paddingTop: 0, paddingBottom: 0 };
const sizer: React.CSSProperties = { position: 'relative', width: '100%' };
const cell: React.CSSProperties = { position: 'absolute', top: 0, left: 0, width: '100%' };

function atEnd(element: HTMLElement): boolean {
  return element.scrollHeight - element.clientHeight - element.scrollTop <= AT_END_PX;
}

export function ThreadList({
  ref, rows, rowKey, renderRow, contentStyle, olderEnd, newestEnd, opening, page, onLoadOlder, onAtNewest,
}: ThreadListProps): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null);
  const lastTop = useRef(0);
  const atNewest = useRef(true);
  const [ready, setReady] = useState(false);
  const cells = useMemo(() => threadCells(rows), [rows]);
  const count = cells.length + (newestEnd ? 1 : 0);
  const getScrollElement = useCallback(() => scroller.current, []);
  const getItemKey = useCallback((index: number) => {
    const item = cells[index];
    return item ? rowKey(item.row) : FOOTER_KEY;
  }, [cells, rowKey]);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement,
    getItemKey,
    estimateSize,
    overscan: 8,
    paddingStart: space.sm + HISTORY_GUTTER,
    paddingEnd: space.md,
    anchorTo: 'end',
    followOnAppend: true,
    scrollEndThreshold: AT_END_PX,
    directDomUpdates: true,
    directDomUpdatesMode: 'position',
    observeElementRect: (instance, update) => {
      let height: number | undefined;
      return observeElementRect(instance, rect => {
        const shrank = height !== undefined && rect.height < height;
        height = rect.height;
        update(rect);
        if (shrank && atNewest.current) instance.scrollToEnd();
      });
    },
  });
  const visibleRows = virtualizer.getVirtualItems();

  useImperativeHandle(ref, () => ({
    getOffset: () => scroller.current?.scrollTop ?? 0,
    scrollTo: offset => virtualizer.scrollToOffset(offset),
    scrollToNewest: animated => virtualizer.scrollToEnd({ behavior: animated ? 'smooth' : 'auto' }),
  }), [virtualizer]);

  useLayoutEffect(() => { virtualizer.scrollToEnd(); }, [virtualizer]);

  // An estimated range is not a landing. Reveal only after the last row is mounted and the
  // actual scroll element is at its end. ResizeObserver keeps the same anchor on later growth.
  const reveal = useCallback(() => {
    const element = scroller.current;
    if (ready || !element || element.clientHeight === 0 || !atEnd(element)) return;
    if (count > 0 && !virtualizer.elementsCache.has(getItemKey(count - 1))) return;
    lastTop.current = element.scrollTop;
    setReady(true);
  }, [count, getItemKey, ready, virtualizer]);
  useLayoutEffect(reveal, [reveal, visibleRows]);

  const askOlder = useCallback(() => {
    if (ready && page.hasMore && !page.loading && !page.failed) onLoadOlder();
  }, [onLoadOlder, page, ready]);

  useEffect(() => {
    const element = scroller.current;
    if (!element || element.clientHeight === 0) return;
    const fits = element.scrollHeight <= element.clientHeight + AT_END_PX;
    if (fits || (page.countOnly && element.scrollTop <= AT_END_PX)) askOlder();
  }, [askOlder, page.countOnly, visibleRows]);

  return (
    <>
      <div
        ref={scroller}
        data-testid="thread-scroll"
        role="region"
        aria-label="Conversation messages"
        aria-hidden={!ready || undefined}
        tabIndex={ready ? 0 : -1}
        style={ready ? surface : hiddenSurface}
        onScroll={event => {
          if (!ready) {
            reveal();
            return;
          }
          const element = event.currentTarget;
          const offset = element.scrollTop;
          const movingUp = offset < lastTop.current;
          lastTop.current = offset;
          const newest = atEnd(element);
          if (atNewest.current !== newest) {
            atNewest.current = newest;
            onAtNewest(newest);
          }
          // One screen ahead: the page lands above the reader while they are still reading.
          if (movingUp && offset <= element.clientHeight) askOlder();
        }}
        onWheel={event => {
          if (event.deltaY < 0 && event.currentTarget.scrollTop <= AT_END_PX) askOlder();
        }}
        onKeyDown={event => {
          if (event.target !== event.currentTarget || event.currentTarget.scrollTop > AT_END_PX) return;
          if (event.key === 'Home' || event.key === 'PageUp' || event.key === 'ArrowUp') askOlder();
        }}
      >
        <View style={[contentStyle, unpaddedColumn]}>
          <div ref={virtualizer.containerRef} style={sizer}>
            <div style={{ ...cell, top: space.sm }}>{olderEnd}</div>
            {visibleRows.map(item => {
              const entry = cells[item.index];
              return (
                <div key={item.key} data-index={item.index} ref={virtualizer.measureElement} style={cell}>
                  {entry?.day ? renderRow(entry.day) : null}
                  {entry ? renderRow(entry.row) : newestEnd}
                </div>
              );
            })}
          </div>
        </View>
      </div>
      {ready ? null : opening}
    </>
  );
}
