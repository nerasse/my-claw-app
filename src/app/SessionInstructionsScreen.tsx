import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { useDismissKeyboard } from '../core/keyboard';
import { useSessionInstructions } from '../core/sessionInstructions';
import { CopyButton } from '../components/CopyButton';
import type { SessionInstructionLayer, SessionInstructionNested } from '../core/protocol';

/**
 * What this conversation is actually loaded with: every layer of the system prompt as the server
 * composes it, then the nested AGENTS.md its runs read along the way.
 *
 * A sibling of the status page, opened from the same two menus and drawn as an absolute layer of
 * the shell. The distinction it exists to make: Settings > Workspaces shows the files a workspace
 * holds, this shows what one thread reads, which is the question anyone actually asks. Every
 * layer that comes from a file can be opened and edited from here, nested files included.
 */

function bytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

function ago(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** The origin badge of a layer, absent for the derived ones (skills, tools, runtime). */
function originLabel(layer: SessionInstructionLayer): string {
  if (!layer.origin) return '';
  if (layer.origin === 'own') return layer.from ? `own · ${layer.from}` : 'own';
  if (layer.origin === 'inherited') return `inherited · ${layer.from || 'default'}`;
  if (layer.origin === 'off') return 'off';
  return 'shipped default';
}

export function SessionInstructionsScreen({
  onClose,
  onEditLayer,
  onEditNested,
}: {
  onClose: () => void;
  onEditLayer: (workspace: string, file: string) => void;
  onEditNested: (item: SessionInstructionNested) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const state = useSessionInstructions();
  useDismissKeyboard();
  const payload = state.payload;

  return (
    <View style={[StyleSheet.absoluteFill, styles.stage]}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Close instructions">
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.headerMain}>
          <Text style={styles.title}>Instructions</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {payload ? `${payload.agent} · ${payload.workspace} · ${bytes(payload.totalBytes)}` : 'this conversation'}
          </Text>
        </View>
      </View>

      {state.fetch === 'loading' ? (
        <Text style={styles.empty}>asking the server…</Text>
      ) : state.fetch === 'error' ? (
        <Text style={styles.empty}>{state.error}</Text>
      ) : payload ? (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.cardTitle}>system prompt</Text>
            <Text style={styles.cardNote}>{`${payload.layers.length} layers · ${bytes(payload.totalBytes)}`}</Text>
            <Text style={styles.cardNote}>{`${payload.model} · ${payload.backend} · ${payload.platform}`}</Text>
            <Text style={styles.cardNote} numberOfLines={2}>
              {payload.workspaceDir}
            </Text>
          </View>

          {payload.layers.map((layer, index) => (
            <LayerRow
              key={`${layer.id}-${index}`}
              layer={layer}
              onEdit={layer.edit ? () => onEditLayer(layer.edit!.workspace, layer.edit!.file) : undefined}
            />
          ))}

          <Text style={styles.section}>{`nested AGENTS.md · ${payload.nested.length}`}</Text>
          {payload.nested.length === 0 ? (
            <Text style={styles.sectionNote}>
              Nothing yet. A file is picked up when a tool touches its directory, once per run.
            </Text>
          ) : (
            payload.nested.map(item => <NestedRow key={item.path} item={item} onEdit={() => onEditNested(item)} />)
          )}

          {payload.notes.map(note => (
            <Text key={note} style={styles.note}>
              {note}
            </Text>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function LayerRow({ layer, onEdit }: { layer: SessionInstructionLayer; onEdit?: () => void }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const origin = originLabel(layer);
  const empty = layer.bytes === 0;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setOpen(value => !value)}
        style={styles.rowHead}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${layer.label}, ${bytes(layer.bytes)}`}>
        <Text style={styles.foldGlyph}>{open ? '▾' : '▸'}</Text>
        <View style={styles.rowMain}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {layer.label}
          </Text>
          {origin ? <Text style={styles.rowSub}>{origin}</Text> : null}
        </View>
        <Text style={[styles.rowBytes, empty && styles.rowBytesOff]}>{empty ? 'empty' : bytes(layer.bytes)}</Text>
      </Pressable>

      {open ? (
        <View style={styles.foldBody}>
          <View style={styles.actions}>
            {onEdit ? (
              <Pressable onPress={onEdit} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Edit ${layer.label}`}>
                <Text style={styles.action}>edit</Text>
              </Pressable>
            ) : null}
            {layer.text ? <CopyButton value={layer.text} accessibilityLabel={`Copy ${layer.label}`} /> : null}
          </View>
          <Text style={styles.code} selectable>
            {layer.text || 'this layer contributes nothing to the prompt'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function NestedRow({ item, onEdit }: { item: SessionInstructionNested; onEdit: () => void }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onEdit}
      disabled={item.missing}
      style={styles.card}
      accessibilityRole="button"
      accessibilityState={{ disabled: item.missing }}
      accessibilityLabel={`Edit ${item.label}`}>
      <Text style={styles.rowTitle} numberOfLines={2}>
        {item.label}
      </Text>
      <Text style={styles.rowSub}>
        {item.missing
          ? 'deleted since · it did shape this conversation'
          : `${bytes(item.bytes)} · ${item.count} run${item.count > 1 ? 's' : ''} · ${ago(item.lastAt)}`}
      </Text>
    </Pressable>
  );
}

const createStyles = (palette: Palette) => ({
  stage: { backgroundColor: palette.bg },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingBottom: space.sm,
    paddingHorizontal: space.md,
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
  headerMain: { flex: 1, gap: 1 },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  headerSub: { fontSize: font.small, color: palette.textFaint },
  empty: { padding: space.xl, fontSize: font.body, color: palette.textFaint },
  body: { paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.xl, gap: space.sm },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: space.xs,
  },
  cardTitle: {
    fontSize: font.micro,
    color: palette.textFaint,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  cardNote: { fontSize: font.small, color: palette.textMuted },
  rowHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  rowMain: { flex: 1, gap: 1 },
  rowTitle: { fontSize: font.body, color: palette.text },
  rowSub: { fontSize: font.small, color: palette.textFaint },
  rowBytes: { fontSize: font.small, color: palette.textMuted },
  rowBytesOff: { color: palette.textFaint, fontStyle: 'italic' as const },
  foldGlyph: { fontSize: font.small, color: palette.textFaint, width: 12 },
  foldBody: { gap: space.sm, paddingTop: space.xs },
  actions: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.md },
  action: {
    fontSize: font.micro,
    color: palette.accent,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  code: { fontSize: font.small, fontFamily: 'monospace' as const, color: palette.textMuted },
  section: {
    marginTop: space.md,
    fontSize: font.micro,
    color: palette.textFaint,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  sectionNote: { fontSize: font.small, color: palette.textFaint },
  note: { fontSize: font.small, color: palette.textFaint, marginTop: space.xs },
});
