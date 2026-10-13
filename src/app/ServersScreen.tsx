import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { WsStatusPayload } from '../core/types';
import { multiServerSupported, serverName, serversStore, useServers, type ServerProfile } from '../core/servers';
import { overlayStore } from '../core/overlay';
import { useTheme } from '../theme';
import { ServerSection } from './ConnectionSections';
import { Section, SettingsPageFrame, useSettingsStyles } from './settingsParts';

/**
 * The server this app talks to, and on the phone the others it uses (docs/servers.md): one is
 * active, a press switches to another, and the app starts afresh on it. Adding one opens the Join
 * screen with no address; the invitation it scans names the server.
 */
export function ServersScreen({
  url,
  onUrlChange,
  status,
  serverVersion,
  onConnect,
  onDisconnect,
  onJoin,
  onBack,
}: {
  url: string;
  onUrlChange: (url: string) => void;
  status: WsStatusPayload;
  serverVersion: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onJoin?: () => void;
  onBack: () => void;
}): React.JSX.Element {
  const styles = useSettingsStyles();
  const { palette } = useTheme();
  const { list, active } = useServers();
  const [renaming, setRenaming] = useState<ServerProfile | null>(null);
  const [name, setName] = useState('');
  const current = list.find(profile => profile.id === active);
  const openMenu = (profile: ServerProfile): void =>
    overlayStore.open({
      kind: 'sheet',
      preview: serverName(profile),
      options: [
        { label: 'Switch to this server', onPress: () => { overlayStore.close(); serversStore.switchTo(profile.id).catch(() => {}); } },
        { label: 'Rename', onPress: () => { overlayStore.close(); setRenaming(profile); setName(profile.name); } },
        { label: 'Forget this server', danger: true, onPress: () => { overlayStore.close(); serversStore.forget(profile.id); } },
      ],
    });

  return (
    <SettingsPageFrame title={multiServerSupported ? 'Servers' : 'Server'} onBack={onBack}>
      {multiServerSupported && current ? (
        <Section title="this server">
          {renaming?.id === current.id ? null : (
            <View style={styles.row}>
              <Text style={[styles.switchTitle, styles.grow]} numberOfLines={1}>
                {serverName(current)}
              </Text>
              <Pressable
                onPress={() => {
                  setRenaming(current);
                  setName(current.name);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Rename this server">
                <Text style={styles.toggleText}>rename</Text>
              </Pressable>
            </View>
          )}
          {renaming?.id === current.id ? (
            <RenameRow name={name} onChange={setName} onDone={() => { serversStore.rename(current.id, name); setRenaming(null); }} />
          ) : null}
        </Section>
      ) : null}
      <ServerSection
        url={url}
        onUrlChange={onUrlChange}
        status={status}
        serverVersion={serverVersion}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onJoin={onJoin}
      />
      {multiServerSupported ? (
        <Section title="other servers">
          {list.filter(profile => profile.id !== active).length === 0 ? (
            <Text style={styles.hint}>Another my-claw, a relative's or a test one: add it here, and switch from one to the other.</Text>
          ) : null}
          {list
            .filter(profile => profile.id !== active)
            .map(profile =>
              renaming?.id === profile.id ? (
                <RenameRow key={profile.id} name={name} onChange={setName} onDone={() => { serversStore.rename(profile.id, name); setRenaming(null); }} />
              ) : (
                <Pressable
                  key={profile.id}
                  style={styles.serverRow}
                  onPress={() => openMenu(profile)}
                  accessibilityRole="button"
                  accessibilityLabel={`Server ${serverName(profile)}`}>
                  <View style={styles.grow}>
                    <Text style={styles.switchTitle} numberOfLines={1}>
                      {serverName(profile)}
                    </Text>
                    <Text style={styles.hint} numberOfLines={1}>
                      {profile.url || 'not joined yet'}
                    </Text>
                  </View>
                  <Text style={{ color: palette.accent }}>Switch</Text>
                </Pressable>
              ),
            )}
          <Pressable
            style={[styles.button, styles.buttonGhost]}
            onPress={() => serversStore.add().catch(() => {})}
            accessibilityRole="button"
            accessibilityLabel="Add a server">
            <Text style={[styles.buttonText, styles.buttonGhostText]}>Add a server</Text>
          </Pressable>
        </Section>
      ) : null}
    </SettingsPageFrame>
  );
}

function RenameRow({ name, onChange, onDone }: { name: string; onChange: (name: string) => void; onDone: () => void }): React.JSX.Element {
  const styles = useSettingsStyles();
  return (
    <View style={styles.row}>
      <TextInput
        style={[styles.input, styles.grow]}
        value={name}
        onChangeText={onChange}
        onSubmitEditing={onDone}
        autoFocus
        placeholder="a name, e.g. Home"
        accessibilityLabel="Server name"
      />
      <Pressable style={[styles.button, styles.buttonNarrow]} onPress={onDone} accessibilityRole="button" accessibilityLabel="Save the name">
        <Text style={styles.buttonText}>Save</Text>
      </Pressable>
    </View>
  );
}
