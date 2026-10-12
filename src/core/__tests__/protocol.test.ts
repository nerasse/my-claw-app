import {
  encodeAgentsDefaultCapSet,
  encodeAgentsConfigGet,
  encodeAgentsModelClear,
  encodeAgentsModelSet,
  encodeAgentsFallbackSet,
  encodeChatSend,
  encodeInstructionsGetNested,
  encodeInstructionsSetNested,
  encodeJobsSave,
  encodeModelEffortSet,
  encodeCommandsList,
  encodeFileDelete,
  encodeFilesList,
  encodeQuestionReply,
  encodeUndoCancel,
  encodeUndoChoose,
  encodeSessionArchive,
  encodeSessionDelete,
  encodeSessionHistory,
  encodeSessionInstructionsGet,
  encodeSessionList,
  encodeUiPrefsGet,
  encodeUiPrefsSet,
  parseServerFrame,
} from '../protocol';

describe('undo encoders', () => {
  test('encodeUndoChoose and encodeUndoCancel round-trip', () => {
    expect(JSON.parse(encodeUndoChoose('u1', 'soft'))).toEqual({ type: 'undo.choose', id: 'u1', mode: 'soft' });
    expect(JSON.parse(encodeUndoChoose('u1', 'hard'))).toEqual({ type: 'undo.choose', id: 'u1', mode: 'hard' });
    expect(JSON.parse(encodeUndoCancel('u1'))).toEqual({ type: 'undo.cancel', id: 'u1' });
  });
});

