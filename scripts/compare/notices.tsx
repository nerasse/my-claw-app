/**
 * A provider note in the thread: the one row a model switch leaves behind.
 *
 * A switch used to arrive as two rows for one instant -- `Quota` announcing the wall, then
 * `Fallback` announcing the move -- and the owner read two incidents where there was one
 * (2026-11-14). The cause is a sentence inside the note now, and the kind says what happened.
 */
import React from 'react';
import { AppRegistry, ScrollView, Text, View } from 'react-native';
import { ProviderNotice } from '../../src/components/ProviderNotice';
import { RunFailure } from '../../src/components/RunFailure';
import { prefs } from '../../src/core/prefs';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { font, space, useThemedStyles, type Palette } from '../../src/theme';
import type { TextItem } from '../../src/core/chat';

if (typeof location !== 'undefined' && location.search.includes('dark')) prefs.set('themeMode', 'dark');

const at = (minutesAgo: number): number => Date.now() - minutesAgo * 60_000;

const note = (id: string, text: string, minutesAgo: number): TextItem => ({
  kind: 'text',
  id,
  role: 'agent',
  text,
  attachments: [],
  streaming: false,
  notice: true,
  ts: at(minutesAgo),
});

function Sheet(): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.h}>a switch: the wall and the move, in one row</Text>
      <ProviderNotice
        item={note(
          'n1',
          '[fallback] synthetic/hf.deepseek-ai/DeepSeek-V4.1-Flash-1017 is out of its week allowance (Week at 100%). This run used anthropic/claude-opus-5 instead (Quota route candidate 2) rather than wait out a bar that does not move.',
          1,
        )}
      />

      <Text style={styles.h}>an outage, not a wall: it comes back on its own</Text>
      <ProviderNotice
        item={note(
          'n2',
          '[fallback] openai/gpt-5.2 via openai is unavailable (429 · rate limited). This run used anthropic/claude-opus-5 instead (configured default); it returns to openai/gpt-5.2 once the provider recovers.',
          4,
        )}
      />

      <Text style={styles.h}>a capability refusal</Text>
      <ProviderNotice
        item={note(
          'n3',
          '[fallback] deepseek/v4.1-flash cannot do this (image input: the model takes text only). This run used anthropic/claude-opus-5 instead (configured default); it returns to deepseek/v4.1-flash once the provider recovers.',
          6,
        )}
      />

      <Text style={styles.h}>a retry keeps its own word: same model, a wait</Text>
      <ProviderNotice item={note('n4', "[retry] alpha-1 failed on the provider's side (overloaded); trying again in 30s.", 8)} />

      <Text style={styles.h}>and the one thing that is an alarm, for contrast</Text>
      <RunFailure error={'HTTP 429 — {"error":{"type":"rate_limit_error","message":"You have exceeded your rate limit"}}'} />
    </ScrollView>
  );
}

const createStyles = (palette: Palette) => ({
  page: { padding: 20, gap: 4, backgroundColor: palette.bg, minHeight: '100vh' as never },
  h: {
    fontSize: font.micro,
    color: palette.textFaint,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
    marginTop: space.lg,
    marginBottom: space.xxs,
  },
});

function Root(): React.JSX.Element {
  return (
    <ThemeProvider>
      <Sheet />
    </ThemeProvider>
  );
}

AppRegistry.registerComponent('Notes', () => Root);
AppRegistry.runApplication('Notes', { rootTag: document.getElementById('root') });
