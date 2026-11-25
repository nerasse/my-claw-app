#!/usr/bin/env node
/**
 * A fake my-claw server: the web bundle, and a socket that plays a scripted conversation.
 *
 * The app's web build takes its address from the page's own origin (`serverUrl.web.ts`), so
 * serving the bundle here is the whole of "point the app at the mock": no setting to change, no
 * storage to seed. Every frame below is a real frame from `src/core/protocol.ts`, and no model is
 * ever called -- that is the point. What this exists for is the only thing no unit test can prove:
 * what a browser *does* with the thread -- text selection across several messages, a scrollbar a
 * mouse can drag, a thread pinned to its last message when it opens, a page of older rows landing
 * without moving what is being read.
 *
 *     bash scripts/build-web.sh
 *     node scripts/mock-server.mjs --port 8099
 *     # then open http://127.0.0.1:8099/ in a browser
 *
 * Two conversations are seeded: `Long history` (240 turns, paged, for the anchoring and the
 * scrollbar) and `Scripted run` (a run that streams reasoning, a tool call and an answer, for the
 * live ordering). docs/ui-browser-check.md is the checklist to read on screen.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import ws from 'ws';

// `ws` is CommonJS: the named export does not exist under ESM, only the default one.
const { Server: WebSocketServer } = ws;

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
const ROOT = option('--bundle') ?? fileURLToPath(new URL('../dist-web/', import.meta.url));
const PORT = Number(option('--port') ?? 8099);
const TURNS = Number(process.env.MOCK_LONG_TURNS ?? 120);
const RICH = process.env.MOCK_RICH_HISTORY === '1';
const HISTORY_DELAY = Number(process.env.MOCK_HISTORY_DELAY ?? 0);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (url.pathname === '/__mock/timeline') {
    const body = req.method === 'POST' ? advanceTimeline(url.searchParams.get('step')) : timelineState();
    res.writeHead(body.error ? 400 : 200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
    return;
  }
  if (url.pathname === '/__mock/sub') {
    const body = req.method === 'POST' ? advanceSub(url.searchParams.get('step')) : subState();
    res.writeHead(body.error ? 400 : 200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
    return;
  }
  if (url.pathname.startsWith('/media/')) {
    // The bytes the readers ask for, with the disposition the real server sets: inline for what the
    // app draws, and Range answered the way a PDF reader asks for it.
    const fixture = FIXTURES[url.pathname.slice('/media/'.length)];
    if (!fixture) {
      res.writeHead(404).end('no such fixture');
      return;
    }
    const body = Buffer.from(fixture.body, 'utf8');
    res.writeHead(200, {
      'content-type': fixture.type,
      'content-disposition': `inline; filename="${fixture.filename}"`,
      'content-length': String(body.length),
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
    });
    res.end(body);
    return;
  }
  if (url.pathname === '/mock-late-image.svg') {
    setTimeout(() => res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' }).end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1000"><rect width="600" height="1000" fill="#527795"/></svg>',
    ), 650);
    return;
  }
  const wanted = url.pathname === '/' ? '/index.html' : url.pathname;
  // `normalize` before the join: a mock server is still a file server, and `..` is still `..`.
  const path = join(ROOT, normalize(wanted).replace(/^(\.\.[/\\])+/, ''));
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    // The shell answers everything else, the way the real server does (deep links, sw.js).
    try {
      res.writeHead(200, { 'content-type': TYPES['.html'] });
      res.end(await readFile(join(ROOT, 'index.html')));
    } catch {
      res.writeHead(404).end('dist-web/ is missing: run bash scripts/build-web.sh');
    }
  }
});

const LONG = 'mock-long';
const SCRIPTED = 'mock-scripted';
const STAMP = Date.UTC(2026, 10, 14, 9, 0, 0);
/** Rows per page, so a test can watch a page land. */
const PAGE = 40;

