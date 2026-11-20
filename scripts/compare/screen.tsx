/**
 * The real ChatScreen, fed a thread, so the header and an open card can be measured against the
 * POC's own screenshot instead of against my memory of it.
 *
 * The component harness beside this one stacks components; that answers "what does a card look
 * like" and nothing about the strip above the thread, which is most of what the owner keeps
 * finding off. This one mounts the screen itself with the stores seeded the way the app seeds
 * them, no server and no login.
 */
import React from 'react';
import { AppRegistry } from 'react-native';
import { ChatScreen } from '../../src/app/ChatScreen';
import { chatStore } from '../../src/core/chat';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { ContextMeter } from '../../src/components/ContextMeter';
import type { HistoryEntry } from '../../src/core/protocol';

const TS = Date.parse('2026-11-03T21:40:00.000Z');
const iso = (offset: number): string => new Date(TS + offset).toISOString();
const THREAD = 'harness-thread';

const HISTORY: HistoryEntry[] = [
  {
    id: 'u1',
    role: 'user',
    text: 'Corrige le tout, le résolveur perd `output` dès qu\u2019un modèle ne déclare que `context`.',
    ts: iso(0),
  },
  {
    id: 'u2',
    role: 'user',
    // A turn with a fence, an inline span and a list: the three forms that used to come back
    // flat, so the harness shows what the owner's bubble does with each of them.
    text: [
      'Et le patch du coup :',
      '',
      '```ts',
      'const merged = { ...model.limit, ...global.limit };',
      '```',
      '',
      '- garde `context`',
      '- garde **`output`**',
      '',
      'Paragraphe : **gras**, `mono`, **`gras mono`**, et *`italique mono`*.',
      '',
      '> Citation avec **`gras mono`** dedans.',
    ].join('\n'),
    ts: iso(500),
  },
  {
    id: 'a1',
    role: 'assistant',
    ts: iso(1000),
    text: [
      'Le résolveur fusionnait les limites par objet : dès qu\u2019un modèle déclarait `context`, son',
      '`output` disparaissait au lieu d\u2019hériter du global.',
      '',
      '### Ce qui change',
      '',
      '- La fusion se fait **champ par champ**, plus par objet entier.',
      '- Un modèle qui ne nomme pas `output` hérite du plafond global.',
    ].join('\n'),
    run: { id: 'run-1', status: 'done', startTs: iso(1000), endTs: iso(4000) },
  },
  {
    id: 't1',
    role: 'tool',
    ts: iso(4200),
    name: 'bash',
    args: { command: 'bun test tests/llm/resolver.test.ts' },
    durationMs: 1800,
    ok: true,
    output: 'bun test v1.3.13\n\n 44 pass, 0 fail, 44 expect() calls',
    truncated: false,
    run: { id: 'run-2', status: 'done', startTs: iso(4200), endTs: iso(6000) },
  },
  {
    id: 't2',
    role: 'tool',
    ts: iso(6200),
    name: 'apply_patch',
    args: { path: 'src/llm/resolver.ts' },
    durationMs: 2400,
    ok: true,
    output: [
      'Patched src/llm/resolver.ts',
      '--- a/src/llm/resolver.ts',
      '+++ b/src/llm/resolver.ts',
      '@@ -243,8 +243,14 @@ function mergedLimit',
      '   const merged = { ...config.llm.limit }',
      '-  return model?.limit ?? merged.limit',
      '+  if (model?.limit?.context) merged.context = model.limit.context',
      '+  if (model?.limit?.output) merged.output = model.limit.output',
      '+  return merged',
    ].join('\n'),
    truncated: false,
    run: { id: 'run-2', status: 'done', startTs: iso(4200), endTs: iso(6000) },
  },
  {
    id: 't3',
    role: 'tool',
    ts: iso(6300),
    name: 'read',
    args: { path: 'src/llm/resolver.ts' },
    durationMs: 320,
    ok: true,
    output: 'function mergedLimit(model?: ModelDef): Limit {\n  const merged = { ...config.llm.limit }\n  return merged\n}',
    truncated: false,
    run: { id: 'run-2', status: 'done', startTs: iso(4200), endTs: iso(6000) },
  },
  {
    id: 't4',
    role: 'tool',
    ts: iso(6400),
    name: 'grep',
    args: { pattern: 'max_tokens' },
    durationMs: 900,
    ok: false,
    output: 'no match',
    truncated: false,
    run: { id: 'run-2', status: 'done', startTs: iso(4200), endTs: iso(6000) },
  },
  {
    id: 'a2',
    role: 'assistant',
    ts: iso(8000),
    text: 'Les deux points tiennent. Je n\u2019ai pas touché `mimo` : c\u2019est une ligne de config.',
    run: { id: 'run-2', status: 'done', startTs: iso(4200), endTs: iso(6000) },
  },
];

chatStore.seedHistory(THREAD, HISTORY);

function Root(): React.JSX.Element {
  return (
    <ThemeProvider>
      <ChatScreen
        threadId={THREAD}
        title="Refonte UI — trois directions"
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
        // The model button is drawn from `showsModelButton(width)`, so a harness wide enough to
        // show it is the only way to see the icon the owner's screenshot caught as two dots.
        onOpenModel={() => {}}
        onCommandEntered={() => false}
        streaming
        onStop={() => {}}
        onQuestionReply={() => {}}
        onNewThread={() => {}}
        subagentCount={{ total: 3, running: 1 }}
        onAgentsPress={() => {}}
        subagentDoors={new Map()}
        onLoadOlder={() => {}}
        uiPrefs={{ expandTools: true, expandReasoning: false }}
      />
    </ThemeProvider>
  );
}

AppRegistry.registerComponent('Screen', () => Root);
AppRegistry.runApplication('Screen', { rootTag: document.getElementById('root') });
