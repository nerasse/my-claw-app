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

const ROOT = fileURLToPath(new URL('../dist-web/', import.meta.url));
const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const PORT = portFlag === -1 ? 8099 : Number(args[portFlag + 1]);

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

const iso = ms => new Date(ms).toISOString();

/** 240 turns, one per minute: enough for a scrollbar thumb worth dragging and a page to page in. */
function longHistory() {
  const messages = [];
  for (let i = 0; i < 120; i += 1) {
    const ts = iso(STAMP + i * 60_000);
    messages.push({ id: `long-u${i}`, role: 'user', text: `Question ${i}: what does line ${i} say?`, ts });
    messages.push({
      id: `long-a${i}`,
      role: 'assistant',
      text: `Answer ${i}. `.repeat(6).trim(),
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
      from: { label: 'cf-forge-run-3286', kind: 'cron', cadence: 'every 30m' },
    },
  ];
}

const sessions = [
  {
    threadId: LONG,
    title: 'Long history',
    messageCount: 240,
    createdAt: iso(STAMP),
    lastActiveAt: iso(STAMP + 120 * 60_000),
    lastMessageAt: iso(STAMP + 120 * 60_000),
  },
  {
    threadId: SCRIPTED,
    title: 'Scripted run',
    messageCount: 2,
    createdAt: iso(STAMP),
    lastActiveAt: iso(STAMP + 5000),
    lastMessageAt: iso(STAMP + 5000),
  },
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

wss.on('connection', socket => {
  const send = (type, body = {}) => {
    const threadId = body.threadId ?? SCRIPTED;
    socket.send(JSON.stringify({ type, threadId, ...body }));
  };

  const historyFor = threadId =>
    threadId === LONG ? longHistory() : scriptedHistory();

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
        socket.send(JSON.stringify({ type: 'session.list.result', sessions }));
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
          // One agent, so the badge, the roster and the door into its conversation can be walked.
          agents: process.env.MOCK_AGENTS === '1'
            ? [
                {
                  id: 'subagent/demo-s01-4f08',
                  threadId: 'subagent-thread-demo',
                  type: 'general',
                  status: 'idle',
                  displayName: 'demo-s01',
                  visibility: 'private',
                  mode: 'run',
                  messageCount: 12,
                  lastMessageAt: iso(STAMP + 3000),
                },
                {
                  id: 'subagent/browser-demo-7c11',
                  threadId: 'subagent-thread-browser',
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
        const page = threadId === LONG ? messages.slice(-PAGE) : messages;
        socket.send(JSON.stringify({
          type: 'chat.history',
          threadId,
          messages: page,
          hasMore: threadId === LONG,
          nextBefore: threadId === LONG ? messages.length - PAGE : undefined,
        }));
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
      // An older page: `before` counts back from the newest message, so the page is the window
      // that ends there. Paging is what the prepend anchor exists for, so it has to be real.
      case 'session.history': {
        const threadId = frame.threadId;
        const messages = historyFor(threadId);
        const limit = typeof frame.limit === 'number' ? frame.limit : PAGE;
        const before = typeof frame.before === 'number' ? frame.before : messages.length;
        const start = Math.max(0, before - limit);
        socket.send(JSON.stringify({
          type: 'chat.history',
          threadId,
          messages: messages.slice(start, before),
          before,
          hasMore: start > 0,
          nextBefore: start > 0 ? start : undefined,
        }));
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