/**
 * The sub-agent scenario, `MOCK_SUBAGENT=1`.
 *
 * A sub-agent's thread is a conversation the app opens like any other, and its id has the server's
 * own shape (`sub-` plus a digest) so the app treats it as one. This scenario exists because the two
 * things a browser can prove here no unit test can: that a chat opened mid-run streams, and that a
 * reload lands back on it rather than on its parent.
 */
const SUB_AGENT = 'subagent/demo-s01-4f08';
const SUB_THREAD = 'sub-0123456789abcdef';
const BROWSER_THREAD = 'sub-0123456789abcdee';
const SUBAGENT = process.env.MOCK_SUBAGENT === '1';
const SUB_PROMPT = 'Audit the fixture folder.';
const SUB_TOOL = 'sub-t-read';
const SUB_ANSWER = 'sub-a1';
const sub = { step: 'idle', frames: [], answer: '' };

const iso = ms => new Date(ms).toISOString();

// Generate the history once. The socket only sends bounded pages of it.
function longHistory() {
  const messages = [];
  for (let i = 0; i < TURNS; i += 1) {
    const ts = iso(STAMP + i * 60_000);
    messages.push({ id: `long-u${i}`, role: 'user', text: `Question ${i}: what does line ${i} say?`, ts });
    messages.push({
      id: `long-a${i}`,
      role: 'assistant',
      text: RICH ? [
        `Answer ${i}.`,
        ...Array.from({ length: i % 6 }, (_, n) => `Report paragraph ${n}. `.repeat(8)),
        ...(i === TURNS - 1 ? ['![Late image](/mock-late-image.svg)', 'Newest history tail.'] : []),
      ].join('\n\n') : `Answer ${i}. `.repeat(6).trim(),
      reasoning: i % 5 === 0 ? `Thinking about question ${i}: the sheet rolls up from its children.` : undefined,
      ts,
    });
  }
  return messages;
}

function scriptedHistory() {
  return [
    { id: 's-u0', role: 'user', text: 'Read the file and tell me what is in it.', ts: iso(STAMP) },
    {
      id: 's-a0',
      role: 'assistant',
      text: 'It lists two names, and both of them are files.',
      reasoning: 'The listing has two entries and no directories.',
      run: 'run-0',
      ts: iso(STAMP + 1000),
    },
    // Two launch cards, because a `send` and a browser task resolve their agent differently from a
    // `spawn`: the send addresses it by id and the browser by the runtime id, neither claims a name.
    // A door drawn by one resolution and tapped by another looked alive and did nothing
    // (owner, 2026-11-15), so both shapes are on the page a browser check looks at.
    {
      id: 's-t-send',
      role: 'tool',
      name: 'send',
      args: { id: 'subagent/demo-s01-4f08', message: 'carry on with the second half' },
      ok: true,
      output: 'sent',
      truncated: false,
      durationMs: 24,
      ts: iso(STAMP + 1500),
      spawn: { callId: 's-t-send', action: 'send', subagentId: 'subagent/demo-s01-4f08', status: 'running', agentType: 'general', mode: 'run' },
    },
    {
      id: 's-t-browser',
      role: 'tool',
      name: 'delegate_browser_task',
      args: { url: 'https://shop.example.com/cart', instructions: 'Check the cart total' },
      ok: true,
      output: 'started',
      truncated: false,
      durationMs: 31,
      ts: iso(STAMP + 1700),
      spawn: { callId: 's-t-browser', action: 'spawn', subagentId: 'subagent/browser-demo-7c11', status: 'complete', agentType: 'browser', mode: 'run' },
    },
    // A scheduled job's delivery: `role: 'user'` on the wire (the prompt needs a turn in that role
    // for the conversation's agent to have read the report), drawn as a card of its own.
    {
      id: 's-cron',
      role: 'user',
      text: '3286 success 2026-11-15T15:27:07+01:00\n\nThe forge run finished and left one failing job behind it, which the report below describes at length because a run id is not a summary.',
      ts: iso(STAMP + 2000),
      // `runId` is the door: the card opens the run's own thread, the way a launch card opens the
      // agent it started.
      from: { label: 'cf-forge-run-3286', kind: 'cron', cadence: 'every 30m', runId: 'cron-0123456789ab-1763200000000' },
    },
  ];
}

