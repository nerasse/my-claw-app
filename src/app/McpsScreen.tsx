import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { McpEntry } from '../core/protocol';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';

function stateBadge(state: McpEntry['state']): string {
  if (state === 'connected') return 'connected';
  if (state === 'disabled') return 'disabled';
  return 'failed';
}

/**
 * The declared MCP servers with their live state, plus add/remove/enable. The form asks for
 * exactly what a server needs (command for stdio, url for sse/http); credentials (env/headers)
 * are not offered here on purpose -- they belong to a config the app only reads.
 */
export function McpsScreen({
  servers,
  error,
  busy,
  onBack,
  onAdd,
  onRemove,
  onEnable,
}: {
  servers: McpEntry[];
  error: string | null;
  busy: boolean;
  onBack: () => void;
  onAdd: (name: string, transport: 'stdio' | 'sse' | 'http', spec: { command?: string; args?: string[]; url?: string }) => void;
  onRemove: (name: string) => void;
  onEnable: (name: string, enabled: boolean) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  useDismissKeyboard();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<'stdio' | 'sse' | 'http'>('stdio');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const validName = /^[a-z0-9][a-z0-9_-]*$/.test(name);
  const specOk = transport === 'stdio' ? command.trim().length > 0 : url.trim().length > 0;
  const canAdd = validName && specOk && !busy;

  const submit = (): void => {
    onAdd(
      name,
      transport,
      transport === 'stdio'
        ? { command: command.trim(), ...(args.trim() ? { args: args.split(/\s+/).filter(Boolean) } : {}) }
        : { url: url.trim() },
    );
    setName('');
    setCommand('');
    setArgs('');
    setUrl('');
    setAdding(false);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to settings">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>MCP servers</Text>
          <Text style={styles.subtitle}>
            {`${servers.length} declared · agents scope themselves with these names`}
          </Text>
        </View>
        <Pressable
          onPress={() => setAdding(!adding)}
          style={[styles.addButton, adding ? styles.addActive : styles.addIdle]}
          accessibilityRole="button"
          accessibilityLabel={adding ? 'Cancel add server' : 'Add server'}>
          <Text style={adding ? styles.addTextActive : styles.addTextIdle}>{adding ? '✕' : '+'}</Text>
        </Pressable>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLabel={`MCP error ${error}`}>
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {adding ? (
          <View style={styles.category}>
            <Text style={styles.section}>new server</Text>
            <View style={styles.card}>
              <View style={styles.formRow}>
                <Text style={styles.rowKey}>name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="gitlab"
                  placeholderTextColor={styles.placeholder.color}
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel="Server name"
                />
              </View>
              <View style={styles.separator} />
              <View style={styles.formRow}>
                <Text style={styles.rowKey}>transport</Text>
                <View style={styles.chips}>
                  {(['stdio', 'sse', 'http'] as const).map(t => (
                    <Pressable
                      key={t}
                      onPress={() => setTransport(t)}
                      style={[styles.chip, transport === t ? styles.chipActive : styles.chipIdle]}
                      accessibilityRole="button"
                      accessibilityLabel={`Transport ${t}`}
                      accessibilityState={{ selected: transport === t }}>
                      <Text style={transport === t ? styles.chipTextActive : styles.chipTextIdle}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              {transport === 'stdio' ? (
                <>
                  <View style={styles.separator} />
                  <View style={styles.formRow}>
                    <Text style={styles.rowKey}>command</Text>
                    <TextInput
                      style={styles.input}
                      value={command}
                      onChangeText={setCommand}
                      placeholder="mcp-gitlab"
                      placeholderTextColor={styles.placeholder.color}
                      autoCorrect={false}
                      autoCapitalize="none"
                      accessibilityLabel="Server command"
                    />
                  </View>
                  <View style={styles.separator} />
                  <View style={styles.formRow}>
                    <Text style={styles.rowKey}>args</Text>
                    <TextInput
                      style={styles.input}
                      value={args}
                      onChangeText={setArgs}
                      placeholder="--port 2525 (space separated)"
                      placeholderTextColor={styles.placeholder.color}
                      autoCorrect={false}
                      autoCapitalize="none"
                      accessibilityLabel="Server args"
                    />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.separator} />
                  <View style={styles.formRow}>
                    <Text style={styles.rowKey}>url</Text>
                    <TextInput
                      style={styles.input}
                      value={url}
                      onChangeText={setUrl}
                      placeholder="https://mcp.example.com/sse"
                      placeholderTextColor={styles.placeholder.color}
                      autoCorrect={false}
                      autoCapitalize="none"
                      accessibilityLabel="Server url"
                    />
                  </View>
                </>
              )}
            </View>
            <Pressable
              onPress={submit}
              disabled={!canAdd}
              style={[styles.saveButton, canAdd ? styles.saveEnabled : styles.saveDisabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canAdd }}
              accessibilityLabel="Create server">
              <Text style={canAdd ? styles.saveText : styles.saveTextOff}>{busy ? '...' : 'Create'}</Text>
            </Pressable>
            <Text style={styles.note}>
              credentials (env, headers) stay in the config file: this form only declares the server
            </Text>
          </View>
        ) : null}

        <View style={styles.category}>
          <Text style={styles.section}>declared</Text>
          <View style={styles.card}>
            {servers.length === 0 ? (
              <View style={styles.row}>
                <Text style={styles.itemHint}>no servers declared</Text>
              </View>
            ) : (
              servers.map((server, index) => (
                <View key={server.name}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <View style={styles.serverRow}>
                    <Pressable
                      style={styles.serverMain}
                      onPress={() => setConfirmRemove(server.name)}
                      accessibilityRole="button"
                      accessibilityLabel={`Manage ${server.name}`}>
                      <View style={styles.linkTitleLine}>
                        <Text style={styles.itemName}>{server.name}</Text>
                        <Text style={server.state === 'failed' ? styles.badgeFailed : styles.badge}>
                          {stateBadge(server.state)}
                        </Text>
                      </View>
                      <Text style={styles.itemHint} numberOfLines={1}>
                        {`${server.transport}${server.command ? ` · ${server.command}` : ''}${server.url ? ` · ${server.url}` : ''}`}
                      </Text>
                      {server.lastError ? (
                        <Text style={[styles.itemHint, styles.removed]} numberOfLines={1}>
                          {server.lastError}
                        </Text>
                      ) : null}
                    </Pressable>
                    {confirmRemove === server.name ? (
                      <Pressable
                        onPress={() => {
                          onRemove(server.name);
                          setConfirmRemove(null);
                        }}
                        style={styles.removeButton}
                        accessibilityRole="button"
                        accessibilityLabel={`Confirm remove ${server.name}`}>
                        <Text style={styles.removeText}>remove</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => onEnable(server.name, server.enabled === false)}
                        style={styles.enableButton}
                        accessibilityRole="button"
                        accessibilityLabel={server.enabled === false ? `Enable ${server.name}` : `Disable ${server.name}`}>
                        <Text style={server.enabled === false ? styles.enableTextOn : styles.enableTextOff}>
                          {server.enabled === false ? 'enable' : 'disable'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  backGlyph: { fontSize: 26, lineHeight: 28, color: palette.text },
  headerText: { flex: 1, gap: 1 },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  subtitle: { fontSize: font.small, color: palette.textFaint },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
  },
  addActive: { borderColor: palette.danger, backgroundColor: palette.surfaceAlt },
  addIdle: { borderColor: palette.accent, backgroundColor: palette.surfaceAlt },
  addTextActive: { fontSize: 18, color: palette.danger },
  addTextIdle: { fontSize: 18, color: palette.accent },
  body: { padding: space.md, gap: space.lg, paddingBottom: space.xl },
  category: { gap: space.xs },
  section: { fontSize: font.micro, color: palette.textFaint, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    overflow: 'hidden' as const,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  serverRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  serverMain: { flex: 1, gap: 2 },
  formRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  linkTitleLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, flexWrap: 'wrap' as const },
  itemName: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  itemHint: { fontSize: font.small, color: palette.textMuted },
  rowKey: { fontSize: font.small, color: palette.textMuted, width: 84 },
  separator: { height: 1, backgroundColor: palette.border, marginLeft: space.md },
  badge: {
    fontSize: font.micro,
    color: palette.textFaint,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  badgeFailed: {
    fontSize: font.micro,
    color: palette.danger,
    borderWidth: 1,
    borderColor: palette.danger,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  removed: { color: palette.danger },
  input: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceAlt,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: font.body,
    color: palette.text,
  },
  placeholder: { color: palette.textFaint },
  chips: { flexDirection: 'row' as const, gap: space.sm, flex: 1 },
  chip: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: 'center' as const,
    borderWidth: 1,
  },
  chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipIdle: { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
  chipTextActive: { fontSize: font.small, fontWeight: '600' as const, color: palette.surface },
  chipTextIdle: { fontSize: font.small, color: palette.textMuted },
  saveButton: {
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: 'center' as const,
  },
  saveEnabled: { backgroundColor: palette.accent },
  saveDisabled: { backgroundColor: palette.surfaceAlt },
  saveText: { fontSize: font.body, fontWeight: '600' as const, color: palette.surface },
  saveTextOff: { fontSize: font.body, fontWeight: '600' as const, color: palette.textFaint },
  enableButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  enableTextOn: { fontSize: font.small, color: palette.text },
  enableTextOff: { fontSize: font.small, color: palette.textMuted },
  removeButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.danger,
  },
  removeText: { fontSize: font.small, fontWeight: '600' as const, color: palette.danger },
  note: { fontSize: font.micro, color: palette.textFaint, paddingHorizontal: space.xs },
  error: {
    textAlign: 'center' as const,
    fontSize: font.meta,
    color: palette.danger,
    padding: space.md,
  },
});
