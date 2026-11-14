/**
 * What a provider note says, apart from how it is drawn.
 *
 * The notes the server raises on a failure -- `[retry]`, `[quota]`, `[fallback]` -- carry their
 * kind as a bracket tag, because the surface is the one that decides how a kind looks
 * (`hooks/types.ts`). Parsing it here keeps the tag out of the thread: a reader has no use for
 * `[quota]` in front of a sentence.
 */
export interface NoticeText {
  /** The tag the server wrote, when it wrote one: `quota`, `fallback`, `retry`. */
  kind?: string;
  /** The word the row leads with: the kind, capitalised. `Note` for a notice with no tag. */
  label: string;
  /** The note itself, without its tag. */
  body: string;
}

/**
 * The kind of a provider note, in the reader's words.
 *
 * One kind for one event. A switch used to arrive as two rows -- `Quota` announcing the wall, then
 * `Fallback` announcing the move -- for the same instant, which read as two incidents (owner,
 * 2026-11-14: "un item quota et un autre fallback ... ils ont la même utilité d'info"). The cause
 * is in the sentence now, so the row only has to say what happened: the run changed model.
 *
 * `quota` stays here for the entries an older server already wrote to a log; nothing emits it now.
 * `retry` is a different event and keeps its own word: the run waits and stays on the same model.
 */
const TAGS: Readonly<Record<string, string>> = {
  fallback: 'Model change',
  retry: 'Retry',
  quota: 'Quota',
};

export function noticeOf(text: string): NoticeText {
  const tagged = /^\s*\[([a-z]+)\]\s*([\s\S]*)$/.exec(text);
  if (!tagged) return { label: 'Note', body: text.trim() };
  const kind = tagged[1]!;
  return {
    kind,
    label: TAGS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1),
    body: tagged[2]!.trim(),
  };
}