const long = longHistory();
const scripted = scriptedHistory();

/**
 * The reader scenario, `MOCK_FILES=1`: one message carrying one attachment of every kind a reader
 * has, served by `/media/<id>` below.
 *
 * It exists because "a PDF opens" is not a fact a unit test can hold: the pane, the server's
 * disposition and the browser's own renderer all have to agree, and each of them has broken this
 * once (owner, 2026-10-15 and 2026-11-25).
 */
const FILES = 'mock-files';
const FILES_ON = process.env.MOCK_FILES === '1';
const PDF_BYTES = [
  '%PDF-1.4',
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
  '4 0 obj<</Length 44>>stream',
  'BT /F1 18 Tf 20 100 Td (fixture pdf) Tj ET',
  'endstream endobj',
  '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
  'trailer<</Root 1 0 R>>',
  '%%EOF',
].join('\n');
const FIXTURES = {
  'file-pdf': { type: 'application/pdf', filename: 'fixture.pdf', body: PDF_BYTES },
  'file-md': { type: 'text/markdown; charset=utf-8', filename: 'fixture.md', body: '# Fixture\n\nOne **bold** line, and a list:\n\n- alpha\n- beta\n' },
  'file-ts': { type: 'text/typescript; charset=utf-8', filename: 'fixture.ts', body: 'export function fixture(n: number): number {\n  return n * 2;\n}\n' },
  'file-txt': { type: 'text/plain; charset=utf-8', filename: 'notes.txt', body: 'A plain note.\nSecond line.\n' },
};
function filesHistory() {
  return [
    {
      id: 'f-u0',
      role: 'user',
      text: 'One of each kind, please.',
      ts: iso(STAMP),
      attachments: [
        { id: 'file-pdf', type: 'file', kind: 'pdf', filename: 'fixture.pdf', mimeType: 'application/pdf', sizeBytes: PDF_BYTES.length },
        { id: 'file-md', type: 'file', kind: 'markdown', filename: 'fixture.md', mimeType: 'text/markdown', sizeBytes: 76 },
        { id: 'file-ts', type: 'file', kind: 'code', filename: 'fixture.ts', mimeType: 'text/typescript', sizeBytes: 62 },
        { id: 'file-txt', type: 'file', kind: 'text', filename: 'notes.txt', mimeType: 'text/plain', sizeBytes: 34 },
      ],
    },
  ];
}

const sessions = [
  {
    threadId: LONG,
    title: 'Long history',
    messageCount: long.length,
    createdAt: iso(STAMP),
    lastActiveAt: iso(STAMP + TURNS * 60_000),
    lastMessageAt: iso(STAMP + TURNS * 60_000),
  },
  {
    threadId: SCRIPTED,
    title: 'Scripted run',
    messageCount: 2,
    createdAt: iso(STAMP),
    lastActiveAt: iso(STAMP + 5000),
    lastMessageAt: iso(STAMP + 5000),
  },
  ...(FILES_ON
    ? [{
        threadId: FILES,
        title: 'Files',
        messageCount: 1,
        createdAt: iso(STAMP),
        lastActiveAt: iso(STAMP + 9000),
        lastMessageAt: iso(STAMP + 9000),
      }]
    : []),
];