describe('parseServerFrame', () => {
  test('accepts every frame the server can send', () => {
    const frames = [
      { type: 'chat.message', id: 'a', text: 'x', threadId: 't', attachments: [] },
      { type: 'chat.run.start', threadId: 't' },
      { type: 'chat.run.end', threadId: 't', reason: 'aborted' },
      { type: 'chat.run.stopping', threadId: 't', run: 'r1' },
      { type: 'chat.stream.start', id: 'a', threadId: 't' },
      { type: 'chat.stream.delta', id: 'a', threadId: 't', text: 'x' },
      { type: 'chat.stream.done', id: 'a', threadId: 't' },
      { type: 'chat.stream.abort', id: 'a', threadId: 't' },
      { type: 'chat.tool', id: 'a:tool:1', threadId: 't', turnId: 'a', name: 'bash', args: {}, ok: true, output: '', truncated: false, ts: 'iso' },
      { type: 'chat.history', threadId: 't', messages: [] },
      { type: 'session.list.result', sessions: [] },
      { type: 'commands.list.result', commands: [{ name: 'status', description: 'diag' }] },
      { type: 'uiPrefs.result', expandTools: true, expandReasoning: false },
      { type: 'files.list.result', threadId: 't', files: [{ id: 'f1', filename: 'a.pdf', type: 'file', mimeType: 'application/pdf', sizeBytes: 4, ts: 'iso' }], totalBytes: 4 },
      { type: 'approval.request', id: 'a', threadId: 't', toolName: 'bash', args: {}, expiresAt: 1 },
      { type: 'question.ask', id: 'q1', threadId: 't', questions: [{ header: 'h', question: 'q', options: [{ label: 'a' }] }], ts: 'iso' },
      { type: 'question.resolved', id: 'q1', threadId: 't', reason: 'answered' },
      { type: 'undo.prompt', id: 'u1', threadId: 't', turnPreview: 'x', diff: [], ts: 'iso' },
      { type: 'undo.resolved', id: 'u1', threadId: 't', reason: 'chosen' },
      { type: 'agents.config.result', defaultModel: 'm', defaultEffort: '', effortLevels: [], providers: [], agents: [] },
      {
        type: 'session.instructions.result',
        threadId: 't',
        instructions: {
          agent: 'orchestrator',
          workspace: 'default',
          workspaceDir: '/ws',
          model: 'm',
          backend: 'openai',
          platform: 'my-claw-app',
          totalBytes: 0,
          layers: [],
          nested: [],
          notes: [],
        },
      },
      { type: 'error', message: 'x' },
    ];
    for (const frame of frames) {
      expect(parseServerFrame(JSON.stringify(frame))?.type).toBe(frame.type);
    }
  });

  /**
   * The whitelist is keyed by the frame union, so a frame the server can send and the app cannot
   * name does not compile. What is left to check at runtime is that the lookup is a lookup: a
   * prototype key is not a frame, and a mirrored prompt is one.
   */
  test('the whitelist is a lookup, not an object with a prototype', () => {
    expect(parseServerFrame('{"type":"chat.user","threadId":"t","id":"m1","text":"hi"}')?.type).toBe('chat.user');
    expect(parseServerFrame('{"type":"toString"}')).toBeNull();
    expect(parseServerFrame('{"type":"constructor"}')).toBeNull();
    expect(parseServerFrame('not json')).toBeNull();
    expect(parseServerFrame('null')).toBeNull();
    expect(parseServerFrame('[]')).toBeNull();
    expect(parseServerFrame('{"type":"chat.unknown"}')).toBeNull();
    expect(parseServerFrame('{"id":"no type"}')).toBeNull();
    expect(parseServerFrame('"plain text"')).toBeNull();
  });

  test('encodes uiPrefs frames', () => {
    expect(JSON.parse(encodeUiPrefsGet())).toEqual({ type: 'uiPrefs.get' });
    expect(JSON.parse(encodeUiPrefsSet({ expandTools: true }))).toEqual({ type: 'uiPrefs.set', prefs: { expandTools: true } });
  });

  test('encodes question.reply', () => {
    expect(JSON.parse(encodeQuestionReply('q1', [['fr']]))).toEqual({ type: 'question.reply', id: 'q1', answers: [['fr']] });
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
    expect(JSON.parse(encodeSessionHistory('t', 10))).toEqual({ type: 'session.history', threadId: 't', limit: 10, fold: true, lazyReasoning: true });
    expect(JSON.parse(encodeSessionHistory('t'))).toMatchObject({ limit: 50 });
    expect(JSON.parse(encodeSessionArchive('t'))).toEqual({ type: 'session.archive', threadId: 't' });
    expect(JSON.parse(encodeSessionDelete('t'))).toEqual({ type: 'session.delete', threadId: 't' });
    expect(JSON.parse(encodeAgentsConfigGet())).toEqual({ type: 'agents.config.get' });
    expect(JSON.parse(encodeAgentsModelSet('cron', 'opus'))).toEqual({ type: 'agents.model.set', agent: 'cron', model: 'opus' });
    expect(JSON.parse(encodeAgentsModelSet('global', 'opus', 'high'))).toEqual({
      type: 'agents.model.set',
      agent: 'global',
      model: 'opus',
      effort: 'high',
    });
    expect(JSON.parse(encodeAgentsModelSet('cron', 'opus', ''))).toEqual({
      type: 'agents.model.set',
      agent: 'cron',
      model: 'opus',
      effort: '',
    });
    expect(JSON.parse(encodeAgentsModelClear('cron'))).toEqual({ type: 'agents.model.clear', agent: 'cron' });
    expect(JSON.parse(encodeAgentsFallbackSet('opus'))).toEqual({ type: 'agents.fallback.set', model: 'opus' });
    expect(JSON.parse(encodeAgentsFallbackSet(''))).toEqual({ type: 'agents.fallback.set', model: '' });
    expect(JSON.parse(encodeModelEffortSet('t', ''))).toEqual({ type: 'model.effort.set', threadId: 't', level: '' });
    expect(JSON.parse(encodeJobsSave({ name: 'j', prompt: 'p', schedule: 'every 1h', enabled: true, silent: false, effort: '', skills: { mode: 'inherit' }, mcp: { mode: 'inherit' }, tools: { mode: 'inherit' }, subagents: true, browser: false, followUp: true, followUpPrompt: '' }))).toMatchObject({ type: 'jobs.save', effort: '', followUp: true, followUpPrompt: '' });
    expect(JSON.parse(encodeSessionInstructionsGet('t'))).toEqual({ type: 'session.instructions.get', threadId: 't' });
  });

  test('a nested AGENTS.md carries the thread that authorises its path', () => {
    // A relative path is fenced by the workspace root, so it needs no thread.
    expect(JSON.parse(encodeInstructionsGetNested('default', 'svc/AGENTS.md'))).toEqual({
      type: 'instructions.get',
      workspace: 'default',
      nested: 'svc/AGENTS.md',
    });
    // An absolute one is only accepted against the session that recorded reading it.
    expect(JSON.parse(encodeInstructionsGetNested('default', '/home/me/dev/repo/AGENTS.md', 't9'))).toEqual({
      type: 'instructions.get',
      workspace: 'default',
      nested: '/home/me/dev/repo/AGENTS.md',
      threadId: 't9',
    });
    // The sha is never omitted on a nested write: an absent one means "create", which the server
    // refuses for a nested file.
    expect(JSON.parse(encodeInstructionsSetNested('default', '/repo/AGENTS.md', 'body', 'abc123abc123', 't9'))).toEqual({
      type: 'instructions.set',
      workspace: 'default',
      file: '',
      nested: '/repo/AGENTS.md',
      content: 'body',
      sha: 'abc123abc123',
      threadId: 't9',
    });
  });
});

describe('encodeAgentsDefaultCapSet', () => {
  test('a value, 0 and null all travel as written: 0 lifts the ceiling, null restores the default', () => {
    expect(JSON.parse(encodeAgentsDefaultCapSet(256_000))).toEqual({ type: 'agents.defaultcap.set', value: 256_000 });
    expect(JSON.parse(encodeAgentsDefaultCapSet(0))).toEqual({ type: 'agents.defaultcap.set', value: 0 });
    expect(JSON.parse(encodeAgentsDefaultCapSet(null))).toEqual({ type: 'agents.defaultcap.set', value: null });
  });
});

test('APNs result JSON enters the real parser and rejects malformed acknowledgements', () => {
  expect(parseServerFrame(JSON.stringify({ type: 'notifications.apns.result', ok: true, registrationId: 'registration' }))).toMatchObject({ ok: true });
  expect(parseServerFrame(JSON.stringify({ type: 'notifications.apns.result', ok: 'yes' }))).toBeNull();
});
