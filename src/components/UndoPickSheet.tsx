/**
 * The turn picker: `/undo list` shows the conversation's last turns, and picking one rewinds.
 *
 * The reason this is a sheet and not a text list is scale. Measured on a real session: 588 user
 * turns, the longest 54 KB, 64 carrying files, 200 carrying voice notes. A conversation's history
 * is not a feed anyone scrolls to place themselves -- the server sends one clipped line per turn
 * (72 characters, plus what it holds) and the sheet draws those.
 *
 * `hard` is the honest half: the file snapshots are bounded per session, so a deep turn can only
 * rewind the conversation. The row says which it is, and the mode it allows is what gets sent --
 * offering a restore that cannot happen would fail after the branch had already moved.
 */

import React from 'react';
import { ActionSheet, type SheetEntry } from './ActionSheet';
import { undoStore, type UndoMode, type UndoPick } from '../core/undoStore';
import { encodeUndoChooseList } from '../core/protocol';
import { connection } from '../core/connection';

export interface UndoPickSheetProps {
  pick: UndoPick;
  onClose: () => void;
}

/** "5 min", "2 h", "3 j": the same distance the server prints, so the two never disagree. */
export function agoText(ms: number, now = Date.now()): string {
  const min = Math.round(Math.max(0, now - ms) / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} j`;
}

/** What the turn holds, in the two things a bubble would have drawn bigger. */
export function holdsText(turn: UndoPick['turns'][number]): string {
  const parts: string[] = [];
  if (turn.attachments > 0) parts.push(`${turn.attachments} fichier${turn.attachments > 1 ? 's' : ''}`);
  if (turn.transcripts > 0) parts.push(`${turn.transcripts} vocal${turn.transcripts > 1 ? 's' : ''}`);
  return parts.join(', ');
}

export function UndoPickSheet({ pick, onClose }: UndoPickSheetProps): React.JSX.Element {
  const choose = (n: number, mode: UndoMode): void => {
    connection.send(encodeUndoChooseList(pick.id, n, mode)).catch(() => {});
    // The sheet closes when `undo.resolved` lands; marking the choice locally keeps it from
    // being pressed twice while the round trip is in flight.
    undoStore.pick(pick.id, n, mode);
    onClose();
  };

  const options: SheetEntry[] = pick.turns.map((turn) => {
    const mode: UndoMode = turn.hard && !turn.compaction ? 'hard' : 'soft';
    const holds = holdsText(turn);
    const hint = [
      agoText(turn.ts),
      turn.compaction ? 'compaction' : mode === 'hard' ? 'conversation + fichiers' : 'conversation seule',
      holds,
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      key: `turn-${turn.n}`,
      label: turn.preview,
      hint,
      icon: undefined,
      onPress: () => choose(turn.n, mode),
    };
  });

  if (options.length === 0) {
    options.push({ label: 'Rien à annuler', hint: 'Aucun tour utilisateur.', onPress: onClose });
  }

  return (
    <ActionSheet
      preview="Undo : choisir le tour"
      options={options}
      onClose={onClose}
    />
  );
}