/** The live run, scripted step by step so the reader can watch each stage land. */
const RUN_SCRIPT = [
  ['chat.run.start', { run: 'run-1' }],
  ['chat.reasoning.delta', { id: 's-a1', text: 'The file is small. Reading it costs nothing, so read it whole rather than asking which part.' }],
  ['chat.stream.start', { id: 's-a1' }],
  ['chat.stream.delta', { id: 's-a1', text: 'Two names, both files: ' }],
  ['chat.stream.delta', { id: 's-a1', text: '`notes.md` and `todo.md`.' }],
  ['chat.stream.done', { id: 's-a1' }],
  ['chat.tool.start', { id: 's-t1', turnId: 's-a1', name: 'bash', args: { command: 'ls -l' } }],
  ['chat.tool', {
    id: 's-t1',
    turnId: 's-a1',
    name: 'bash',
    args: { command: 'ls -l' },
    ok: true,
    output: '-rw-r--r-- notes.md\n-rw-r--r-- todo.md',
    truncated: false,
    durationMs: 12,
  }],
  ['chat.stream.start', { id: 's-a2' }],
  ['chat.stream.delta', { id: 's-a2', text: 'Both are dated today, so they are the two you just wrote.' }],
  ['chat.reasoning.tokens', { id: 's-a2', tokens: 318 }],
  ['chat.stream.done', { id: 's-a2' }],
  ['chat.run.end', { run: 'run-1', reason: 'done' }],
];

const wss = new WebSocketServer({ server, path: '/my-claw-app' });

const timeline = { step: 'history', frames: [], history: [], hydrations: new Map() };
const requests = [];
const RUN = 'mock-rich-run';
const PROMPT = 'Check the synthetic planning sheet.';
const LIVE_TEXT = 'Live answer begins here.';
const FINAL = 'Finished timeline answer.';
const TOOL = 't-example-read';
const ANSWER = 'timeline-a';
const ANSWER_THOUGHT = 'The totals match the fixture, so I can answer.';
const questionTime = iso(Date.now());
const task = { id: 'timeline-u', role: 'user', text: PROMPT, ts: questionTime };
const run = { id: RUN, status: 'running', startTs: questionTime };
const thinking = { id: 'timeline-thinking', role: 'assistant', text: '', reasoning: 'Checking the fixture headings.', run, ts: questionTime };
const tool = { id: TOOL, role: 'tool', name: 'read', args: { path: 'fixture-sheet.txt' }, output: 'Fixture totals: 5, 12, 17.', ok: true, truncated: false, durationMs: 12, run, ts: questionTime };
let answerText = '';

function timelineState() {
  return { step: timeline.step, requests: requests.slice(-300) };
}

function advanceTimeline(step) {
  const send = (type, fields = {}) => {
    const frame = { type, threadId: LONG, ts: iso(Date.now()), ...fields };
    for (const socket of wss.clients) if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(frame));
    return frame;
  };
  if (step === 'start' && timeline.step === 'history') {
    timeline.step = 'live';
    timeline.history = [task, thinking, tool];
    send('chat.user', task);
    send('chat.run.start', { run: RUN });
    send('chat.stream.start', { id: thinking.id });
    send('chat.reasoning.delta', { id: thinking.id, text: thinking.reasoning });
    send('chat.stream.done', { id: thinking.id });
    send('chat.tool.start', { id: TOOL, turnId: thinking.id, name: tool.name, args: tool.args });
    send('chat.tool', { ...tool, turnId: thinking.id });
    answerText = LIVE_TEXT;
    // The answer thinks before it writes, on its own bubble: the shape Opus streams, and the one whose
    // reasoning has to end up in the fold, live and replayed.
    timeline.frames = [
      send('chat.stream.start', { id: ANSWER }),
      send('chat.reasoning.delta', { id: ANSWER, text: ANSWER_THOUGHT }),
      send('chat.stream.delta', { id: ANSWER, text: answerText }),
    ];
  } else if (step === 'grow' && timeline.step === 'live') {
    const delta = `\n\n${'A live paragraph of results. '.repeat(12)}\n\nLive growth tail.`;
    answerText += delta;
    const frame = send('chat.stream.delta', { id: ANSWER, text: delta });
    timeline.frames = [timeline.frames[0], timeline.frames[1], { ...frame, text: answerText, replay: true }];
  } else if (step === 'finish' && timeline.step === 'live') {
    timeline.step = 'finished';
    const delta = `\n\n${FINAL}`;
    answerText += delta;
    send('chat.stream.delta', { id: ANSWER, text: delta });
    send('chat.stream.done', { id: ANSWER });
    send('chat.run.end', { run: RUN, reason: 'done' });
    const done = { ...run, status: 'done', endTs: iso(Date.now()) };
    const folded = {
      id: `run-${thinking.id}`, role: 'run', run: done, ts: thinking.ts,
      toolCount: 1, toolKinds: { read: 1 }, itemCount: 2, lastId: TOOL,
    };
    timeline.hydrations.set(folded.id, { untilId: TOOL, messages: [thinking, tool].map(item => ({ ...item, run: done })) });
    timeline.history = [task, folded, { id: ANSWER, role: 'assistant', text: answerText, reasoning: ANSWER_THOUGHT, run: done, ts: done.endTs }];
    timeline.frames = [];
  } else {
    return { error: `Cannot ${step} from ${timeline.step}` };
  }
  return timelineState();
}

