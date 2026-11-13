/**
 * Sub-agent cards, as the app draws them: the launch and the return.
 *
 * The two are one thing read at two moments, so they are reviewed side by side. What this sheet
 * answers, and nothing else can: does a launch still look like a loading state (it must not), does
 * a return still look like something the owner typed (it must not), and do the two land on the same
 * column as the work around them.
 */
import React from 'react';
import { AppRegistry, ScrollView, Text, View } from 'react-native';
import { SubAgentCard } from '../../src/components/SubAgentCard';
import { SubAgentReturn } from '../../src/components/SubAgentReturn';
import { ToolCard } from '../../src/components/ToolCard';
import { RunGroup } from '../../src/components/RunGroup';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { font, space, useThemedStyles, type Palette } from '../../src/theme';
import type { ChatItem, TextItem, ToolItem } from '../../src/core/chat';

const ts = Date.parse('2026-11-13T20:10:00.000Z');

const tool = (over: Partial<ToolItem> & Pick<ToolItem, 'id' | 'name'>): ToolItem => ({
  kind: 'tool',
  ts,
  args: {},
  ok: true,
  output: '',
  truncated: false,
  durationMs: 1800,
  ...over,
});

const spawnCard = (over: Partial<ToolItem> = {}): ToolItem =>
  tool({
    id: 'spawn-1',
    name: 'spawn',
    args: { name: 'digger', type: 'research', mode: 'session', task: 'Map the reasoning flow of the app, and report what a folded run holds.' },
    output: 'Started digger (research, id: subagent/digger-a1b2) in the background.',
    durationMs: 240,
    ...over,
  });

const returnItem = (over: Partial<TextItem> = {}): TextItem => ({
  kind: 'text',
  id: 'ret-1',
  role: 'user',
  text: [
    'The reasoning flow is a phase of its own, not a field of the bubble: `ReasoningLine` draws it',
    'above the words it produced, and `splitReasoning` moves it onto a row so it can fold with the',
    'run. A return, by contrast, is a turn of the conversation.',
  ].join('\n'),
  attachments: [],
  streaming: false,
  from: { label: 'digger', kind: 'return', status: 'complete' },
  ts,
  ...over,
});

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.section}>
      <Text style={styles.h}>{title}</Text>
      {children}
    </View>
  );
}

function Sheet(): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Section title="a launch, folded: one word, no clock, no spinner">
        <SubAgentCard
          item={spawnCard()}
          subagent={{ label: 'digger', status: 'running', model: 'openai/gpt-5.2' }}
          spawn={{ subagentId: 'subagent/digger-a1b2', displayName: 'digger', status: 'running' }}
          onOpen={() => {}}
        />
      </Section>

      <Section title="a launch that came back refused, and a send">
        <SubAgentCard item={spawnCard({ id: 'spawn-2', ok: false, output: 'Error: unknown agent type "diggor"' })} />
        <SubAgentCard
          item={tool({ id: 'send-1', name: 'send', args: { id: 'subagent/digger-a1b2', message: 'also check the aside fold' }, output: 'Sent digger in the background.' })}
          subagent={{ label: 'digger', status: 'running' }}
          onOpen={() => {}}
        />
      </Section>

      <Section title="a return, folded: who reported, one word, one line">
        <SubAgentReturn item={returnItem()} mediaBase="" deviceInfo={null} />
      </Section>

      <Section title="a return that failed">
        <SubAgentReturn
          item={returnItem({
            id: 'ret-2',
            text: 'the provider refused the last call: 429 usage_limit_reached',
            from: { label: 'eyes', kind: 'return', status: 'error' },
          })}
          mediaBase=""
          deviceInfo={null}
        />
      </Section>

      <Section title="a browser task's return, with what it saw">
        <SubAgentReturn
          item={returnItem({
            id: 'ret-3',
            text: 'The cart total is 42,90 € and the delivery estimate stayed on "tomorrow".',
            from: { label: 'browser-3f2a', kind: 'return', status: 'complete' },
            attachments: [{ id: 'shot-1', type: 'image', filename: 'cart.png' }],
          })}
          mediaBase=""
          deviceInfo={null}
        />
      </Section>

      <Section title="the two, inside a run: same column as the work">
        <View style={styles.column}>
          <Text style={styles.answer}>Je lance la lecture du flux et je reviens vers toi.</Text>
          <RunGroup
            run={{ id: 'r1' } as never}
            items={[tool({ id: 't1', name: 'bash', args: { command: 'bun test tests/run' }, output: '44 pass' }), spawnCard()] as ChatItem[]}
            open
            onToggle={() => {}}
            renderItem={(item, _i, _all, dense) =>
              item.kind === 'tool' ? (
                item.name === 'spawn' ? (
                  <SubAgentCard item={item} subagent={{ label: 'digger', status: 'running' }} onOpen={() => {}} />
                ) : (
                  <ToolCard item={item} dense={dense} />
                )
              ) : null
            }
          />
          <SubAgentReturn item={returnItem()} mediaBase="" deviceInfo={null} />
        </View>
      </Section>
    </ScrollView>
  );
}

const createStyles = (palette: Palette) => ({
  page: { padding: 20, gap: 4, backgroundColor: palette.bg },
  section: { gap: 6, paddingVertical: space.sm },
  column: { gap: 8 },
  answer: { fontSize: 14, lineHeight: 21, color: palette.text },
  h: {
    fontSize: font.micro,
    color: palette.textFaint,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
    marginTop: space.lg,
  },
});

function Root(): React.JSX.Element {
  return (
    <ThemeProvider>
      <Sheet />
    </ThemeProvider>
  );
}

AppRegistry.registerComponent('Sheet', () => Root);
AppRegistry.runApplication('Sheet', { rootTag: document.getElementById('root') });
