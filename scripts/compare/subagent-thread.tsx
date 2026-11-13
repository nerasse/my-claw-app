/**
 * The real ChatScreen over a thread that holds a launch and a return, so the two cards can be
 * measured against the bubbles around them instead of against each other in a blank sheet.
 *
 * The question this answers: a launch and a return are rows of the thread now, so their name has to
 * start on the column a message's first letter takes, and their word has to stop on the same right
 * edge as a tool's duration. Only the real screen shows that, because the column, the gutters and
 * the run's spine are all decided by the screen and not by the card.
 */
import React from 'react';
import { AppRegistry, View } from 'react-native';
import { ChatScreen } from '../../src/app/ChatScreen';
import { chatStore } from '../../src/core/chat';
import { prefs } from '../../src/core/prefs';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { ContextMeter } from '../../src/components/ContextMeter';
import type { HistoryEntry } from '../../src/core/protocol';

// `?dark` on the URL: the same thread in the other theme, because a card that only works in one
// is half designed, and a second copy of this file is how the two drift apart.
if (typeof location !== 'undefined' && location.search.includes('dark')) prefs.set('themeMode', 'dark');

const TS = Date.parse('2026-11-13T20:10:00.000Z');
const iso = (offset: number): string => new Date(TS + offset).toISOString();
const THREAD = 'harness-thread';

const HISTORY: HistoryEntry[] = [
  {
    id: 'u1',
    role: 'user',
    text: 'Prends le flux du raisonnement et dis-moi ce qu\u2019un run replié contient.',
    ts: iso(0),
  },
  {
    id: 'p1',
    role: 'assistant',
    ts: iso(1000),
    text: 'Je délègue la lecture à `digger` et je continue sur les cartes.',
    run: { id: 'run-1', status: 'done', startTs: iso(900), endTs: iso(9000) },
  },
  {
    id: 't1',
    role: 'tool',
    ts: iso(1500),
    name: 'bash',
    args: { command: 'rg -n "splitReasoning" src/core' },
    durationMs: 900,
    ok: true,
    output: 'src/core/runRows.ts:412:export function splitReasoning(',
    truncated: false,
    run: { id: 'run-1', status: 'done', startTs: iso(900), endTs: iso(9000) },
  },
  {
    id: 't2',
    role: 'tool',
    ts: iso(2500),
    name: 'spawn',
    args: {
      name: 'digger',
      type: 'research',
      mode: 'session',
      task: 'Map the reasoning flow of the app, and report what a folded run holds.',
    },
    durationMs: 240,
    ok: true,
    output: 'Started digger (research, id: subagent/digger-a1b2) in the background.',
    truncated: false,
    run: { id: 'run-1', status: 'done', startTs: iso(900), endTs: iso(9000) },
    spawn: {
      subagentId: 'subagent/digger-a1b2',
      displayName: 'digger',
      agentType: 'research',
      mode: 'session',
      action: 'spawn',
      status: 'complete',
      startedAt: iso(2500),
      finishedAt: iso(8400),
    },
  },
  {
    id: 'ret-1',
    role: 'user',
    ts: iso(8600),
    text: 'The reasoning flow is a phase of its own, not a field of the bubble: `ReasoningLine` draws it above the words it produced.',
    from: { sessionId: 'subagent/digger-a1b2', label: 'digger', kind: 'return', status: 'complete' },
  },
  {
    id: 'a2',
    role: 'assistant',
    ts: iso(9500),
    text: 'Le rapport confirme ce que j\u2019ai lu dans le code : un retour est une rangée, pas une bulle.',
    run: { id: 'run-2', status: 'done', startTs: iso(9200), endTs: iso(11000) },
  },
];

chatStore.seedHistory(THREAD, HISTORY);

function Root(): React.JSX.Element {
  return (
    <ThemeProvider>
      <View style={{ flex: 1, height: '100vh' as never }}>
        <ChatScreen
          threadId={THREAD}
          title="Sous-agents — la carte de retour"
          subtitle="anthropic / opus-5 · xhigh"
          meter={<ContextMeter used={72400} effective={175400} percent={41.3} onPress={() => {}} />}
          connectionState="connected"
          mediaBase="http://localhost"
          deviceInfo={null}
          autoFocusHero={false}
          onOpenDrawer={() => {}}
          onStatusPress={() => {}}
          onSend={() => {}}
          locationEnabled={false}
          onBubbleMenu={() => {}}
          onBubbleCopy={() => {}}
          onResend={() => {}}
          onOpenImage={() => {}}
          onOpenText={() => {}}
          onOpenVideo={() => {}}
          onOpenSvg={() => {}}
          onOpenPdf={() => {}}
          onOpenHtml={() => {}}
          onOpenOffice={() => {}}
          onOpenArchive={() => {}}
          onOpenFile={() => {}}
          onOpenMenu={() => {}}
          onOpenModel={() => {}}
          onCommandEntered={() => false}
          streaming={false}
          onStop={() => {}}
          onQuestionReply={() => {}}
          onNewThread={() => {}}
          subagentDoors={new Map([['t2', { label: 'digger', status: 'idle' as const }]])}
          onOpenSubAgent={() => {}}
          onLoadOlder={() => {}}
          loadingOlder={false}
          uiPrefs={{ expandTools: true, expandReasoning: false }}
        />
      </View>
    </ThemeProvider>
  );
}

AppRegistry.registerComponent('Screen', () => Root);
AppRegistry.runApplication('Screen', { rootTag: document.getElementById('root') });
