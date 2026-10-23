import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { quotaRedeemStore, useQuota, useQuotaRedeem } from '../core/quota';
import { connection } from '../core/connection';
import { encodeQuotaRedeem, type QuotaOutcome, type QuotaWindow } from '../core/protocol';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';

/** One tick a second, so every countdown on the card moves without new data. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** "in 1 h 20", "in 23 min", "in 3 d 4 h", or null once the second has passed. */
export function formatRemaining(resetAt: string | undefined, now: number): string | null {
  if (!resetAt) return null;
  const ms = Date.parse(resetAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'in under a minute';
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours} h ${pad(minutes % 60)}`;
  const days = Math.floor(hours / 24);
  return `in ${days} d ${hours % 24} h`;
}

/** "02:30" today, "24/10 08:00" further out. */
export function formatReset(resetAt: string): string {
  const date = new Date(resetAt);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? time : `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${time}`;
}

function barColor(palette: Palette, used: number): string {
  if (used >= 100) return palette.danger;
  if (used >= 85) return palette.warn;
  return palette.accent;
}

function WindowRow({ window, now }: { window: QuotaWindow; now: number }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const remaining = formatRemaining(window.resetAt, now);
  return (
    <View style={styles.window} accessibilityLabel={`${window.label}, ${Math.round(window.usedPercent)} percent used`}>
      <View style={styles.windowHead}>
        <Text style={styles.windowLabel}>{window.label}</Text>
        <Text style={[styles.windowPercent, window.usedPercent >= 100 && styles.windowPercentFull]}>
          {Math.round(window.usedPercent)}% used
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, window.usedPercent))}%`, backgroundColor: barColor(palette, window.usedPercent) }]} />
      </View>
      {window.resetAt ? (
        <Text style={styles.windowReset}>
          {remaining ? `resets ${remaining} · ${formatReset(window.resetAt)}` : 'resetting now'}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The compact form, for a provider row in the models list: the windows at a glance, or the
 * wallet when there is no window. Nothing at all when the provider publishes no usage.
 */
export function QuotaLine({ provider }: { provider: string }): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  const outcome = useQuota(provider);
  if (!outcome?.ok) return null;
  const { snapshot } = outcome;
  const parts = snapshot.windows.slice(0, 2).map((window) => `${window.label} ${Math.round(window.usedPercent)}%`);
  const balance = snapshot.balances[0];
  const wallet =
    balance?.remaining !== undefined
      ? `${balance.currency === 'USD' ? '$' : ''}${balance.remaining.toFixed(2)} left`
      : balance?.count !== undefined
        ? `${balance.count} ${balance.label.toLowerCase()}`
        : undefined;
  if (parts.length === 0 && !wallet) return null;
  return (
    <Text style={styles.line} numberOfLines={1}>
      {[...parts, ...(wallet ? [wallet] : [])].join(' · ')}
    </Text>
  );
}

/**
 * One provider's limits, live. The server reads the vendor's own endpoint and pushes what it
 * says; this draws it, counts the resets down between two reads, and asks again when one passes.
 */
export function QuotaCard({
  provider,
  onRefresh,
  title = 'Usage',
}: {
  provider: string;
  onRefresh?: () => void;
  title?: string;
}): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  const outcome: QuotaOutcome | undefined = useQuota(provider);
  const live = outcome?.ok === true;
  const now = useNow(live);
  const redeem = useQuotaRedeem(provider);
  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  // A reset that just passed is a number that just changed: one fresh read, once per second value.
  const nextReset = live
    ? outcome.snapshot.windows
        .map((window) => window.resetAt)
        .filter((at): at is string => Boolean(at))
        .sort((left, right) => Date.parse(left) - Date.parse(right))
        .find((at) => Date.parse(at) > now)
    : undefined;
  useEffect(() => {
    if (!nextReset || !onRefresh) return;
    const ms = Date.parse(nextReset) - Date.now() + 2_000;
    if (ms <= 0) return;
    const timer = setTimeout(onRefresh, ms);
    return () => clearTimeout(timer);
  }, [nextReset, onRefresh]);

  if (!outcome) return null;
  if (!outcome.ok && outcome.code === 'no-source') return null;

  if (!outcome.ok) {
    const text =
      outcome.code === 'sign-in-expired' || outcome.code === 'not-signed-in'
        ? 'Usage unavailable — the sign-in is missing or expired.'
        : outcome.code === 'rate-limited'
          ? 'Usage read rate-limited by the provider.'
          : 'Usage unavailable.';
    return (
      <View style={styles.card} accessibilityLabel={`${title} unavailable`}>
        <View style={styles.head}>
          <Text style={styles.title}>{title}</Text>
          {onRefresh ? (
            <Pressable onPress={onRefresh} style={styles.refresh} accessibilityLabel={`Refresh ${title}`}>
              <Text style={styles.refreshText}>Refresh</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.hint}>{text}</Text>
      </View>
    );
  }

  const { snapshot, stale } = outcome;
  const reset = snapshot.resets;
  const spend = (): void => {
    if (!reset?.usable || redeem?.busy) return;
    if (!confirming) {
      setConfirming(true);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirming(false), 4000);
      return;
    }
    setConfirming(false);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    // The store refuses a second tap while the first is in flight: a credit is not idempotent.
    if (quotaRedeemStore.begin(provider)) connection.send(encodeQuotaRedeem(provider)).catch(() => {});
  };
  const age = Math.max(0, Math.round((Date.now() - Date.parse(snapshot.fetchedAt)) / 1000));
  const ageText = age < 60 ? `${age} s ago` : `${Math.round(age / 60)} min ago`;
  return (
    <View style={styles.card} accessibilityLabel={`${title} for ${provider}`}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.meta}>
            {[snapshot.plan ? `plan ${snapshot.plan}` : undefined, snapshot.email, `updated ${ageText}`]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        {onRefresh ? (
          <Pressable onPress={onRefresh} style={styles.refresh} accessibilityLabel={`Refresh ${title}`}>
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        ) : null}
      </View>

      {stale ? <Text style={styles.stale}>Showing the last reading — the provider did not answer.</Text> : null}

      {snapshot.windows.map((window) => (
        <WindowRow key={window.id} window={window} now={now} />
      ))}

      {snapshot.balances.map((balance) => (
        <View key={balance.id} style={styles.balance}>
          <Text style={styles.balanceLabel}>{balance.label}</Text>
          <Text style={styles.balanceValue}>
            {balance.remaining !== undefined
              ? `${balance.currency === 'USD' ? '$' : ''}${balance.remaining.toFixed(2)}${balance.total !== undefined ? ` of ${balance.currency === 'USD' ? '$' : ''}${balance.total.toFixed(2)}` : ''}`
              : balance.count !== undefined
                ? String(balance.count)
                : '—'}
          </Text>
        </View>
      ))}

      {snapshot.extras.length > 0 ? (
        <View style={styles.extras}>
          {snapshot.extras.map((extra) => (
            <View key={`${extra.label}:${extra.value}`} style={styles.chip}>
              <Text style={styles.chipText}>
                {extra.label} {extra.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {reset && reset.available > 0 ? (
        <View style={styles.resetBlock}>
          <View style={styles.resetTexts}>
            <Text style={styles.resetTitle} numberOfLines={1}>
              {`${reset.available} banked reset${reset.available === 1 ? '' : 's'}${reset.clears ? ` · ${reset.clears}` : ''}`}
            </Text>
            <Text style={styles.resetHint} numberOfLines={2}>
              {!reset.usable
                ? (reset.blocked ?? 'not usable right now')
                : reset.nextExpiresAt
                  ? `one expires ${formatReset(reset.nextExpiresAt)}`
                  : 'can be used now'}
            </Text>
          </View>
          <Pressable
            onPress={spend}
            disabled={!reset.usable || redeem?.busy === true}
            style={({ pressed }) => [
              styles.resetButton,
              (!reset.usable || redeem?.busy) && styles.resetButtonOff,
              pressed && styles.resetButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !reset.usable || redeem?.busy === true }}
            accessibilityLabel={confirming ? 'Confirm spending one reset' : 'Use a reset'}>
            <Text style={[styles.resetButtonText, (!reset.usable || redeem?.busy) && styles.resetButtonTextOff]}>
              {redeem?.busy ? 'Redeeming…' : confirming ? 'Tap again' : 'Use a reset'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {redeem?.result ? (
        <Text style={redeem.result.ok ? styles.redeemOk : styles.redeemError}>
          {redeem.result.message ?? (redeem.result.ok ? 'Reset applied.' : 'Reset refused.')}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(palette: Palette) {
  return {
    card: {
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.md,
      padding: space.md,
      gap: space.sm,
    },
    head: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: space.sm },
    headText: { flex: 1, gap: 2 },
    title: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
    meta: { fontSize: font.meta, color: palette.textMuted },
    hint: { fontSize: font.meta, color: palette.textMuted },
    stale: { fontSize: font.meta, color: palette.warn },
    refresh: { paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.sm },
    refreshText: { fontSize: font.meta, color: palette.accent },
    window: { gap: 3 },
    windowHead: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'baseline' as const },
    windowLabel: { fontSize: font.meta, color: palette.text, fontWeight: '600' as const },
    windowPercent: { fontSize: font.meta, color: palette.textMuted },
    windowPercentFull: { color: palette.danger },
    track: { height: 6, borderRadius: radius.pill, backgroundColor: palette.border, overflow: 'hidden' as const },
    fill: { height: 6, borderRadius: radius.pill },
    windowReset: { fontSize: font.small, color: palette.textMuted },
    balance: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'baseline' as const },
    balanceLabel: { fontSize: font.meta, color: palette.textMuted },
    balanceValue: { fontSize: font.body, color: palette.text, fontWeight: '600' as const },
    extras: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.xs },
    chip: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.pill,
      paddingHorizontal: space.sm,
      paddingVertical: 2,
    },
    chipText: { fontSize: font.small, color: palette.textMuted },
    line: { fontSize: font.small, color: palette.textMuted },
    resetBlock: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: space.sm,
      paddingTop: space.sm,
      borderTopWidth: 1,
      borderTopColor: palette.border,
    },
    resetTexts: { flex: 1, gap: 1 },
    resetTitle: { fontSize: font.meta, color: palette.text, fontWeight: '600' as const },
    resetHint: { fontSize: font.small, color: palette.textMuted },
    resetButton: {
      minHeight: 34,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      backgroundColor: palette.accentSoft,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    resetButtonOff: { backgroundColor: palette.surfaceAlt },
    resetButtonPressed: { opacity: 0.6 },
    resetButtonText: { fontSize: font.meta, color: palette.accent, fontWeight: '600' as const },
    resetButtonTextOff: { color: palette.textFaint },
    redeemOk: { fontSize: font.small, color: palette.ok },
    redeemError: { fontSize: font.small, color: palette.danger },
  };
}
