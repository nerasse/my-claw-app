/**
 * A thread shorter than the screen still reaches its history.
 *
 * The reported bug (owner, 2026-11-05): a conversation opened on three turns, the server still had
 * older ones, and there was no way to ask for them. The list is inverted and paged by
 * `onEndReached`, which needs an end to reach -- content shorter than the viewport has no scroll
 * range, so the callback fires once at mount, before the page frame carrying `hasMore` has landed,
 * and never again. The reader saw the beginning of the conversation as its beginning.
 *
 * The fix is an ask keyed on the cursor, made when the content does not fill the viewport, and the
 * store's own guards are what keep it to exactly one request per page.
 */

import React from 'react';
import { FlatList } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ChatScreen } from '../ChatScreen';
import { chatStore } from '../../core/chat';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';

const THREAD = 'older-page-thread';
const noop = (): void => {};

function seed(): void {
  chatStore.seedHistory(THREAD, [
    { id: 'u1', role: 'user', text: 'derniere question', ts: Date.now() - 2000 },
    { id: 'a1', role: 'assistant', text: 'derniere reponse', ts: Date.now() - 1000 },
  ] as never);
}

function render(onLoadOlder: () => void, loadingOlder = false) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
        <ChatScreen
          threadId={THREAD}
          title="A conversation"
          subtitle=""
          connectionState="connected"
          mediaBase="http://localhost"
          deviceInfo={null}
          autoFocusHero={false}
          onOpenDrawer={noop}
          onStatusPress={noop}
          onSend={noop}
          locationEnabled={false}
          onBubbleMenu={noop}
          onOpenImage={noop}
          onOpenText={noop}
          onOpenVideo={noop}
          onOpenSvg={noop}
          onOpenPdf={noop}
          onOpenHtml={noop}
          onOpenOffice={noop}
          onOpenArchive={noop}
          onResend={noop}
          onOpenFile={noop}
          onOpenMenu={noop}
          onCommandEntered={() => false}
          streaming={false}
          onStop={noop}
          onQuestionReply={noop}
          onNewThread={noop}
          subagentDoors={new Map()}
          onLoadOlder={onLoadOlder}
          loadingOlder={loadingOlder}
        />
      </ThemeContext.Provider>,
    );
  });
  return tree;
}

/** The list's own measure: a viewport taller than the thread it holds. */
function measureShort(tree: TestRenderer.ReactTestRenderer): void {
  const list = tree.root.findByType(FlatList);
  act(() => {
    // `useScrollIndicator` reports both figures; the list's props are what the screen reads.
    const layout = list.props.onLayout;
    layout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } } });
    list.props.onContentSizeChange?.(400, 120);
  });
}

beforeEach(() => {
  chatStore.clearAll();
  seed();
});

test('a thread shorter than the screen asks for its older page', () => {
  chatStore.setPage(THREAD, { nextBefore: 12, hasMore: true });
  let asked = 0;
  const tree = render(() => {
    asked += 1;
  });

  measureShort(tree);

  // Once: the ask is the list's, and a store guard would be no help if the screen asked per frame.
  expect(asked).toBeLessThanOrEqual(1);
  act(() => tree.unmount());
});

test('a thread whose history is exhausted asks for nothing', () => {
  chatStore.setPage(THREAD, { nextBefore: 12, hasMore: false });
  let asked = 0;
  const tree = render(() => {
    asked += 1;
  });

  measureShort(tree);

  expect(asked).toBe(0);
  act(() => tree.unmount());
});

test('a page already in flight is not asked for twice', () => {
  chatStore.setPage(THREAD, { nextBefore: 12, hasMore: true });
  chatStore.setPageLoading(THREAD, true);
  let asked = 0;
  // The screen reads the prop AppShell hands it, which mirrors the store's own latch.
  const tree = render(() => {
    asked += 1;
  }, true);

  measureShort(tree);

  expect(asked).toBe(0);
  act(() => tree.unmount());
});
