import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, FlatList, Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { connection } from './core/connection';
import { chatStore, type ChatItem } from './core/chat';
import { encodeChatSend } from './core/protocol';
import { getAccessibilitySnapshot, getCapabilities, getDeviceInfo, type DeviceInfo } from './core/device';
import type { AccessibilityNode, Capabilities, WsStatusPayload } from './core/types';

const DEFAULT_URL = 'ws://10.10.20.10:8080/mobile';
const MAX_LOG_LINES = 100;

type Tab = 'chat' | 'console';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function httpOrigin(wsUrl: string): string {
  try {
    const url = new URL(wsUrl);
    return `http://${url.host}`;
  } catch {
    return 'http://10.10.20.10:8080';
  }
}

function App(): React.JSX.Element {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [sendText, setSendText] = useState('');
  const [status, setStatus] = useState<WsStatusPayload>({ state: 'idle' });
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [snapshotNodes, setSnapshotNodes] = useState<number | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [tab, setTab] = useState<Tab>('chat');
  const [itemsVersion, setItemsVersion] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const listRef = useRef<FlatList<ChatItem>>(null);
  const items = useMemo(() => chatStore.getItems(), [itemsVersion]);
  const connected = status.state === 'connected';
  const mediaBase = useMemo(() => httpOrigin(url), [url]);

  useEffect(() => {
    const offState = connection.onState(state => {
      setStatus(state);
      pushLog(`ws: ${state.state}${state.reason ? ` (${state.reason})` : ''}`);
    });
    const offMessage = connection.onMessage(text => pushLog(`in: ${text}`));
    const offFrame = connection.onFrame(frame => {
      switch (frame.type) {
        case 'chat.message':
          chatStore.addAgentMessage(frame.id, frame.text, frame.attachments, frame.replyToId);
          break;
        case 'chat.stream.start':
          chatStore.startStream(frame.id, frame.replyToId);
          break;
        case 'chat.stream.delta':
          chatStore.appendDelta(frame.id, frame.text);
          break;
        case 'chat.stream.done':
          chatStore.endStream(frame.id);
          break;
        case 'chat.stream.abort':
          chatStore.abortStream(frame.id, frame.error);
          break;
        case 'approval.request':
          pushLog(`approval needed: ${frame.toolName} (pas encore gere, M3)`);
          break;
        case 'error':
          pushLog(`server error: ${frame.message}`);
          break;
      }
    });
    const offStore = chatStore.subscribe(() => setItemsVersion(v => v + 1));
    getCapabilities().then(setCaps).catch(() => pushLog('capabilities unavailable'));
    getDeviceInfo().then(setDeviceInfo).catch(() => pushLog('device info unavailable'));
    connection.getState().then(state => setStatus({ state }));
    return () => {
      offState();
      offMessage();
      offFrame();
      offStore();
    };
  }, []);

  function pushLog(line: string) {
    setLog(prev => [...prev, line].slice(-MAX_LOG_LINES));
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

  function sendChat() {
    const text = sendText.trim();
    if (!text) return;
    const id = uuid();
    connection.send(encodeChatSend(id, text));
    chatStore.addUserMessage(id, text);
    pushLog(`out: ${text}`);
    setSendText('');
  }

  function sendRaw() {
    const text = sendText.trim();
    if (!text) return;
    connection.send(text);
    pushLog(`out: ${text}`);
    setSendText('');
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
              <Button title="Connect" onPress={() => connection.connect(url)} disabled={status.state === 'connecting' || connected} />
            </View>
            <View style={styles.button}>
              <Button title="Disconnect" onPress={() => connection.disconnect()} disabled={!connected && status.state !== 'connecting'} />
            </View>
            <View style={styles.button}>
              <Button title="Clear" onPress={() => chatStore.clear()} />
            </View>
          </View>

          <Text style={styles.status}>
            state: {status.state}
            {status.attempts ? ` (retry ${status.attempts})` : ''}
          </Text>
          {deviceInfo && (
            <Text style={styles.status} selectable>
              {deviceInfo.deviceId} | token: {deviceInfo.token}
            </Text>
          )}

          <View style={styles.tabs}>
            <Text style={[styles.tab, tab === 'chat' && styles.tabActive]} onPress={() => setTab('chat')}>
              Chat
            </Text>
            <Text style={[styles.tab, tab === 'console' && styles.tabActive]} onPress={() => setTab('console')}>
              Console
            </Text>
          </View>

          {tab === 'chat' ? (
            <>
              <FlatList
                ref={listRef}
                style={styles.list}
                data={items}
                keyExtractor={item => item.id}
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
                renderItem={({ item }) => (
                  <Bubble item={item} mediaBase={mediaBase} deviceInfo={deviceInfo} />
                )}
              />
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.sendInput]}
                  value={sendText}
                  onChangeText={setSendText}
                  onSubmitEditing={sendChat}
                  placeholder="message a l'agent"
                />
                <View style={styles.sendButton}>
                  <Button title="Send" onPress={sendChat} disabled={!connected} />
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.sendInput]}
                  value={sendText}
                  onChangeText={setSendText}
                  onSubmitEditing={sendRaw}
                  placeholder="texte brut (mode console)"
                />
                <View style={styles.sendButton}>
                  <Button title="Send" onPress={sendRaw} disabled={!connected} />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.button}>
                  <Button title="Snapshot" onPress={snapshot} />
                </View>
              </View>
              {caps && (
                <Text style={styles.status}>
                  accessibility: {caps.accessibility ? 'on' : 'off'} | notifications: {caps.notificationListener ? 'on' : 'off'}
                  {snapshotNodes !== null ? ` | nodes: ${snapshotNodes}` : ''}
                </Text>
              )}
              <ScrollView style={styles.log}>
                {log.map((line, i) => (
                  <Text key={i} style={styles.logLine}>{line}</Text>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Bubble({ item, mediaBase, deviceInfo }: { item: ChatItem; mediaBase: string; deviceInfo: DeviceInfo | null }): React.JSX.Element {
  const agent = item.role === 'agent';
  const cursor = item.streaming ? '▍' : '';
  return (
    <View style={[styles.bubble, agent ? styles.bubbleAgent : styles.bubbleUser]}>
      {item.attachments.map(att => (
        <AttachmentView key={att.id} att={att} mediaBase={mediaBase} deviceInfo={deviceInfo} />
      ))}
      {item.text ? <Text style={[styles.bubbleText, agent ? null : styles.bubbleTextUser]}>{item.text}{cursor}</Text> : item.streaming ? <Text style={[styles.bubbleText, agent ? null : styles.bubbleTextUser]}>{cursor}</Text> : null}
      {item.error ? <Text style={styles.bubbleError}>{item.error}</Text> : null}
    </View>
  );
}

function AttachmentView({ att, mediaBase, deviceInfo }: { att: { id: string; type: string; mimeType?: string; filename?: string }; mediaBase: string; deviceInfo: DeviceInfo | null }): React.JSX.Element {
  const uri = deviceInfo ? `${mediaBase}/media/${att.id}?device=${deviceInfo.deviceId}&token=${deviceInfo.token}` : '';
  if (att.type === 'image' && uri) {
    return <Image source={{ uri }} style={styles.attachmentImage} resizeMode="contain" />;
  }
  const label = att.filename ?? `${att.type}${att.mimeType ? ` (${att.mimeType})` : ''}`;
  return (
    <View style={styles.attachmentChip}>
      <Text style={styles.attachmentChipText}>{label}</Text>
    </View>
  );
}

function countNodes(node: AccessibilityNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, padding: 16, gap: 10 },
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
  sendInput: { flex: 1 },
  sendButton: { justifyContent: 'center' },
  status: { fontSize: 13, color: '#555' },
  tabs: { flexDirection: 'row', gap: 16, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 6 },
  tab: { fontSize: 16, color: '#888', fontWeight: '600' },
  tabActive: { color: '#0a5cff' },
  list: { flex: 1 },
  bubble: { borderRadius: 12, padding: 10, marginBottom: 8, maxWidth: '85%' },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#0a5cff' },
  bubbleAgent: { alignSelf: 'flex-start', backgroundColor: '#f0f0f0' },
  bubbleText: { fontSize: 15, color: '#111' },
  bubbleTextUser: { color: '#fff' },
  bubbleError: { fontSize: 13, color: '#b00020', marginTop: 4 },
  attachmentImage: { width: 200, height: 200, borderRadius: 8, marginBottom: 6, backgroundColor: '#ddd' },
  attachmentChip: { alignSelf: 'flex-start', backgroundColor: '#e3e8f5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6 },
  attachmentChipText: { fontSize: 12, color: '#334' },
  log: { flex: 1, backgroundColor: '#f6f6f6', borderRadius: 8, padding: 8 },
  logLine: { fontSize: 12, fontFamily: 'monospace', marginBottom: 2 },
});

export default App;
