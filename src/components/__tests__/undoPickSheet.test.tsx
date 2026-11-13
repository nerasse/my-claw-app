/**
 * The turn picker: what it offers, and the mode it asks the server for.
 *
 * The keyboard is not tested here because the sheet does not own it: `ActionSheet` declares the
 * `menu` layer and walks its own rows on both surfaces, so this picker inherits arrows, Tab,
 * Escape and the letter jump exactly like every other menu. What this file pins is the part that
 * is new -- that the press asks for the mode the server will actually honour.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { agoText, holdsText, UndoPickSheet } from '../UndoPickSheet';
import type { UndoPick } from '../../core/undoStore';

jest.mock('../../core/connection', () => ({ connection: { send: jest.fn(() => Promise.resolve(true)) } }));
jest.mock('../ActionSheet', () => ({
  ActionSheet: (props: { options: Array<{ label: string; hint?: string; onPress: () => void }>; onClose: () => void }) => {
    const { View, Text } = require('react-native');
    return (
      <View>
        {props.options.map((option, i) => (
          <View key={i}>
            <Text onPress={option.onPress}>{option.label}</Text>
            <Text>{option.hint}</Text>
          </View>
        ))}
      </View>
    );
  },
}));

const { connection } = require('../../core/connection');

const PICK: UndoPick = {
  type: 'undo.list',
  id: 'l1',
  threadId: 't-a',
  turns: [
    { n: 1, preview: 'go release', ts: 1, attachments: 0, transcripts: 0, hard: true },
    { n: 2, preview: 'Fais le tout', ts: 1, attachments: 2, transcripts: 1, hard: false },
    { n: 3, preview: 'Compaction (703 tours repliés)', ts: 1, attachments: 0, transcripts: 0, hard: false, compaction: true },
  ],
};

/** Presses the row whose label is `label`, so an index cannot drift from the row it means. */
function press(label: string): void {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<UndoPickSheet pick={PICK} onClose={() => {}} />);
  });
  const row = tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.children === label);
  if (row.length === 0) throw new Error(`no row labelled ${label}`);
  ReactTestRenderer.act(() => { row[0]!.props.onPress(); });
}

describe('the turn picker', () => {
  beforeEach(() => jest.clearAllMocks());

  test('a row whose files are still there asks for hard', () => {
    press('go release');
    expect(JSON.parse(connection.send.mock.calls[0][0])).toEqual({ type: 'undo.choose.list', id: 'l1', n: 1, mode: 'hard' });
  });

  test('a row whose snapshot is gone asks for soft, never a hard it cannot honour', () => {
    press('Fais le tout');
    expect(JSON.parse(connection.send.mock.calls[0][0])).toEqual({ type: 'undo.choose.list', id: 'l1', n: 2, mode: 'soft' });
  });

  test('a compaction is conversation-only whatever the flag says', () => {
    press('Compaction (703 tours repliés)');
    expect(JSON.parse(connection.send.mock.calls[0][0])).toMatchObject({ n: 3, mode: 'soft' });
  });

  test('holdsText counts files and voice notes, never inlines them', () => {
    expect(holdsText(PICK.turns[0]!)).toBe('');
    expect(holdsText(PICK.turns[1]!)).toBe('2 fichiers, 1 vocal');
  });

  test('agoText is a distance a reader can place', () => {
    const now = Date.now();
    expect(agoText(now - 20_000, now)).toBe("à l'instant");
    expect(agoText(now - 5 * 60_000, now)).toBe('5 min');
    expect(agoText(now - 3 * 3600_000, now)).toBe('3 h');
    expect(agoText(now - 2 * 86400_000, now)).toBe('2 j');
  });
});
