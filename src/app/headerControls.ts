/**
 * Which controls the title bar has room for, decided in one place.
 *
 * The bar is a hamburger (or nothing), a two-line text block, and then a row of controls that has
 * to earn its width against that block: the context gauge, the sub-agent counter, the model button,
 * the overflow. Every one of them squeezes the same thing -- the model name on the facts line, which
 * is the one fact a phone reader actually reads -- so each admission is measured rather than
 * guessed, and the menu takes over whatever the bar drops.
 *
 * Two predicates, one reader each, both read again by `AppShell` so a control is never offered in
 * both places and never in neither. Two conditions would drift.
 */

/**
 * The model picker as a control of its own.
 *
 * 480 is where the bar keeps a full model name beside a fourth control: measured in the harness at
 * 390 the name is already the first thing truncated, at 480 it survives with the button in place.
 */
export const MODEL_BUTTON_MIN_WIDTH = 480;

export function showsModelButton(width: number): boolean {
  return width >= MODEL_BUTTON_MIN_WIDTH;
}

/**
 * The sub-agent counter as a control of its own.
 *
 * Higher than the model button's threshold, because the counter is the one control that costs the
 * facts line twice: a badge of 50 pt, and the name beside it is what gives way. Measured at 560
 * with a long provider id, the name is cut with the badge and whole without it (227 pt of block
 * against the 300 the name needs); at 620 the badge still costs the name its tail; at 720 the block
 * keeps 387 and the name is whole. Below 720 the roster lives in the session menu instead, where a
 * phone reader was never reaching for it anyway (owner, 2026-11-05: "c'est useless d'avoir le
 * bouton de la liste des sous-agents tout en haut sur mobile, je l'utilise jamais").
 *
 * At 0 total it is not drawn at all, whatever the width: a counter that counts nothing is a door
 * onto an empty room.
 */
export const AGENTS_BUTTON_MIN_WIDTH = 720;

export function showsAgentsButton(width: number): boolean {
  return width >= AGENTS_BUTTON_MIN_WIDTH;
}

/**
 * What a header needs to know about the model of the conversation it names.
 *
 * The shape is `ThreadModel`'s, narrowed to the five fields the line reads, so the composer is a
 * pure function a test can call: a subtitle assembled inline inside `AppShell` is only ever checked
 * by looking at a screenshot, which is how it came to name a model without its provider, drop the
 * tag that picked it, and show the conversation's effort instead of the running one's (2026-11-14).
 */
export interface HeaderModelFacts {
  /** The model that will run: this chat's pick, an agent's pin, or the default. */
  model: string;
  /** The tag that picked it, when the pick was a `tag:` reference. */
  tag?: string;
  /** What the run in flight is calling, when it left `model`. */
  live?: string;
  /** The rung the conversation resolves to. */
  effort?: string;
  /** The rung the run in flight is asking for, which a route can differ from. */
  liveEffort?: string;
}

/**
 * The five facts a `model.result` carries, read off the store's entry.
 *
 * Kept here rather than at the call site so the composer's input is built in one place: `effort` is
 * an object on the wire (a level, a ladder, a supported flag) and a string on the line, and that
 * translation between two shapes is the sort of thing that silently drops a field.
 */
export function headerModelOf(thread: {
  model: string;
  tag?: string;
  live?: string;
  liveEffort?: string;
  effort?: { level: string };
} | null): HeaderModelFacts | null {
  if (!thread) return null;
  return {
    model: thread.model,
    ...(thread.tag ? { tag: thread.tag } : {}),
    ...(thread.live ? { live: thread.live } : {}),
    ...(thread.effort?.level ? { effort: thread.effort.level } : {}),
    ...(thread.liveEffort ? { liveEffort: thread.liveEffort } : {}),
  };
}

/**
 * The facts line of a header: the tag in force, what runs, what is answering, at which effort.
 *
 * Four decisions, each one a defect that was measured:
 *
 * - **the tag first.** `model` is what the API receives, so the reference that chose it is lost
 *   before any screen sees it; without the name there is no way to tell a landed pick from a
 *   fall-through to a default.
 * - **the provider with the model**, from the catalogue, because a route's candidates are the same
 *   label on different accounts -- `opus-5-5` alone cannot say whose.
 * - **`running …` only when the run left the model above**, so a normal run does not draw its own
 *   name twice.
 * - **the running effort when there is one**, because the candidates of a route do not share a
 *   level: the conversation pins `xhigh` on a tag whose first account answers at `max`.
 *
 * `nameOf` is the caller's catalogue lookup, injected so this module keeps holding decisions and
 * not data.
 */
export function headerFacts(
  model: HeaderModelFacts | null,
  nameOf: (id: string) => string,
  options: { offline?: string | null; pending?: number; origin?: string | null } = {},
): string {
  const live = model?.live;
  const effort = (live ? model?.liveEffort : undefined) ?? model?.effort ?? null;
  return [
    options.offline ?? null,
    model?.tag ? `tag ${model.tag}` : null,
    model ? nameOf(model.model) : null,
    live ? `running ${nameOf(live)}` : null,
    effort,
    options.pending && options.pending > 0 ? `${options.pending} pending` : null,
    options.origin ?? null,
  ]
    .filter(Boolean)
    .join(' · ');
}
