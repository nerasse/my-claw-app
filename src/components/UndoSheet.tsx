/**
 * The undo sheet: a bare `/undo` asks which mode before acting.
 *
 * Conversation only (soft) is the historical behaviour and needs no confirmation; conversation
 * plus files (hard) rewrites the workspace, so it is offered with the precomputed diff. The
 * choice is sent once; `undo.resolved` closes the sheet wherever it was answered.
 */

import React from 'react';
import { ActionSheet, type SheetEntry } from './ActionSheet';
import { undoStore, type UndoMode } from '../core/undoStore';
import { encodeUndoChoose } from '../core/protocol';
import { connection } from '../core/connection';

export interface UndoSheetProps {
  /** The prompt's id, from the store; the sheet shows the newest one of the open thread. */
  id: string;
  turnPreview: string;
  diff: Array<{ root: string; files?: number; additions: number; deletions: number }>;
  onClose: () => void;
}

/**
 * The files first, then the lines: a binary or an emptied file is +0/-0 and a restore still
 * rewrites it, so the line counts alone read as "nothing" on exactly the changes that matter.
 */
export function diffText(diff: UndoSheetProps['diff']): string {
  if (diff.length === 0) return 'Aucun changement de fichier dans la session.';
  return diff
    .map(d => {
      const name = d.root.split('/').pop() || d.root;
      const lines = `+${d.additions}/-${d.deletions}`;
      if (d.files === undefined) return `${name}: ${lines}`;
      return `${name}: ${d.files} fichier${d.files > 1 ? 's' : ''} (${lines})`;
    })
    .join(', ');
}

export function UndoSheet({ id, turnPreview, diff, onClose }: UndoSheetProps): React.JSX.Element {
  const choose = (mode: UndoMode): void => {
    connection.send(encodeUndoChoose(id, mode)).catch(() => {});
    // The sheet closes when `undo.resolved` lands; marking the choice locally keeps it from
    // reopening while the round trip is in flight.
    undoStore.choose(id, mode);
    onClose();
  };

  const options: SheetEntry[] = [
    {
      label: 'Conversation seule',
      hint: 'Rembobine le chat. Les fichiers restent tels quels.',
      onPress: () => choose('soft'),
    },
    {
      label: 'Conversation + fichiers',
      hint: diff.length > 0 ? `Restaure ${diffText(diff)}` : 'Aucun fichier modifié à restaurer.',
      onPress: () => choose('hard'),
    },
  ];

  return (
    <ActionSheet
      preview={`Undo: « ${turnPreview} »`}
      options={options}
      onClose={onClose}
    />
  );
}
