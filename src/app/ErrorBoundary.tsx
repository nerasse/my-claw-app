import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { recordDiag } from '../core/diagnostics';

interface Props {
  children: React.ReactNode;
}

interface State {
  message?: string;
  stack?: string;
}

/**
 * Without this, an exception thrown in any render unmounts the tree and leaves a **white screen**
 * in a release build, with nothing written anywhere. The most likely trigger is a viewer parsing
 * content that came from the server, which is exactly the case worth keeping a trace of.
 *
 * The fallback deliberately uses no theme, no context and no custom component: whatever broke the
 * tree may be the very thing the fallback would depend on.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { message: error?.message ?? String(error), stack: error?.stack };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    recordDiag({
      kind: 'render',
      at: Date.now(),
      message: error?.message ?? String(error),
      stack: `${error?.stack ?? ''}\n--- component stack ---${info.componentStack ?? ''}`,
    });
  }

  render(): React.ReactNode {
    if (this.state.message === undefined) return this.props.children;
    return (
      <View style={styles.root}>
        <Text style={styles.title}>my-claw a planté</Text>
        <Text style={styles.message}>{this.state.message}</Text>
        <Text style={styles.hint}>
          Le rapport est enregistré et sera envoyé à l'agent à la prochaine connexion. Redémarre
          l'app.
        </Text>
        <ScrollView style={styles.stackBox}>
          <Text style={styles.stack}>{this.state.stack ?? ''}</Text>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1b1b1f', padding: 20, paddingTop: 60 },
  title: { color: '#ff6b6b', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  message: { color: '#f2f2f7', fontSize: 15, marginBottom: 12 },
  hint: { color: '#a0a0a8', fontSize: 13, marginBottom: 16 },
  stackBox: { flex: 1 },
  stack: { color: '#8e8e96', fontSize: 11, fontFamily: 'monospace' },
});
