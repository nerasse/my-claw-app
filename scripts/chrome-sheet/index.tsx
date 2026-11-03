/**
 * A visual sheet for the chrome: the pages that carry the most icons, side by side, with no login.
 *
 * Reaching these screens in the real app means signing in and clicking through four levels, which a
 * browser check cannot do, and a component that compiles is not a component that looks right. The
 * parts are the real ones; only the data is made up.
 */
import React, { useState } from 'react';
import { AppRegistry, ScrollView, View } from 'react-native';
import { ModelsScreen } from '../../src/app/ModelsScreen';
import { TagsScreen } from '../../src/app/TagsScreen';
import { AppearanceScreen } from '../../src/app/AppearanceScreen';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { DEFAULT_THEME_ID, type ThemeId } from '../../src/theme/themes';
import { prefs } from '../../src/core/prefs';

const PROVIDERS = [
  { key: 'anthropic', label: 'Anthropic', kind: 'subscription', models: 4 },
  { key: 'openai', label: 'OpenAI', kind: 'subscription', models: 6 },
  { key: 'synthetic', label: 'Synthetic', kind: 'api', models: 9 },
] as never;

const TAGS = [
  { name: 'Default', model: 'zen/gpt-5.6-luna', effort: 'medium' },
  { name: 'Cheap', model: 'synthetic/deepseek-v4', effort: 'low', contextCap: 120000 },
  { name: 'Smart', model: 'anthropic/claude-opus', effort: 'high' },
] as never;

function Sheets() {
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [mode, setMode] = useState<'system' | 'light' | 'dark'>('light');
  const noop = () => {};
  return (
    <ThemeProvider>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 40 }}>
        <View style={{ height: 720 }}>
          <ModelsScreen
            config={null}
            providers={PROVIDERS}
            error={null}
            onBack={noop}
            onNewProvider={noop}
            onOpenProvider={noop}
            onOpenAccount={noop}
            onOpenDefaultModel={noop}
            onOpenFallback={noop}
            onSetRetry={noop}
            onOpenContextCap={noop}
            onOpenTags={noop}
          />
        </View>
        <View style={{ height: 560 }}>
          <TagsScreen tags={TAGS} status="ready" error={null} onBack={noop} onNewTag={noop} onEditTag={noop} onDeleteTag={noop} onOpenContextCap={noop} />
        </View>
        <View style={{ height: 900 }}>
          <AppearanceScreen
            themeId={themeId}
            onThemeIdChange={setThemeId}
            custom={prefs.get().customTheme}
            onCustomChange={noop}
            themeMode={mode}
            onThemeModeChange={next => setMode(next as typeof mode)}
            chatFontScale={1}
            onChatFontScaleChange={noop}
            uiPrefs={{}}
            onUiPrefsChange={noop}
            onBack={noop}
          />
        </View>
      </ScrollView>
    </ThemeProvider>
  );
}

AppRegistry.registerComponent('Sheets', () => Sheets);
AppRegistry.runApplication('Sheets', { rootTag: document.getElementById('root') });
