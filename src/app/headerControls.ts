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
