/**
 * Web counterpart of alertSound.ts: a short two-tone chirp via WebAudio.
 *
 * No asset to ship, no autoplay policy fight once the owner has interacted with the page
 * (a question sheet opening is always after a tap or a streamed answer, so the context is
 * already unlocked). Resolves when the sound has been started; rejects when the browser
 * refuses (no AudioContext, page still suspended), which the caller treats as "no ring".
 */
export async function playAlertSound(): Promise<void> {
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  const ctx = new Ctor();
  if (ctx.state === 'suspended') await ctx.resume();
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  gain.connect(ctx.destination);
  for (const [freq, at] of [[880, 0], [660, 0.16]] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(now + at);
    osc.stop(now + at + 0.18);
  }
  setTimeout(() => {
    ctx.close().catch(() => {});
  }, 800);
}
