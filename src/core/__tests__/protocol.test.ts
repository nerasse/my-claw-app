import {
  encodeChatSend,
  encodeCommandsList,
  encodeFileDelete,
  encodeFilesList,
  encodeSessionArchive,
  encodeSessionDelete,
  encodeSessionHistory,
  encodeSessionList,
  parseServerFrame,
} from '../protocol';

describe('parseServerFrame', () => {
  test('accepts every frame the server can send', () => {
    const frames = [
      { type: 'chat.message', id: 'a', text: 'x', threadId: 't', attachments: [] },
      { type: 'chat.stream.start', id: 'a', threadId: 't' },
      { type: 'chat.stream.delta', id: 'a', threadId: 't', text: 'x' },
      { type: 'chat.stream.done', id: 'a', threadId: 't' },
      { type: 'chat.stream.abort', id: 'a', threadId: 't' },
      { type: 'chat.tool', id: 'a:tool:1', threadId: 't', turnId: 'a', name: 'bash', args: {}, ok: true, output: '', truncated: false, ts: 'iso' },
      { type: 'chat.history', threadId: 't', messages: [] },
      { type: 'session.list.result', sessions: [] },
      { type: 'commands.list.result', commands: [{ name: 'status', description: 'diag' }] },
      { type: 'files.list.result', threadId: 't', files: [{ id: 'f1', filename: 'a.pdf', type: 'file', mimeType: 'application/pdf', sizeBytes: 4, ts: 'iso' }], totalBytes: 4 },
      { type: 'approval.request', id: 'a', threadId: 't', toolName: 'bash', args: {}, expiresAt: 1 },
      { type: 'error', message: 'x' },
    ];
    for (const frame of frames) {
      expect(parseServerFrame(JSON.stringify(frame))?.type).toBe(frame.type);
    }
  });

  test('rejects anything that is not a known frame', () => {
    expect(parseServerFrame('not json')).toBeNull();
    expect(parseServerFrame('null')).toBeNull();
    expect(parseServerFrame('[]')).toBeNull();
    expect(parseServerFrame('{"type":"chat.unknown"}')).toBeNull();
    expect(parseServerFrame('{"id":"no type"}')).toBeNull();
    expect(parseServerFrame('"plain text"')).toBeNull();
  });

  test('keeps the tool payload intact', () => {
    const frame = parseServerFrame(
      JSON.stringify({
        type: 'chat.tool',
        id: 'a:tool:1',
        threadId: 't',
        turnId: 'a',
        name: 'bash',
        args: { command: 'ls -la' },
        durationMs: 12,
        ok: false,
        output: 'boom',
        truncated: true,
        ts: 'iso',
      }),
    );
    expect(frame).toMatchObject({ name: 'bash', args: { command: 'ls -la' }, durationMs: 12, ok: false, truncated: true });
  });
});

describe('encoders', () => {
  test('produce the frames the server parses', () => {
    expect(JSON.parse(encodeChatSend('id1', 'hi', 'thread1'))).toEqual({
      type: 'chat.send',
      id: 'id1',
      text: 'hi',
      threadId: 'thread1',
    });
    expect(JSON.parse(encodeChatSend('id2', 'hi', 'thread1', [{ id: 'f1', type: 'image' }]))).toEqual({
      type: 'chat.send',
      id: 'id2',
      text: 'hi',
      threadId: 'thread1',
      attachments: [{ id: 'f1', type: 'image' }],
    });
    expect(JSON.parse(encodeSessionList())).toEqual({ type: 'session.list' });
    expect(JSON.parse(encodeCommandsList())).toEqual({ type: 'commands.list' });
    expect(JSON.parse(encodeFilesList('t'))).toEqual({ type: 'files.list', threadId: 't' });
    expect(JSON.parse(encodeFileDelete('t', 'f1'))).toEqual({ type: 'files.delete', threadId: 't', id: 'f1' });
    expect(JSON.parse(encodeSessionHistory('t', 10))).toEqual({ type: 'session.history', threadId: 't', limit: 10 });
    expect(JSON.parse(encodeSessionHistory('t'))).toMatchObject({ limit: 50 });
    expect(JSON.parse(encodeSessionArchive('t'))).toEqual({ type: 'session.archive', threadId: 't' });
    expect(JSON.parse(encodeSessionDelete('t'))).toEqual({ type: 'session.delete', threadId: 't' });
  });
});
