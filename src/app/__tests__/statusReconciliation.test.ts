import { reconciliationLines } from '../StatusScreen';
import type { UsageReconciliation } from '../../core/protocol';

function line(over: Partial<UsageReconciliation> = {}): UsageReconciliation {
  return {
    provider: 'openrouter.ai',
    recordedUsd: 2,
    calls: 12,
    windowDays: 90,
    providerUsd: 12.5,
    deltaUsd: 10.5,
    balanceUsd: 7.5,
    providerUnread: false,
    ...over,
  };
}

describe('the line that puts a provider ledger beside what the server deduced', () => {
  it('draws both figures, the gap and the balance when the provider answered', () => {
    const [figures, note] = reconciliationLines(line());
    expect(figures).toBe('openrouter.ai · they charged $12.50 · we recorded $2.00 · gap +$10.50');
    expect(note).toBe('12 calls · 90 days · their figure runs from the key, not the window · balance $7.50');
  });

  it('keeps the line and our own figure when the provider was not read', () => {
    // An API that is down and a cache nothing has warmed yet are the same statement, and neither
    // may blank the sum we do know.
    const [figures, note] = reconciliationLines(line({ providerUnread: true, providerUsd: undefined, deltaUsd: undefined, balanceUsd: undefined }));
    expect(figures).toBe('openrouter.ai · we recorded $2.00');
    expect(note).toBe('12 calls · 90 days · provider not reached');
  });

  it('believes the flag over the figures when the two disagree', () => {
    // `providerUnread` is the server saying it did not read the ledger. A number left beside it is
    // then a leftover, not a reading, and drawing it would date the line without saying so.
    const [figures, note] = reconciliationLines(line({ providerUnread: true }));
    expect(figures).toBe('openrouter.ai · we recorded $2.00');
    expect(figures).not.toContain('12.50');
    expect(note).toContain('provider not reached');
  });

  it('never renders a figure it was not given, whatever the flag says', () => {
    // A payload claiming the ledger was read while carrying no number would otherwise print $NaN.
    const [figures] = reconciliationLines(line({ providerUsd: undefined }));
    expect(figures).toBe('openrouter.ai · we recorded $2.00');
    expect(figures).not.toContain('NaN');
    expect(reconciliationLines(line({ deltaUsd: undefined }))[0]).not.toContain('gap');
  });

  it('signs the gap, because which way it leans is the whole information', () => {
    // Negative is money we recorded that the provider never billed: a BYOK route, charged by the
    // upstream provider instead. Drawn as a direction, not as a smaller number.
    expect(reconciliationLines(line({ deltaUsd: -1.25 }))[0]).toContain('gap -$1.25');
    expect(reconciliationLines(line({ deltaUsd: 0.004 }))[0]).toContain('gap <$0.01');
  });

  it('reads nothing recorded as a reading, not as a missing half', () => {
    const [figures, note] = reconciliationLines(line({ recordedUsd: 0, calls: 0, deltaUsd: 12.5 }));
    expect(figures).toBe('openrouter.ai · they charged $12.50 · we recorded $0.00 · gap +$12.50');
    expect(note).toContain('0 calls');
  });

  it('counts one call in the singular, since the line is read as a sentence', () => {
    expect(reconciliationLines(line({ calls: 1 }))[1]).toContain('1 call · 90 days');
  });

  it('drops the balance when the provider publishes none, and keeps the rest', () => {
    const [figures, note] = reconciliationLines(line({ balanceUsd: undefined }));
    expect(figures).toContain('they charged $12.50');
    expect(note).toBe('12 calls · 90 days · their figure runs from the key, not the window');
  });
});
