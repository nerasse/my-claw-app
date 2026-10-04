import { SHORTCUTS, comboLabel } from '../shortcuts';

describe('the shortcut table', () => {
  it('binds every combo once: two actions on one key would be a coin toss', () => {
    const combos = SHORTCUTS.flatMap(entry => entry.combos);
    expect(new Set(combos).size).toBe(combos.length);
  });

  it('a bare-letter shortcut is a Shift letter, the letter its English word starts with', () => {
    const letters = SHORTCUTS.flatMap(entry => entry.combos.map(combo => ({ combo, label: entry.label, id: entry.id })))
      .filter(({ combo }) => /^shift\+[a-z]$/.test(combo));
    expect(letters.map(l => l.combo).sort()).toEqual(['shift+a', 'shift+b', 'shift+f', 'shift+j', 'shift+m', 'shift+n', 'shift+s']);
    // Attachments (the session's files) and Sessions (the list) are named by their word, not by the label.
    const word: Record<string, string> = { attachments: 'a', sessions: 's' };
    for (const { combo, label, id } of letters) {
      expect(combo.slice(-1)).toBe(word[id] ?? label[0]!.toLowerCase());
    }
  });

  it('reads as the keys on the keyboard', () => {
    expect(comboLabel('shift+b')).toBe('⇧B');
    expect(comboLabel('mod+,')).toBe('Ctrl ,');
    expect(comboLabel('shift+escape')).toBe('⇧Esc');
    expect(comboLabel('?')).toBe('?');
    expect(comboLabel('/')).toBe('/');
  });
});
