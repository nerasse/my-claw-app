import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, FlatList, Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { connection } from './core/connection';
import { chatStore, type ChatItem } from './core/chat';
import {
  encodeChatSend,
  encodeSessionArchive,
  encodeSessionDelete,
  encodeSessionHistory,
  encodeSessionList,
  type SessionSummary,
} from './core/protocol';
import { getDeviceInfo, type DeviceInfo } from './core/device';
import type { WsStatusPayload } from './core/types';

const DEFAULT_URL = 'ws://10.10.20.10:8080/mobile';

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
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [threads, setThreads] = useState<SessionSummary[]>([]);
  const [itemsVersion, setItemsVersion] = useState(0);
  const [threadsVersion, setThreadsVersion] = useState(0);
  const listRef = useRef<FlatList<ChatItem>>(null);
  const activeThreadRef = useRef<string | null>(null);
  const threadsRef = useRef<SessionSummary[]>([]);
  const connected = status.state === 'connected';
  const mediaBase = useMemo(() => httpOrigin(url), [url]);
  const items = useMemo(() => (activeThread ? chatStore.getItems(activeThread) : []), [itemsVersion, activeThread]);
  const threadTitles = useMemo(() => {
    const titles: Record<string, string> = {};
    for (const t of threads) {
      titles[t.threadId] = t.title;
    }
    return titles;
  }, [threadsVersion]);

  useEffect(() => {
    const offState = connection.onState(state => {
      setStatus(state);
      if (state.state === 'connected') {
        refreshList();
      }
    });
    const offFrame = connection.onFrame(frame => {
      switch (frame.type) {
        case 'chat.message':
          chatStore.addAgentMessage(frame.threadId, frame.id, frame.text, frame.attachments, frame.replyToId);
          noteActivity(frame.threadId, frame.text);
          break;
        case 'chat.stream.start':
          chatStore.startStream(frame.threadId, frame.id, frame.replyToId);
          break;
        case 'chat.stream.delta':
          chatStore.appendDelta(frame.threadId, frame.id, frame.text);
          break;
        case 'chat.stream.done':
          chatStore.endStream(frame.threadId, frame.id);
          break;
        case 'chat.stream.abort':
          chatStore.abortStream(frame.threadId, frame.id, frame.error);
          break;
        case 'session.list.result':
          threadsRef.current = frame.sessions;
          setThreads(frame.sessions);
          setThreadsVersion(v => v + 1);
          break;
        case 'chat.history':
          chatStore.seedHistory(frame.threadId, frame.messages);
          chatStore.markRead(frame.threadId);
          break;
        case 'approval.request':
          break;
        case 'error':
          if (activeThreadRef.current) {
            chatStore.addAgentMessage(activeThreadRef.current, `err-${Date.now()}`, `erreur: ${frame.message}`, [], undefined);
          }
          break;
      }
    });
    const offStore = chatStore.subscribe(() => setItemsVersion(v => v + 1));
    getDeviceInfo().then(setDeviceInfo).catch(() => {});
    connection.getState().then(state => {
      setStatus({ state });
      if (state !== 'connected' && state !== 'connecting') {
        connection.connect(DEFAULT_URL);
      }
    });
    return () => {
      offState();
      offFrame();
      offStore();
    };
  }, []);

  function refreshList() {
    connection.send(encodeSessionList());
  }

  function noteActivity(threadId: string, text: string) {
    if (threadId !== activeThreadRef.current) {
      chatStore.markRead(threadId);
      if (!threadsRef.current.some(t => t.threadId === threadId)) {
        threadsRef.current = [
          {
            threadId,
            title: titleFromText(text),
            messageCount: 0,
            createdAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString(),
          },
          ...threadsRef.current,
        ];
        setThreads(threadsRef.current);
      }
    }
  }

  function openThread(threadId: string) {
    activeThreadRef.current = threadId;
    setActiveThread(threadId);
    chatStore.markRead(threadId);
    connection.send(encodeSessionHistory(threadId, 50));
  }

  function newThread() {
    const threadId = uuid();
    activeThreadRef.current = threadId;
    setActiveThread(threadId);
    connection.send(encodeSessionHistory(threadId, 50));
  }

  function sendChat() {
    const text = sendText.trim();
    if (!text || !activeThread) return;
    const id = uuid();
    connection.send(encodeChatSend(id, text, activeThread));
    chatStore.addUserMessage(activeThread, id, text);
    setSendText('');
  }

  function archiveThread(threadId: string) {
    connection.send(encodeSessionArchive(threadId));
    chatStore.clearThread(threadId);
    threadsRef.current = threadsRef.current.filter(t => t.threadId !== threadId);
    setThreads(threadsRef.current);
    if (activeThreadRef.current === threadId) {
      activeThreadRef.current = null;
      setActiveThread(null);
    }
  }

  function deleteThread(threadId: string) {
    connection.send(encodeSessionDelete(threadId));
    chatStore.clearThread(threadId);
    threadsRef.current = threadsRef.current.filter(t => t.threadId !== threadId);
    setThreads(threadsRef.current);
    if (activeThreadRef.current === threadId) {
      activeThreadRef.current = null;
      setActiveThread(null);
    }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>MyClaw</Text>
            <Text style={styles.headerAction} onPress={() => setSettingsOpen(v => !v)}>
              {settingsOpen ? 'Fermer' : 'Parametres'}
            </Text>
          </View>

          {settingsOpen ? (
            <SettingsView
              url={url}
              setUrl={setUrl}
              status={status}
              deviceInfo={deviceInfo}
              onConnect={() => connection.connect(url)}
              onDisconnect={() => connection.disconnect()}
            />
          ) : activeThread ? (
            <ChatView
              threadId={activeThread}
              title={threadTitles[activeThread] ?? '(nouvelle conversation)'}
              items={items}
              listRef={listRef}
              sendText={sendText}
              setSendText={setSendText}
              onSend={sendChat}
              onBack={() => {
                activeThreadRef.current = null;
                setActiveThread(null);
                refreshList();
              }}
              mediaBase={mediaBase}
              deviceInfo={deviceInfo}
              connected={connected}
            />
          ) : (
            <>
              <View style={styles.row}>
                <View style={styles.button}>
                  <Button title="Nouvelle conversation" onPress={newThread} disabled={!connected} />
                </View>
                <View style={styles.button}>
                  <Button title="Actualiser" onPress={refreshList} disabled={!connected} />
                </View>
              </View>
              <FlatList
                style={styles.list}
                data={threads}
                keyExtractor={item => item.threadId}
                renderItem={({ item }) => (
                  <ThreadRow
                    item={item}
                    unread={chatStore.isUnread(item.threadId)}
                    onOpen={() => openThread(item.threadId)}
                    onArchive={() => archiveThread(item.threadId)}
                    onDelete={() => deleteThread(item.threadId)}
                  />
                )}
              />
            </>
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function SettingsView({
  url,
  setUrl,
  status,
  deviceInfo,
  onConnect,
  onDisconnect,
}: {
  url: string;
  setUrl: (u: string) => void;
  status: WsStatusPayload;
  deviceInfo: DeviceInfo | null;
  onConnect: () => void;
  onDisconnect: () => void;
}): React.JSX.Element {
  const connected = status.state === 'connected';
  return (
    <View style={styles.settings}>
      <Text style={styles.sectionLabel}>Serveur</Text>
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
          <Button title="Connect" onPress={onConnect} disabled={status.state === 'connecting' || connected} />
        </View>
        <View style={styles.button}>
          <Button title="Disconnect" onPress={onDisconnect} disabled={!connected && status.state !== 'connecting'} />
        </View>
      </View>
      <Text style={styles.status}>
        state: {status.state}
        {status.attempts ? ` (retry ${status.attempts})` : ''}
      </Text>

      <Text style={styles.sectionLabel}>Appareil (pairing)</Text>
      {deviceInfo ? (
        <>
          <Text style={styles.status} selectable>
            device: {deviceInfo.deviceId}
          </Text>
          <Text style={styles.status} selectable>
            token: {deviceInfo.token}
          </Text>
          <Text style={styles.status}>a coller dans channels.mobile.devices du serveur</Text>
        </>
      ) : (
        <Text style={styles.status}>appareil non initialise</Text>
      )}
    </View>
  );
}

function ThreadRow({ item, unread, onOpen, onArchive, onDelete }: { item: SessionSummary; unread: boolean; onOpen: () => void; onArchive: () => void; onDelete: () => void }): React.JSX.Element {
  return (
    <View style={styles.threadRow}>
      <View style={styles.threadMain} onTouchEnd={onOpen}>
        <Text style={[styles.threadTitle, unread && styles.threadTitleUnread]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.threadMeta}>
          {item.messageCount} msg | {formatDate(item.lastActiveAt)}
        </Text>
      </View>
      <Text style={styles.threadAction} onPress={onArchive}>
        archiver
      </Text>
      <Text style={[styles.threadAction, styles.threadActionDanger]} onPress={onDelete}>
        supprimer
      </Text>
    </View>
  );
}

function ChatView({
  threadId,
  title,
  items,
  listRef,
  sendText,
  setSendText,
  onSend,
  onBack,
  mediaBase,
  deviceInfo,
  connected,
}: {
  threadId: string;
  title: string;
  items: ChatItem[];
  listRef: React.RefObject<FlatList<ChatItem> | null>;
  sendText: string;
  setSendText: (t: string) => void;
  onSend: () => void;
  onBack: () => void;
  mediaBase: string;
  deviceInfo: DeviceInfo | null;
  connected: boolean;
}): React.JSX.Element {
  return (
    <>
      <View style={styles.row}>
        <View style={styles.button}>
          <Button title="< Retour" onPress={onBack} />
        </View>
        <Text style={[styles.title, styles.chatTitle]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <FlatList
        ref={listRef}
        style={styles.list}
        data={items}
        keyExtractor={item => `${threadId}-${item.id}`}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => <Bubble item={item} mediaBase={mediaBase} deviceInfo={deviceInfo} />}
      />
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.sendInput]}
          value={sendText}
          onChangeText={setSendText}
          onSubmitEditing={onSend}
          placeholder="message a l'agent"
        />
        <View style={styles.sendButton}>
          <Button title="Send" onPress={onSend} disabled={!connected} />
        </View>
      </View>
    </>
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
      {item.text ? (
        <Text style={[styles.bubbleText, agent ? null : styles.bubbleTextUser]}>{item.text}{cursor}</Text>
      ) : item.streaming ? (
        <Text style={[styles.bubbleText, agent ? null : styles.bubbleTextUser]}>{cursor}</Text>
      ) : null}
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

function titleFromText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, 60);
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, padding: 16, gap: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700' },
  headerAction: { fontSize: 14, color: '#0a5cff', fontWeight: '600' },
  settings: { gap: 10 },
  sectionLabel: { fontSize: 13, color: '#888', fontWeight: '600', textTransform: 'uppercase', marginTop: 6 },
  chatTitle: { flex: 1, fontSize: 17, lineHeight: 34 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  button: { flex: 1 },
  sendInput: { flex: 1 },
  sendButton: { justifyContent: 'center' },
  status: { fontSize: 13, color: '#555' },
  list: { flex: 1 },
  threadRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee', paddingVertical: 10, gap: 10 },
  threadMain: { flex: 1 },
  threadTitle: { fontSize: 15, color: '#111' },
  threadTitleUnread: { fontWeight: '700', color: '#0a5cff' },
  threadMeta: { fontSize: 12, color: '#777', marginTop: 2 },
  threadAction: { fontSize: 13, color: '#0a5cff' },
  threadActionDanger: { color: '#b00020' },
  bubble: { borderRadius: 12, padding: 10, marginBottom: 8, maxWidth: '85%' },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#0a5cff' },
  bubbleAgent: { alignSelf: 'flex-start', backgroundColor: '#f0f0f0' },
  bubbleText: { fontSize: 15, color: '#111' },
  bubbleTextUser: { color: '#fff' },
  bubbleError: { fontSize: 13, color: '#b00020', marginTop: 4 },
  attachmentImage: { width: 200, height: 200, borderRadius: 8, marginBottom: 6, backgroundColor: '#ddd' },
  attachmentChip: { alignSelf: 'flex-start', backgroundColor: '#e3e8f5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6 },
  attachmentChipText: { fontSize: 12, color: '#334' },
});

export default App;
