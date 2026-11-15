/**
 * The same conversation, read at three moments.
 *
 * The owner's recurring bug class, in his words: "quand on charge l'historique mid run ou en fin de
 * run les reasoning sont bien groupés mais pas en live", "le message de fallback reste stuck",
 * "quand y a un compact ça doit couper le groupe". Every one of them is a disagreement between the
 * live path (frames appended to the store) and the history path (entries replaced wholesale), and
 * no single-stage test can see a disagreement.
 *
 * So this suite walks one story through the three views and pins the laws that must hold between
 * them. It reads the real pipeline (`test-utils/scenario.ts`), so it cannot drift from what the
 * screen draws.
 */

import { ask, answer, call, folded, run, thought, visible } from '../../../test-utils/scenario';

test('a live run and its own history read in the same order', () => {
  // Mid-run: the owner asked, the agent thought, called twice, thought again, and answered. The
  // words are still arriving (`streaming: true`), which is the state the reader is looking at.
  const live = [
    ask('u1', 'read the file'),
    thought('a1', 'looking at it', { streaming: true }),
    call('t1', 'bash', { run: run('r1', { status: 'running' }) }),
    thought('a2', 'two names in there', { run: run('r1', { status: 'running' }) }),
    call('t2', 'read', { run: run('r1', { status: 'running' }) }),
    answer('a3', 'two names', { run: run('r1', { status: 'running' }), streaming: true }),
  ];

  const onScreen = visible(live);
  expect(onScreen).toEqual([
    'day',
    'user: read the file',
    // The thinking that lost its run joins the run being written, not a row of its own -- the two
    // calls and both thoughts are one burst under one header, and the answer that closes the run
    // stays a message of its own (owner, 2026-11-15: a thought is always a grouping item).
    'group:4',
    'agent: two names …',
  ]);

  // The reload that lands mid-run: the server hands the same entries back, settled. Only the two
  // `streaming` flags differ -- a settled word is not a different row, and nothing may move.
  const replayed = live.map(item =>
    item.kind === 'text' ? { ...item, streaming: false } : item,
  );
  expect(visible(replayed)).toEqual([
    'day',
    'user: read the file',
    'group:4',
    'agent: two names',
  ]);
});

test('the finished run folds into one row where its work stood, and the free bubbles stay put', () => {
  const finished = [
    ask('u1', 'read the file'),
    folded('run-t1', { itemCount: 3 }),
    answer('a3', 'two names'),
  ];

  // The fold takes the exact place of the work it stands for: under the question, above the
  // answer that came after it. A fold hoisted anywhere else is the "les reasoning ne sont plus
  // dans le groupement" report.
  expect(visible(finished)).toEqual([
    'day',
    'user: read the file',
    'folded:3',
    'agent: two names',
  ]);
});

test('a send held behind a compaction is not swallowed by the fold in front of it', () => {
  const held = [
    ask('u1', 'first'),
    call('t1', 'bash', { run: run('r1') }),
    call('t2', 'read', { run: run('r1') }),
    // Parked by the server behind the history rewrite, and the boundary the rewrite draws.
    ask('u2', 'and now this', { queuedReason: 'compaction', queuedSince: 1 }),
  ];

  // The fold stops at the boundary -- the two calls, not three rows -- the rule stands where the
  // rewrite happened, and the held send is a row of its own after it. A fold reaching over the
  // compaction is the bug that reported the owner's send as part of the work that had just been
  // archived.
  expect(visible(held)).toEqual([
    'day',
    'user: first',
    'group:2',
    'rule',
    'user: and now this',
  ]);
});

test('an undelivered send is pinned under the newest work, never left behind in reading order', () => {
  const undelivered = [
    ask('u1', 'first'),
    answer('a1', 'one'),
    ask('u2', 'never left the phone', { queuedReason: 'undelivered', error: 'not delivered' }),
    answer('a2', 'two'),
  ];

  // The pinned send belongs at the bottom: it waits for a connection, and the reader looks for it
  // where the thread stops -- not where it was written.
  expect(visible(undelivered)).toEqual([
    'day',
    'user: first',
    'agent: one',
    'agent: two',
    'user: never left the phone',
  ]);
});
