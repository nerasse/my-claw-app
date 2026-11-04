/**
 * Where the title bar has room for the model picker as a control of its own.
 *
 * The bar is three controls and a two-line text block before anything else: a hamburger or nothing,
 * the title and its facts, the context gauge (560 and up), the sub-agent counter, and the overflow.
 * The model button is the last to be admitted, and it has to earn its 28 pt against the text it
 * squeezes -- the block is the only thing there that can absorb pressure, and it does it by cutting
 * the model name, which is the one fact a phone user actually reads.
 *
 * 480 is where the bar keeps a full model name beside a fourth control: measured in the harness at
 * 390 the name is already the first thing truncated, at 480 it survives with the button in place.
 *
 * One predicate, two readers: this decides whether `ChatScreen` draws the button, and the command
 * menu uses it to drop its own Model… entry. Two conditions would drift, and the owner would end up
 * with the picker in both places on one window and in neither on the next.
 */
export const MODEL_BUTTON_MIN_WIDTH = 480;

export function showsModelButton(width: number): boolean {
  return width >= MODEL_BUTTON_MIN_WIDTH;
}
