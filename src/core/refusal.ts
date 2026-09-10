/**
 * What a refusal frame is shown as.
 *
 * The server names the operation that failed ("providers.remove failed") and, when it has one, the
 * cause alongside it: the config-edit refusal that lists the models still pointing at a provider,
 * for instance. The operation name alone is true and actionable by nobody, so the cause wins
 * whenever it is there.
 */
export function refusalText(frame: { message: string; detail?: string }): string {
  return frame.detail ?? frame.message;
}
