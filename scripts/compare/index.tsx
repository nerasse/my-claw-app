/**
 * The app's real components, stacked, so their rendering can be compared with the POC's screenshots.
 *
 * Not a mock of the app: the actual ToolCard, RunGroup, ThreadRow, ContextMeter and question card,
 * fed realistic data. The point is to see what the app draws, not what I believe it draws.
 */
import React from 'react';
import { AppRegistry, ScrollView, Text, View } from 'react-native';
import { ToolCard } from '../../src/components/ToolCard';
import { RunGroup } from '../../src/components/RunGroup';
import { CollapsibleAside } from '../../src/components/CollapsibleAside';
import { CompactionBoundary } from '../../src/components/CompactionBoundary';
import { ReasoningLine } from '../../src/components/ReasoningLine';
import { spine } from '../../src/components/spine';
import { ThreadRow } from '../../src/components/ThreadRow';
import { ContextMeter } from '../../src/components/ContextMeter';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { useThemedStyles, type Palette, font, space } from '../../src/theme';
import type { ChatItem, ToolItem } from '../../src/core/chat';

const tool = (over: Partial<ToolItem> & Pick<ToolItem, 'id' | 'name'>): ToolItem => ({
  kind: 'tool',
  ts: Date.now(),
  args: {},
  ok: true,
  output: '',
  truncated: false,
  durationMs: 1800,
  ...over,
});

const ITEMS: ToolItem[] = [
  tool({ id: 't1', name: 'bash', args: { command: 'bun test tests/llm/resolver.test.ts' }, output: '44 pass, 0 fail', durationMs: 1800 }),
  tool({
    id: 't2',
    name: 'apply_patch',
    args: {},
    output: [
      '*** Begin Patch',
      '--- a/src/llm/resolver.ts',
      '+++ b/src/llm/resolver.ts',
      '@@ -243,8 +243,14 @@ function mergedLimit(',
      '-  context: model?.limit ?? merged.limit,',
      '-  output: model?.limit?.output,',
      '+  context: model?.limit?.context ?? merged.limit.context,',
      '+  output: model?.limit?.output ?? merged.limit.output,',
      '*** End Patch',
    ].join('\n'),
    durationMs: 2400,
  }),
  tool({ id: 't3', name: 'read', args: { path: '/home/neras/dev/my-claw/src/llm/resolver.ts' }, output: 'one\ntwo\nthree', durationMs: 320 }),
  tool({ id: 't4', name: 'ls', args: { path: '/home/neras/dev/my-claw/src' }, output: 'src/llm\nsrc/tools\nsrc/channels', durationMs: 210 }),
  tool({ id: 't5', name: 'grep', args: { pattern: 'max_tokens' }, ok: false, output: 'no match', durationMs: 900 }),
];

/** One thought phase, to see a reasoning line on the same column as a tool name. */
const THOUGHT = {
  kind: 'text',
  id: 'th1',
  role: 'agent',
  text: '',
  reasoning: 'la machine est saturée',
  reasoningTokens: 209,
  durationMs: 1200,
  attachments: [],
  streaming: false,
  ts: Date.now(),
} as ChatItem;

const SESSIONS = [
  { threadId: 'a', title: 'Refonte UI — trois directions', updatedAt: new Date().toISOString(), messageCount: 14 } as never,
  { threadId: 'b', title: 'Refonte page téléchargements', updatedAt: new Date(Date.now() - 3600_000).toISOString(), messageCount: 3 } as never,
];

function Sheet(): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.h}>en-tête : la jauge telle que l'app la dessine</Text>
      <View style={styles.hostBar}>
        <ContextMeter used={72400} effective={175400} percent={41.3} onPress={() => {}} />
      </View>

      <Text style={styles.h}>rangées de conversation</Text>
      <View style={{ width: 296 }}>
        {SESSIONS.map((s, i) => (
          <ThreadRow key={i} item={s} active={i === 0} unread={i === 1} running={i === 1} onOpen={() => {}} onMenu={() => {}} />
        ))}
      </View>

      <Text style={styles.h}>cartes d'outil, repliées</Text>
      {ITEMS.map(item => <ToolCard key={item.id} item={item} />)}

      <Text style={styles.h}>cartes d'outil, ouvertes</Text>
      {ITEMS.slice(0, 2).map(item => <ToolCard key={`o-${item.id}`} item={item} expandTools />)}

      <Text style={styles.h}>règle de compaction</Text>
      <CompactionBoundary
        item={{ kind: 'text', id: 'c1', role: 'user', text: 'The compaction kept: three turns about the siphon.', archive: 'Finished work: the quota wait was moved to the run.', summaryOf: 3, compactionMs: 42000, attachments: [], streaming: false, ts: Date.now() } as never}
      />

      <Text style={styles.h}>groupe de run, replié</Text>
      <View style={styles.textColumn}>
        <Text style={styles.answer}>Load average 10 sur 6 cœurs : la machine est saturée, ce qui explique les échecs.</Text>
        <RunGroup
          run={{ id: 'r2' } as never}
          items={ITEMS as ChatItem[]}
          open={false}
          onToggle={() => {}}
          renderItem={(item, _i, _all, dense) => (item.kind === 'tool' ? <ToolCard key={item.id} item={item} dense={dense} /> : null)}
        />
        {/* Free rows, the case the owner compared: a bar, then a reasoning line, then a message. */}
        <CollapsibleAside label="Reasoning" body="" showHint="Show" hideHint="Hide" clockAt={Date.now()} />
        <RunGroup
          run={{ id: 'r3' } as never}
          items={[ITEMS[0]!, THOUGHT] as ChatItem[]}
          open
          onToggle={() => {}}
          renderItem={(item, _i, _all, dense) =>
            item.kind === 'tool' ? (
              <ToolCard key={item.id} item={item} dense={dense} />
            ) : (
              <ReasoningLine
                reasoning="la machine est saturée, je vérifie ce qui charge"
                durationMs={1200}
                streaming={false}
                headHeight={spine(1).head}
              />
            )
          }
        />
        <RunGroup
          run={{ id: 'r4' } as never}
          items={[ITEMS[3]!] as ChatItem[]}
          open
          onToggle={() => {}}
          renderItem={(item, _i, _all, dense) => (item.kind === 'tool' ? <ToolCard key={item.id} item={item} dense={dense} /> : null)}
        />
      </View>

      <Text style={styles.h}>groupe de run, ouvert</Text>
      <RunGroup
        run={{ id: 'r1' } as never}
        items={ITEMS as ChatItem[]}
        open
        onToggle={() => {}}
        renderItem={(item, _i, _all, dense) => (item.kind === 'tool' ? <ToolCard key={item.id} item={item} dense={dense} /> : null)}
      />
    </ScrollView>
  );
}

const createStyles = (palette: Palette) => ({
  page: { padding: 20, gap: 8, backgroundColor: palette.bg },
  textColumn: { gap: 8 },
  answer: { fontSize: 14, lineHeight: 21, color: palette.text },
  h: { fontSize: font.micro, color: palette.textFaint, letterSpacing: 0.4, textTransform: 'uppercase' as const, marginTop: space.lg },
  hostBar: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: palette.border },
});

function Root(): React.JSX.Element {
  return <ThemeProvider><Sheet /></ThemeProvider>;
}

AppRegistry.registerComponent('Sheet', () => Root);
AppRegistry.runApplication('Sheet', { rootTag: document.getElementById('root') });
