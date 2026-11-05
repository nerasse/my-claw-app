/**
 * The real ChatScreen over a thread long enough to scroll, in the app's own frame.
 *
 * The harness beside this one shows one screen's worth of turns. This one exists for the two
 * things that only appear on a thread that overflows: the scrollbar, and the `onEndReached` paging.
 * It is also the only harness that wraps the screen in the shell's bounded column -- without that
 * a flex child grows to its content, the list measures as tall as the thread, and every scroll
 * question answers itself the wrong way (found the hard way, 2026-11-05).
 */
import React from 'react';
import { AppRegistry, View } from 'react-native';
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


// A long thread, to see what the list does when it has to scroll: the reported bug is a
// conversation with history behind it that refuses to move.
const LONG = [...HISTORY];
for (let i = 0; i < 60; i += 1) {
  LONG.push({
    id: `u-long-${i}`,
    role: 'user',
    text: `Question ${i} : est-ce que le thread defile une fois qu'il depasse l'ecran ?`,
    ts: iso(10000 + i * 1000),
  });
  LONG.push({
    id: `a-long-${i}`,
    role: 'assistant',
    text: `Reponse ${i}. Le contenu doit grandir et la barre doit apparaitre.`,
    ts: iso(10500 + i * 1000),
  });
}
HISTORY.length = 0;
HISTORY.push(...LONG);
chatStore.seedHistory(THREAD, HISTORY);
// The server holds older turns than the ones on screen, which is what the pager is for.
chatStore.setPage(THREAD, { nextBefore: 20, hasMore: true });


function Root(): React.JSX.Element {
  return (
    <ThemeProvider>
      <Shell>
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
        // Paged for real, so the scroll and the ask after the oldest page can both be watched.
        onLoadOlder={() => {
          const page = chatStore.getPage(THREAD);
          if (!page.hasMore || page.loading) return;
          chatStore.setPageLoading(THREAD, true);
          const older: HistoryEntry[] = [];
          for (let i = 0; i < 20; i += 1) {
            older.push({ id: `old-u-${page.nextBefore}-${i}`, role: 'user', text: `Vieille question ${i}`, ts: iso(-100000 - page.nextBefore * 1000 - i * 1000) });
            older.push({ id: `old-a-${page.nextBefore}-${i}`, role: 'assistant', text: `Vieille reponse ${i}.`, ts: iso(-99500 - page.nextBefore * 1000 - i * 1000) });
          }
          chatStore.prependHistory(THREAD, older);
          chatStore.setPage(THREAD, { nextBefore: page.nextBefore + 20, hasMore: page.nextBefore + 20 < 120 });
        }}
        loadingOlder={false}
        uiPrefs={{ expandTools: true, expandReasoning: false }}
      />
      </Shell>
    </ThemeProvider>
  );
}

/**
 * The app's own frame, which the harness lacked: `ChatScreen` is `flex: 1`, and a flex child of a
 * page with no fixed height grows to its content instead of being bounded by the window. Without
 * this the list measured as tall as its content and the bug under test could not exist at all.
 */
const shellStyle = { flex: 1, minHeight: 0, overflow: 'hidden' as const };

function Shell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <View style={shellStyle}>{children}</View>;
}

AppRegistry.registerComponent('Screen', () => Root);
AppRegistry.runApplication('Screen', { rootTag: document.getElementById('root') });
