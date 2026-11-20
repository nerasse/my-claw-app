import type { ReactElement, Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { HistoryPage } from '../core/chat';
import type { ChatRow } from '../core/runRows';

export interface ThreadListHandle {
  scrollToNewest(animated: boolean): void;
  scrollTo(offset: number): void;
  getOffset(): number;
}

export interface ThreadListProps {
  ref?: Ref<ThreadListHandle>;
  rows: ChatRow[];
  rowKey: (row: ChatRow) => string;
  renderRow: (row: ChatRow) => ReactElement;
  contentStyle: StyleProp<ViewStyle>;
  opening: ReactElement;
  olderEnd: ReactElement;
  newestEnd: ReactElement | null;
  page: HistoryPage;
  onLoadOlder: () => void;
  onAtNewest: (atNewest: boolean) => void;
}
