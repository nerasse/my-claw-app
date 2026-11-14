import React from 'react';
import { CollapsibleAside } from './CollapsibleAside';
import { noticeOf } from '../core/notice';
import type { TextItem } from '../core/chat';

/**
 * A provider's note: a retry, a spent quota, a model the run left.
 *
 * It used to be a bubble of its own, in full ink inside a red outline, carrying the provider's
 * whole sentence -- quota window, then `HTTP 429 — {"error":"You've exceeded…"}`: two red boxes
 * above the answer, reading as two failures of the conversation (owner, 2026-11-14: "horrible
 * l'ui des erreurs ... fait un truc clean et qui va avec le reste").
 *
 * A note is context about the run, exactly like a thought or the reason a run died, so it takes
 * the shape every other block of context takes (`CollapsibleAside`, as `RunFailure` does): one
 * muted head with the kind, the sentence under it, its own copy and clock. It opens by default --
 * a note exists to be read now, not to be discovered -- and folds away once read.
 *
 * The kind is the only word with any weight, and none of them is an alarm: quota, fallback and
 * retry are the run carrying on, not the run failing. `danger` is reserved for the error a run
 * died of.
 */
export function ProviderNotice({ item }: { item: TextItem }): React.JSX.Element {
  const { label, body } = noticeOf(item.text);
  return (
    <CollapsibleAside
      label={label}
      body={body}
      tone="meta"
      defaultOpen
      showHint="Show what the provider said"
      hideHint="Fold the note"
      clockAt={item.ts}
    />
  );
}
