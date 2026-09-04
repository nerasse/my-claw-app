import { formatTranscript } from '../transcript';
import type { ChatItem } from '../chat';

function text(role: 'user' | 'agent', body: string, extra: Partial<Extract<ChatItem, { kind: 'text' }>> = {}): ChatItem {
  return { kind: 'text', id: `t-${role}-${body.slice(0, 4)}`, role, text: body, attachments: [], streaming: false, ts: 1, ...extra };
}

function tool(name: string, output: string, extra: Partial<Extract<ChatItem, { kind: 'tool' }>> = {}): ChatItem {
  return { kind: 'tool', id: `x-${name}`, name, args: {}, ok: true, output, truncated: false, ts: 1, ...extra };
}

describe('formatTranscript', () => {
  it('keeps what the agent did and drops what it thought', () => {
    const out = formatTranscript('digger', [
      text('user', 'find the leak'),
      text('agent', 'found it', { reasoning: 'let me think about where it could be' }),
    ]);

    expect(out).toContain('find the leak');
    expect(out).toContain('found it');
    expect(out).not.toContain('let me think');
  });

  it('carries tool output, since that is the point of including tools', () => {
    const out = formatTranscript('digger', [tool('bash', 'total 4\ndrwxr-xr-x')]);

    expect(out).toContain('**bash**');
    expect(out).toContain('drwxr-xr-x');
  });

  it('marks a failed tool as failed rather than reading like a success', () => {
    const out = formatTranscript('digger', [tool('bash', 'command not found', { ok: false })]);

    expect(out).toContain('failed');
    expect(out).not.toContain('· ok');
  });

  // The trap this guards: a fold stands for items the device never loaded. A transcript that
  // skipped it would look complete while missing the work.
  it('announces a folded run instead of silently dropping it', () => {
    const out = formatTranscript('digger', [
      { kind: 'run', id: 'run-1', run: { id: 'r1', status: 'done', startTs: 1 }, toolCount: 3, itemCount: 12, lastId: 'e9', hydration: 'idle', ts: 1 },
    ]);

    expect(out).toContain('12 items folded');
  });

  it('closes a fence that the output itself opens', () => {
    const out = formatTranscript('digger', [tool('read', 'here is code:\n```\nx = 1\n```\ndone')]);

    // The body holds a run of three backticks, so the rail has to be longer or the block ends early.
    expect(out).toContain('````');
    expect(out.trimEnd().endsWith('````')).toBe(true);
  });

  it('says an output was cut rather than handing over a silent half', () => {
    const out = formatTranscript('digger', [tool('bash', 'x'.repeat(5000))]);

    expect(out).toContain('[output cut]');
    expect(out.length).toBeLessThan(3000);
  });

  it('reports the server truncation too, which is a different cut', () => {
    const out = formatTranscript('digger', [tool('bash', 'short', { truncated: true })]);

    expect(out).toContain('[output truncated by the server]');
  });

  it('records that a message carried attachments, which the text alone loses', () => {
    const out = formatTranscript('digger', [
      text('user', 'look at this', { attachments: [{ id: 'a1', type: 'image', filename: 'shot.png' }] }),
    ]);

    expect(out).toContain('1 attachment]');
  });

  it('titles the transcript so a pasted one names its agent', () => {
    expect(formatTranscript('research-a3f1', []).startsWith('# research-a3f1')).toBe(true);
  });
});
