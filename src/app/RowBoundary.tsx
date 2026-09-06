import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { recordDiag } from '../core/diagnostics';

interface Props {
  /** Named in the report, so a broken row can be found without symbolicating a stack. */
  itemId: string;
  children: React.ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * One row of the conversation, isolated.
 *
 * The screen has a boundary of its own, and it is the wrong granularity: a bubble that throws --
 * a tool card with no `args`, a viewer choking on content the server sent -- took the whole
 * conversation with it and left the owner on a crash page, unable to read the forty messages that
 * render perfectly well. And since the item is in the store, reopening the thread hit the same
 * item again.
 *
 * The fallback is deliberately plain: no theme, no shared component. Whatever broke this row may
 * be the very thing a richer fallback would depend on.
 */
export class RowBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    recordDiag({
      kind: 'render',
      at: Date.now(),
      message: `row ${this.props.itemId}: ${error?.message ?? String(error)}`,
      stack: `${error?.stack ?? ''}\n--- component stack ---${info.componentStack ?? ''}`,
    });
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.root}>
        <Text style={styles.text}>This message could not be displayed.</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { paddingVertical: 10, paddingHorizontal: 14 },
  text: { color: '#8e8e96', fontSize: 13, fontStyle: 'italic' },
});