/** One frame to every open tab: the timeline scenarios and the sub-agent one share the socket set. */
function broadcast(type, threadId, fields = {}) {
  const frame = { type, threadId, ts: iso(Date.now()), ...fields };
  for (const socket of wss.clients) if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(frame));
  return frame;
}

/** The sub-agent thread as history: what a reload mid-run has to find, and what it found before. */
function subHistory() {
  const done = { id: 'mock-sub-run-0', status: 'done', startTs: iso(STAMP), endTs: iso(STAMP + 90_000) };
  const first = [
    { id: 'sub-u0', role: 'user', text: 'Read the fixture sheet and tell me the totals.', ts: iso(STAMP) },
    {
      id: 'sub-a0',
      role: 'assistant',
      text: 'Three rows, two of them filled: 5 and 12.',
      reasoning: 'The sheet has three rows and one of them carries no number.',
      run: done,
      ts: iso(STAMP + 90_000),
    },
    // What a sub-agent's own conversation holds when it delegated: the browser task is its child,
    // so its door belongs here and not in the conversation above.
    {
      id: 'sub-t-browser',
      role: 'tool',
      name: 'delegate_browser_task',
      args: { url: 'https://shop.example.com/cart', instructions: 'Check the cart total' },
      ok: true,
      output: 'started',
      truncated: false,
      durationMs: 31,
      ts: iso(STAMP + 95_000),
      spawn: { callId: 'sub-t-browser', action: 'spawn', subagentId: 'subagent/browser-demo-7c11', status: 'idle', agentType: 'browser', mode: 'run' },
    },
  ];
  if (sub.step === 'finished') {
    return [
      ...first,
      { id: 'sub-u1', role: 'user', text: SUB_PROMPT, ts: iso(STAMP + 120_000) },
      { id: SUB_ANSWER, role: 'assistant', text: sub.answer, run: { id: 'mock-sub-run-1', status: 'done', startTs: iso(STAMP + 120_000), endTs: iso(STAMP + 150_000) }, ts: iso(STAMP + 150_000) },
    ];
  }
  if (sub.step === 'live') {
    // What the session log holds while the run is in flight: the question, and the cards that have
    // settled. The answer bubble is written when the turn ends, so a page never carries it -- the
    // live one comes from the journal replay, exactly as the server does it.
    const running = { id: 'mock-sub-run-1', status: 'running', startTs: iso(STAMP + 120_000) };
    return [
      ...first,
      { id: 'sub-u1', role: 'user', text: SUB_PROMPT, ts: iso(STAMP + 120_000) },
      { id: SUB_TOOL, role: 'tool', name: 'read', args: { path: 'fixture-sheet.txt' }, output: 'Fixture totals: 5, 12, 17.', ok: true, truncated: false, durationMs: 12, run: running, ts: iso(STAMP + 130_000) },
    ];
  }
  return first;
}

function subState() {
  return { step: sub.step, answer: sub.answer };
}

/** The browser task's own conversation: a page of its own, so a two-level chain is honest. */
function browserHistory() {
  return [
    { id: 'br-u0', role: 'user', text: 'Check the cart total.', ts: iso(STAMP) },
    { id: 'br-a0', role: 'assistant', text: 'The cart holds two items and totals 42.', ts: iso(STAMP + 40_000) },
  ];
}

