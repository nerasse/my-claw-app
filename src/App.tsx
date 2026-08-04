import React, { useEffect, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { connection } from './core/connection';
import { getAccessibilitySnapshot, getCapabilities } from './core/device';
import type { AccessibilityNode, Capabilities, WsStatusPayload } from './core/types';

const DEFAULT_URL = 'wss://vps.my-tailnet.ts.net/mobile';

function App(): React.JSX.Element {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [status, setStatus] = useState<WsStatusPayload>({ state: 'idle' });
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [snapshotNodes, setSnapshotNodes] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const offState = connection.onState(state => {
      setStatus(state);
      pushLog(`ws: ${state.state}${state.reason ? ` (${state.reason})` : ''}`);
    });
    const offMessage = connection.onMessage(text => pushLog(`in: ${text}`));
    getCapabilities().then(setCaps).catch(() => pushLog('capabilities unavailable'));
    connection.getState().then(state => setStatus({ state }));
    return () => {
      offState();
      offMessage();
    };
  }, []);

  function pushLog(line: string) {
    setLog(prev => [...prev, line].slice(-100));
  }

  async function snapshot() {
    try {
      const root = await getAccessibilitySnapshot();
      setSnapshotNodes(root === null ? 0 : countNodes(root));
      pushLog(root === null ? 'accessibility: no window' : 'accessibility: snapshot ok');
    } catch (err) {
      pushLog(`accessibility: ${String(err)}`);
    }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <Text style={styles.title}>MyClaw</Text>

          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="wss://server/mobile"
          />

          <View style={styles.row}>
            <View style={styles.button}>
              <Button title="Connect" onPress={() => connection.connect(url)} disabled={status.state === 'connecting' || status.state === 'connected'} />
            </View>
            <View style={styles.button}>
              <Button title="Disconnect" onPress={() => connection.disconnect()} disabled={status.state !== 'connected' && status.state !== 'connecting'} />
            </View>
          </View>

          <Text style={styles.status}>state: {status.state}{status.attempts ? ` (retry ${status.attempts})` : ''}</Text>

          <View style={styles.row}>
            <View style={styles.button}>
              <Button title="Snapshot" onPress={snapshot} />
            </View>
          </View>
          {caps && (
            <Text style={styles.status}>
              accessibility: {caps.accessibility ? 'on' : 'off'} | notifications: {caps.notificationListener ? 'on' : 'off'}{snapshotNodes !== null ? ` | nodes: ${snapshotNodes}` : ''}
            </Text>
          )}

          <ScrollView style={styles.log}>
            {log.map((line, i) => (
              <Text key={i} style={styles.logLine}>{line}</Text>
            ))}
          </ScrollView>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function countNodes(node: AccessibilityNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: { flexDirection: 'row', gap: 12 },
  button: { flex: 1 },
  status: { fontSize: 13, color: '#555' },
  log: { flex: 1, backgroundColor: '#f6f6f6', borderRadius: 8, padding: 8 },
  logLine: { fontSize: 12, fontFamily: 'monospace', marginBottom: 2 },
});

export default App;
