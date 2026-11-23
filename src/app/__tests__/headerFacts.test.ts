import {
  AGENTS_BUTTON_MIN_WIDTH,
  badgeOpensAgent,
  headerFacts,
  headerModelOf,
  rosterInMenu,
  showsAgentsButton,
} from '../headerControls';

/**
 * What the header's facts line says, and why each part of it exists.
 *
 * Measured 2026-11-14 on a conversation on `tag:Quota` (Opus 5.5, `xhigh` on every candidate):
 * the title bar read `claude-2 / Opus 5.5 · xhigh` while the status page beside it said
 * `tag Quota · effort xhigh`, and after the run walked to its second account the bar never moved.
 * Three holes, all of them in this line:
 *
 * - the tag that picked the model was nowhere on it, so a landed pick and a fall-through to a
 *   default looked identical;
 * - the effort shown was the conversation's own, which is not what a route's next candidate sends;
 * - a running node was drawn by name only, without the provider that tells two accounts apart.
 */

/** A catalogue lookup as the shell builds it: provider first, then the label. */
const nameOf = (id: string): string =>
  ({
    'claude-2/claude-opus-5-5': 'claude-2 / Opus 5.5',
    'anthropic/claude-opus-5-5': 'anthropic / Opus 5.5',
  })[id] ?? id;

test('a tag conversation names the tag, the model and its own effort', () => {
  expect(
    headerFacts(
      { model: 'claude-2/claude-opus-5-5', tag: 'Quota', effort: 'xhigh' },
      nameOf,
    ),
  ).toBe('tag Quota · claude-2 / Opus 5.5 · xhigh');
});

test('a run that walked to another account shows that account in place of the first, without "running"', () => {
  // The route moved to the second candidate, which is asked for `max` while the tag pins `xhigh`.
  // The first candidate is not answering any more, so it leaves the line: one model, no prefix
  // (owner, 2026-11-23).
  expect(
    headerFacts(
      {
        model: 'claude-2/claude-opus-5-5',
        tag: 'Quota',
        effort: 'xhigh',
        live: 'anthropic/claude-opus-5-5',
        liveEffort: 'max',
      },
      nameOf,
    ),
  ).toBe('tag Quota · anthropic / Opus 5.5 · max');
});

test('a run on the conversation\'s own model is not drawn twice', () => {
  // `live` equal to `model` never happens on the wire (the server omits it), but a line that drew
  // it anyway would say the same name twice. The rung still rides with it: a route can keep the
  // model and change its level.
  expect(headerFacts({ model: 'claude-2/claude-opus-5-5', effort: 'low', liveEffort: 'max' }, nameOf)).toBe(
    'claude-2 / Opus 5.5 · low',
  );
});

test('the origin, the share and the offline state keep their places on the line', () => {
  expect(
    headerFacts({ model: 'claude-2/claude-opus-5-5', effort: 'high' }, nameOf, {
      offline: 'offline',
      pending: 2,
      origin: 'global default',
    }),
  ).toBe('offline · claude-2 / Opus 5.5 · high · 2 pending · global default');
});

test('no model yet is no facts line, not a line of separators', () => {
  expect(headerFacts(headerModelOf(null), nameOf)).toBe('');
});

test('the wire shape is translated once: a level is read, an absent pin is dropped', () => {
  // The store's entry carries the whole `EffortState`; only the level belongs on the line.
  const effort = { level: 'xhigh', levels: ['low', 'xhigh'], supported: true };
  expect(
    headerModelOf({
      model: 'claude-2/claude-opus-5-5',
      tag: 'Quota',
      live: 'anthropic/claude-opus-5-5',
      liveEffort: 'max',
      effort,
    }),
  ).toEqual({
    model: 'claude-2/claude-opus-5-5',
    tag: 'Quota',
    live: 'anthropic/claude-opus-5-5',
    effort: 'xhigh',
    liveEffort: 'max',
  });
  // A model that takes no effort at all has an empty level, which is an absence and not a label.
  expect(headerModelOf({ model: 'x', effort: { level: '' } })).toEqual({ model: 'x' });
});

/**
 * Where the roster lives, and what the badge opens.
 *
 * Two doors onto one list is the failure this pins: the badge on a wide window, the session-menu
 * row on a narrow one, and exactly one of them, never both and never neither. The third case is the
 * one the owner asked for on 2026-11-15: with a single agent the badge goes straight to its
 * conversation, so the row comes back on that window to keep the list itself reachable.
 */
describe('the roster door', () => {
  test('the badge is drawn only where the facts line can afford it', () => {
    expect(showsAgentsButton(AGENTS_BUTTON_MIN_WIDTH - 1)).toBe(false);
    expect(showsAgentsButton(AGENTS_BUTTON_MIN_WIDTH)).toBe(true);
  });

  test('one agent is one tap, several are a list', () => {
    expect(badgeOpensAgent(1)).toBe(true);
    expect(badgeOpensAgent(0)).toBe(false);
    expect(badgeOpensAgent(2)).toBe(false);
  });

  test('the menu holds the roster exactly when the badge does not reach it', () => {
    // Narrow: no badge, so the menu is the door.
    expect(rosterInMenu(400, 3)).toBe(true);
    // Wide with several agents: the badge opens the list, the menu stays out of it.
    expect(rosterInMenu(900, 3)).toBe(false);
    // Wide with one: the badge bypasses the list, so the menu carries it.
    expect(rosterInMenu(900, 1)).toBe(true);
    // Narrow with one: unchanged, the badge does not exist there at all.
    expect(rosterInMenu(400, 1)).toBe(true);
  });
});