/**
 * The sub-agent's own run, step by step: `start` opens it while a window is looking at its chat,
 * `grow` proves the view follows, `finish` closes it. The frames are kept so a window that syncs
 * mid-run is replayed them, exactly as the server's live journal does.
 */
function advanceSub(step) {
  if (step === 'start' && sub.step === 'idle') {
    sub.step = 'live';
    sub.answer = 'Starting the audit. ';
    broadcast('chat.run.start', SUB_THREAD, { run: 'mock-sub-run-1' });
    broadcast('chat.user', SUB_THREAD, { id: 'sub-u1', text: SUB_PROMPT });
    broadcast('chat.stream.start', SUB_THREAD, { id: SUB_ANSWER });
    broadcast('chat.reasoning.delta', SUB_THREAD, { id: SUB_ANSWER, text: 'The folder holds one sheet, so read it whole.' });
    broadcast('chat.stream.delta', SUB_THREAD, { id: SUB_ANSWER, text: sub.answer });
    broadcast('chat.tool.start', SUB_THREAD, { id: SUB_TOOL, turnId: SUB_ANSWER, name: 'read', args: { path: 'fixture-sheet.txt' } });
    broadcast('chat.tool', SUB_THREAD, { id: SUB_TOOL, turnId: SUB_ANSWER, name: 'read', args: { path: 'fixture-sheet.txt' }, output: 'Fixture totals: 5, 12, 17.', ok: true, truncated: false, durationMs: 12 });
    sub.frames = [
      ['chat.run.start', { run: 'mock-sub-run-1' }],
      ['chat.user', { id: 'sub-u1', text: SUB_PROMPT }],
      ['chat.stream.start', { id: SUB_ANSWER }],
      ['chat.reasoning.delta', { id: SUB_ANSWER, text: 'The folder holds one sheet, so read it whole.', replay: true }],
      ['chat.stream.delta', { id: SUB_ANSWER, text: sub.answer, replay: true }],
      ['chat.tool', { id: SUB_TOOL, turnId: SUB_ANSWER, name: 'read', args: { path: 'fixture-sheet.txt' }, output: 'Fixture totals: 5, 12, 17.', ok: true, truncated: false, durationMs: 12 }],
    ];
  } else if (step === 'grow' && sub.step === 'live') {
    const delta = '\n\nA second paragraph of the audit. ';
    sub.answer += delta;
    broadcast('chat.stream.delta', SUB_THREAD, { id: SUB_ANSWER, text: delta });
    sub.frames = sub.frames.map(frame =>
      frame[0] === 'chat.stream.delta' ? ['chat.stream.delta', { ...frame[1], text: sub.answer }] : frame,
    );
  } else if (step === 'finish' && sub.step === 'live') {
    sub.step = 'finished';
    broadcast('chat.stream.delta', SUB_THREAD, { id: SUB_ANSWER, text: '\n\nThe audit is done.' });
    sub.answer += '\n\nThe audit is done.';
    broadcast('chat.stream.done', SUB_THREAD, { id: SUB_ANSWER });
    broadcast('chat.run.end', SUB_THREAD, { reason: 'done', run: 'mock-sub-run-1' });
    sub.frames = [];
  } else {
    return { error: `Cannot ${step} from ${sub.step}` };
  }
  return subState();
}

function record(frame) {
  requests.push(frame);
  if (requests.length > 300) requests.shift();
}

