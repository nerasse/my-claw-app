/**
 * The sub-agent roster, as the app draws it: one flat list ordered by the last message.
 *
 * What this answers and nothing else can: does a row read as a name you scan (not a card you read),
 * does the running mark sit in a slot that does not move the names, and does the column of dates
 * line up when the ids differ in length.
 */
import React from 'react';
import { AppRegistry, View } from 'react-native';
import { AgentsScreen } from '../../src/app/AgentsScreen';
import { rosterRows } from '../../src/core/subagents';
import { prefs } from '../../src/core/prefs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import type { SubAgentEntry } from '../../src/core/protocol';

if (typeof location !== 'undefined' && location.search.includes('dark')) prefs.set('themeMode', 'dark');

const now = Date.now();
const at = (minutesAgo: number): string => new Date(now - minutesAgo * 60_000).toISOString();

const entry = (over: Partial<SubAgentEntry> & Pick<SubAgentEntry, 'id'>): SubAgentEntry => ({
  threadId: `sub-${over.id.replace(/\W/g, '')}`,
  displayName: over.id.replace(/^subagent\//, ''),
  type: 'research',
  messageCount: 4,
  status: 'idle',
  visibility: 'private',
  createdAt: at(6000),
  ...over,
});

const AGENTS: SubAgentEntry[] = [
  entry({ id: 'subagent/eyes-1a2b', type: 'browser', messageCount: 9, status: 'running', lastMessageAt: at(0), model: 'openai/gpt-5.2' }),
  entry({ id: 'subagent/run-9f2c1d', type: 'run', messageCount: 2, lastMessageAt: at(3) }),
  entry({ id: 'subagent/digger-a1b2', type: 'research', messageCount: 26, lastMessageAt: at(12), model: 'anthropic/claude-opus-5' }),
  entry({
    id: 'subagent/run-77aa01',
    type: 'run',
    messageCount: 1,
    lastMessageAt: at(64),
    model: 'deepseek/v4.1',
  }),
  entry({
    id: 'subagent/coder-3c4d',
    type: 'coder',
    messageCount: 121,
    visibility: 'global',
    lastMessageAt: at(60 * 26),
    model: 'openai/gpt-5.2',
    modelLive: true,
  }),
  entry({ id: 'subagent/reviewer-8e9f', type: 'review', messageCount: 7, visibility: 'workspace', workspaceKey: 'dl-hub', lastMessageAt: at(60 * 24 * 4) }),
];

function Root(): React.JSX.Element {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
      {/* An explicit viewport height: the screen fills its parent, and a harness parent has none. */}
      <View style={{ height: '100vh' as never }}>
      <AgentsScreen
        parentTitle="Refonte UI — trois directions"
        rows={rosterRows(AGENTS)}
        status="ready"
        onClose={() => {}}
        onOpenAgent={() => {}}
      />
      </View>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

AppRegistry.registerComponent('Roster', () => Root);
AppRegistry.runApplication('Roster', { rootTag: document.getElementById('root') });
