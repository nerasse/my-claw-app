import type { ChatItem } from './chat';

/** Tool output long enough that a transcript would drown in it; the tail is dropped, and said so. */
const OUTPUT_CAP = 2000;

function fence(body: string): string {
  // A fence longer than any run of backticks inside, or the body would close it early. Tool output
  // holds code often enough that this is the normal case, not the exotic one.
  const longest = (body.match(/`+/g) ?? []).reduce((n, run) => Math.max(n, run.length), 0);
  const rail = '`'.repeat(Math.max(3, longest + 1));
  return `${rail}\n${body}\n${rail}`;
}

function toolBlock(item: Extract<ChatItem, { kind: 'tool' }>): string {
  const head = [
    `**${item.name}**`,
    item.running ? 'running' : item.ok ? 'ok' : 'failed',
    item.durationMs === undefined ? null : `${Math.round(item.durationMs / 100) / 10}s`,
  ]
    .filter(Boolean)
    .join(' · ');
  const body = item.output.length > OUTPUT_CAP ? `${item.output.slice(0, OUTPUT_CAP)}\n[output cut]` : item.output;
  const cut = item.truncated ? '\n[output truncated by the server]' : '';
  return body.trim().length === 0 ? head : `${head}\n${fence(body + cut)}`;
}

/**
 * A conversation's work as markdown, meant to be pasted into an issue or a review.
 *
 * Tool results are in and reasoning is out, which is what was asked for: the transcript records
 * what the agent did, not what it thought.
 *
 * A folded run is announced rather than skipped. Its items are not on the device until the group
 * is opened (docs/run-hydration.md), so dropping them silently would hand over a transcript that
 * reads as complete while missing the actual work.
 */
export function formatTranscript(title: string, items: ChatItem[]): string {
  const blocks = items.map(item => {
    if (item.kind === 'tool') return toolBlock(item);
    if (item.kind === 'run') {
      return `_[${item.itemCount} item${item.itemCount === 1 ? '' : 's'} folded, open the group to include them]_`;
    }
    const attachments =
      item.attachments.length > 0
        ? `\n_[${item.attachments.length} attachment${item.attachments.length === 1 ? '' : 's'}]_`
        : '';
    const text = item.text.trim().length === 0 ? '_[empty]_' : item.text;
    return `### ${item.role}\n${text}${attachments}`;
  });
  return [`# ${title}`, ...blocks].join('\n\n').concat('\n');
}