wss.on('connection', socket => {
  const send = (type, body = {}) => {
    const threadId = body.threadId ?? SCRIPTED;
    socket.send(JSON.stringify({ type, threadId, ...body }));
  };

  const historyFor = threadId => threadId === LONG ? long.concat(timeline.history) : threadId === SUB_THREAD ? subHistory() : threadId === BROWSER_THREAD ? browserHistory() : threadId === FILES ? filesHistory() : scripted;
  const reply = (frame, delay = 0) => {
    const sendReply = () => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(frame));
    };
    if (delay > 0) setTimeout(sendReply, delay);
    else sendReply();
  };

  let timers = [];

  socket.on('message', raw => {
    let frame;
    try {
      frame = JSON.parse(String(raw));
    } catch {
      return;
    }

    switch (frame.type) {
      case 'media.ticket.get':
        socket.send(JSON.stringify({ type: 'media.ticket', ticket: 'mock', expiresAt: Date.now() + 86_400_000 }));
        return;
      case 'session.list':
        reply({ type: 'session.list.result', sessions: sessions.map(session => ({
          ...session, activeRun: session.threadId === LONG && timeline.step === 'live',
        })) });
        return;
      case 'commands.list':
        socket.send(JSON.stringify({
          type: 'commands.list.result',
          commands: [
            { name: 'status', description: 'Session diagnostics: context, tokens, cost' },
            { name: 'compact', description: 'Compact the conversation' },
          ],
        }));
        return;
      case 'model.list':
        socket.send(JSON.stringify({
          type: 'model.list.result',
          models: [{ id: 'mock-model', label: 'Mock model' }],
          defaultModel: 'mock-model',
        }));
        return;
      case 'model.get':
        socket.send(JSON.stringify({
          type: 'model.result',
          threadId: frame.threadId,
          model: 'mock-model',
          defaultModel: 'mock-model',
          source: 'global',
          effort: { level: '', levels: [], supported: false },
          context: { raw: 200_000, effective: 200_000, used: 1_400 },
        }));
        return;
      case 'jobs.list':
        socket.send(JSON.stringify({ type: 'jobs.list.result', jobs: [] }));
        return;
      case 'subagents.list':
        socket.send(JSON.stringify({
          type: 'subagents.list.result',
          threadId: frame.threadId,
          // The sub-agent's own roster holds the browser task it delegated: two levels, so a chain
          // address can be walked and reloaded.
          agents: !SUBAGENT
            ? []
            : frame.threadId === SUB_THREAD
              ? [{
                  id: 'subagent/browser-demo-7c11',
                  threadId: BROWSER_THREAD,
                  type: 'browser',
                  status: 'idle',
                  displayName: 'browser',
                  visibility: 'private',
                  mode: 'run',
                  messageCount: 4,
                  lastMessageAt: iso(STAMP + 2600),
                }]
              : process.env.MOCK_AGENTS === '1'
                ? [
                    {
                      id: SUB_AGENT,
                      threadId: SUB_THREAD,
                      type: 'general',
                      status: sub.step === 'live' ? 'running' : 'idle',
                      displayName: 'demo-s01',
                      visibility: 'private',
                      mode: 'run',
                      messageCount: 12,
                      lastMessageAt: iso(STAMP + 3000),
                    },
                    {
                      id: 'subagent/browser-demo-7c11',
                      threadId: BROWSER_THREAD,
                      type: 'browser',
                      status: 'idle',
                      displayName: 'browser',
                      visibility: 'private',
                      mode: 'run',
                      messageCount: 4,
                      lastMessageAt: iso(STAMP + 2600),
                    },
                  ]
                : [],
        }));
        return;
      // The newest page: replaces the thread, and carries the cursor that reaches the one before.
      case 'session.sync': {
        const threadId = frame.threadId;
        const messages = historyFor(threadId);
        const since = frame.since ? messages.findIndex(item => item.id === frame.since) : -1;
        const start = since === -1 && threadId === LONG ? Math.max(0, messages.length - PAGE) : since + 1;
        const activeRun = (threadId === LONG && timeline.step === 'live') || (threadId === SUB_THREAD && sub.step === 'live');
        record({ type: frame.type, threadId, fold: frame.fold, since: frame.since });
        reply({
          type: 'session.sync.result', threadId, entries: messages.slice(start), activeRun,
          head: messages.at(-1)?.id ?? null, leaf: messages.at(-1)?.id ?? null,
          ...(since === -1 ? { hasMore: start > 0, nextBefore: messages.length - start } : {}),
          ...(since === -1 && frame.since ? { reset: 'unknown-cursor' } : {}),
          ...(activeRun ? { lastRun: run } : {}),
        }, HISTORY_DELAY);
        if (activeRun) for (const live of timeline.frames) reply(live, HISTORY_DELAY);
        if (threadId === SUB_THREAD && sub.step === 'live') {
          for (const [type, fields] of sub.frames) reply({ type, threadId: SUB_THREAD, ts: iso(Date.now()), ...fields }, HISTORY_DELAY);
        }
        // A pending approval, so the sheet can be looked at: `MOCK_APPROVAL=1` on the server asks
        // for one with a long command, which is the shape that used to run off the screen.
        // `MOCK_APPROVAL_DELAY` (ms) makes it land after the page is up, which is how the
        // "it arrived while I was typing" case is checked.
        if (process.env.MOCK_APPROVAL === '1') {
          const delay = Number(process.env.MOCK_APPROVAL_DELAY ?? 0);
          setTimeout(() => {
          socket.send(JSON.stringify({
            type: 'approval.request',
            id: 'mock-approval',
            threadId,
            toolName: 'bash',
            args: {
              command:
                "cd /home/neras/cf/worktrees/lead && git status --short && git log --oneline -12 && git diff --stat HEAD~3 && for f in $(git ls-files 'docs/*.md'); do echo \"$f\"; wc -l \"$f\"; done | head -40 && make check",
              timeoutMs: 120000,
              cwd: '/home/neras/cf/worktrees/lead',
              env: { CI: '1', RUST_LOG: 'info', CARGO_TERM_COLOR: 'never' },
              note: 'A long argument object is the shape that used to push the buttons off the screen.',
            },
            expiresAt: Date.now() + 300000,
            allowSessionOffered: false,
            allowAlwaysOffered: true,
            origin: { kind: 'local' },
            requestedAt: Date.now(),
          }));
          }, delay);
        }
        return;
      }
      case 'session.history': {
        const { threadId, before, beforeId } = frame;
        const messages = historyFor(threadId);
        const idIndex = beforeId ? messages.findIndex(item => item.id === beforeId || item.lastId === beforeId || item.id === `run-${beforeId}`) : -1;
        const end = idIndex < 0 ? Math.max(0, messages.length - (before ?? 0)) : idIndex;
        const start = Math.max(0, end - (frame.limit ?? PAGE));
        record({ type: frame.type, threadId, before, beforeId, fold: frame.fold, first: messages[start]?.id });
        reply({
          type: 'chat.history', threadId, before, beforeId, messages: messages.slice(start, end),
          hasMore: start > 0, nextBefore: messages.length - start,
        }, HISTORY_DELAY);
        return;
      }
      case 'session.run.items': {
        const { threadId, fromId, untilId } = frame;
        const held = timeline.hydrations.get(fromId);
        const found = threadId === LONG && held?.untilId === untilId;
        record({ type: frame.type, threadId, fromId, untilId });
        reply({ type: 'chat.run.items', threadId, fromId, found, messages: found ? held.messages : [] }, HISTORY_DELAY);
        return;
      }
      case 'chat.send': {
        const threadId = frame.threadId;
        socket.send(JSON.stringify({ type: 'chat.send.received', threadId, id: frame.id }));
        timers.forEach(clearTimeout);
        timers = RUN_SCRIPT.map(([type, body], index) =>
          setTimeout(() => {
            if (socket.readyState !== socket.OPEN) return;
            send(type, { threadId, ts: iso(Date.now()), ...body });
          }, 400 + index * 350),
        );
        return;
      }
      default:
        // Everything else a browser asks for (status watches, browser info, updates) is answered
        // with silence: an unanswered request draws its own resting state, and inventing a shape
        // here would be testing the mock instead of the app.
        return;
    }
  });

  socket.on('close', () => timers.forEach(clearTimeout));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock my-claw server on http://127.0.0.1:${PORT}/  (socket: /my-claw-app)`);
});
