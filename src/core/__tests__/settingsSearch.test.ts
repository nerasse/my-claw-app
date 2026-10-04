/**
 * The settings search: the owner types what comes to mind, in French or in English, accents or
 * not, and lands on the page that holds the setting (2026-10-04).
 */
import { SETTINGS_ENTRIES, searchSettings } from '../settingsSearch';
import { GROUPS } from '../../app/SettingsScreen';
import { parentOf, type SettingsPage } from '../../app/settingsPages';

const titles = (query: string, nativeApp = true): string[] => searchSettings(query, nativeApp).map(entry => entry.title);

describe('searching the settings', () => {
  it('finds a setting by a French word as well as by its label', () => {
    expect(titles('voix')).toEqual(expect.arrayContaining(['Speech-to-text', 'Text-to-speech']));
    expect(titles('clé')).toContain('Providers and API keys');
    expect(titles('mise à jour')).toContain('Update the server');
  });

  it('ignores accents and case, both ways', () => {
    expect(titles('thème')).toContain('Theme');
    expect(titles('THEME')).toContain('Theme');
    expect(titles('memoire')).toContain('Embeddings');
  });

  it('matches the start of a word, not any substring', () => {
    expect(titles('voi')).toContain('Speech-to-text');
    expect(titles('ice')).toEqual([]);
  });

  it('puts the settings named by what was typed first', () => {
    // "browser" is the title of the Browser service, and only a word in the terms of the others.
    expect(titles('browser')[0]).toBe('Browser');
    expect(titles('browser').length).toBeGreaterThan(1);
  });

  it('offers what only the phone has only on the phone', () => {
    expect(titles('apk', true)).toContain('Update the app');
    expect(titles('apk', false)).toEqual([]);
  });

  it('answers nothing to nothing', () => {
    expect(searchSettings('   ', true)).toEqual([]);
  });
});

describe('every setting has a home', () => {
  const indexPages = new Set<SettingsPage>(GROUPS.flatMap(group => group.categories.map(category => category.page)));

  /** A page is reachable when walking its parents ends on a row of the index. */
  function reachable(page: SettingsPage): boolean {
    let current = page;
    for (let step = 0; step < 5; step++) {
      if (indexPages.has(current)) return true;
      // The setup is reached from the banner while unfinished, and from Advanced after.
      if (current === 'setup') return indexPages.has('advanced');
      current = parentOf(current);
      if (current === 'index') return false;
    }
    return false;
  }

  it.each(SETTINGS_ENTRIES.map(entry => [entry.title, entry.page] as const))('%s is under a row of the index', (_title, page) => {
    expect(reachable(page)).toBe(true);
  });
});
