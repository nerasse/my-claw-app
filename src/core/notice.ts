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

const TAGS: Readonly<Record<string, string>> = { quota: 'Quota', fallback: 'Fallback', retry: 'Retry' };

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
