import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BackButton, headerStyle } from '../components/BackButton';
import { CopyButton } from '../components/CopyButton';
import { accountsStore, useAccounts } from '../core/accounts';
import { connection } from '../core/connection';
import { encodeAccounts, type AccountKind, type AccountView, type AccountsRequest } from '../core/protocol';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import { CloseButton } from '../components/CloseButton';

/** The words of each plan, one place. */
export const ACCOUNT_LABELS: Record<AccountKind, { title: string; plan: string; signIn: string }> = {
  codex: { title: 'ChatGPT', plan: 'Plus or Pro plan', signIn: 'Sign in with ChatGPT' },
  claude: { title: 'Claude', plan: 'Pro or Max plan', signIn: 'Sign in with Claude' },
};

/** One line under the account's name: who is signed in, or what signing in gives. */
export function accountSummary(kind: AccountKind, view: AccountView | undefined): string {
  if (!view?.connected) return view?.login ? 'Sign-in in progress' : `Use your ${ACCOUNT_LABELS[kind].plan}, no API key`;
  if (kind === 'codex') return ['Connected', view.email, view.plan && `${view.plan[0]!.toUpperCase()}${view.plan.slice(1)}`].filter(Boolean).join(' · ');
  return view.source === 'env' ? 'Connected · token in the server .env' : view.source === 'token' ? 'Connected · long-lived token' : 'Connected';
}

/** How long a second tap on Sign out stays armed. */
const CONFIRM_MS = 4000;

function send(request: AccountsRequest): void {
  accountsStore.sending();
  connection.send(encodeAccounts(request)).catch(() => accountsStore.fail('Not connected to the server.'));
}

/**
 * Signs a ChatGPT or Claude plan in, from the app (server docs/subscription-accounts.md): the
 * page opens the provider's own sign-in page and either shows the code to type there (ChatGPT)
 * or takes back the one it shows (Claude). The tokens stay on the server.
 */
export function AccountScreen({
  kind,
  needsModel,
  onBack,
  onPickModel,
}: {
  kind: AccountKind;
  /** No default model runs yet: once connected, the next step is choosing one. */
  needsModel: boolean;
  onBack: () => void;
  onPickModel: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { frame, error, busy } = useAccounts();
  const view = frame?.[kind];
  const login = view?.login;
  const labels = ACCOUNT_LABELS[kind];
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [tokenOpen, setTokenOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    connection.send(encodeAccounts({ type: 'accounts.get' })).catch(() => {});
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);
  // A sign-in that ended clears what was typed for it: nothing secret lingers in a field.
  useEffect(() => {
    if (view?.connected) {
      setCode('');
      setToken('');
      setTokenOpen(false);
    }
  }, [view?.connected]);

  const signOut = (): void => {
    if (!confirmOut) {
      setConfirmOut(true);
      confirmTimer.current = setTimeout(() => setConfirmOut(false), CONFIRM_MS);
      return;
    }
    setConfirmOut(false);
    send({ type: 'accounts.logout', provider: kind });
  };

  const open = (url: string): void => {
    Linking.openURL(url).catch(() => accountsStore.fail(`Could not open ${url}`));
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <BackButton onPress={onBack} label="Back to providers" />
        <View style={styles.grow}>
          <Text style={styles.title}>{labels.title}</Text>
          <Text style={styles.subtitle}>{labels.plan} · usage counts against your plan</Text>
        </View>
        <CloseButton />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? (
          <Text style={styles.error} accessibilityLabel={`Account error ${error}`}>
            {error}
          </Text>
        ) : null}

        {!frame ? (
          <ActivityIndicator />
        ) : view?.connected ? (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.dot, styles.dotUp]} />
              <Text style={styles.cardTitle} accessibilityLabel={`Account status ${accountSummary(kind, view)}`}>
                {accountSummary(kind, view)}
              </Text>
            </View>
            <Text style={styles.hint}>Its models are in the model picker, under {labels.title}.</Text>
            {needsModel ? (
              <Pressable onPress={onPickModel} style={styles.primary} accessibilityRole="button" accessibilityLabel="Choose the default model">
                <Text style={styles.primaryText}>Choose the default model</Text>
              </Pressable>
            ) : null}
            {view.source === 'env' ? (
              <Text style={styles.hint}>
                The token is CLAUDE_CODE_OAUTH_TOKEN in the server's .env: remove it there to sign out.
              </Text>
            ) : (
              <Pressable
                onPress={signOut}
                disabled={busy}
                hitSlop={8}
                style={[styles.secondary, confirmOut && styles.dangerOutline]}
                accessibilityRole="button"
                accessibilityLabel={confirmOut ? 'Confirm sign out' : 'Sign out'}>
                <Text style={[styles.secondaryText, confirmOut && styles.dangerText]}>
                  {confirmOut ? 'Tap again to sign out' : 'Sign out'}
                </Text>
              </Pressable>
            )}
          </View>
        ) : login ? (
          <View style={styles.card}>
            <View style={styles.step}>
              <Text style={styles.stepNumber}>1</Text>
              <View style={styles.grow}>
                <Text style={styles.cardTitle}>
                  {kind === 'codex' ? 'Open the sign-in page' : 'Open the Claude page and approve'}
                </Text>
                <Text style={styles.detail} numberOfLines={1}>
                  {login.url.replace(/^https?:\/\/([^/]+).*$/, '$1')}
                </Text>
              </View>
              <Pressable onPress={() => open(login.url)} style={styles.primarySmall} accessibilityRole="button" accessibilityLabel="Open the sign-in page">
                <Text style={styles.primaryText}>Open</Text>
              </Pressable>
            </View>

            {kind === 'codex' && login.code ? (
              <>
                <View style={styles.step}>
                  <Text style={styles.stepNumber}>2</Text>
                  <View style={styles.grow}>
                    <Text style={styles.cardTitle}>Enter this code there</Text>
                    <Text selectable style={styles.code} accessibilityLabel={`Sign-in code ${login.code}`}>
                      {login.code}
                    </Text>
                  </View>
                  <CopyButton value={login.code} accessibilityLabel="Copy the sign-in code" />
                </View>
                <View style={styles.row}>
                  <ActivityIndicator size="small" />
                  <Text style={styles.hint}>Waiting for your approval…</Text>
                </View>
                <Text style={styles.detail}>
                  Code refused? Allow device code sign-in in ChatGPT → Settings → Security.
                </Text>
              </>
            ) : (
              <View style={styles.step}>
                <Text style={styles.stepNumber}>2</Text>
                <View style={styles.grow}>
                  <Text style={styles.cardTitle}>Paste the code it shows</Text>
                  <View style={styles.row}>
                    <TextInput
                      value={code}
                      onChangeText={setCode}
                      placeholder="code#state"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={[styles.input, styles.grow]}
                      accessibilityLabel="Claude sign-in code"
                      onSubmitEditing={() => code.trim() && send({ type: 'accounts.code', code })}
                    />
                    <Pressable
                      onPress={() => send({ type: 'accounts.code', code })}
                      disabled={busy || !code.trim()}
                      style={[styles.primarySmall, (busy || !code.trim()) && styles.off]}
                      accessibilityRole="button"
                      accessibilityLabel="Connect Claude">
                      <Text style={styles.primaryText}>Connect</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            <Pressable
              onPress={() => send({ type: 'accounts.cancel', provider: kind })}
              hitSlop={8}
              style={styles.secondary}
              accessibilityRole="button"
              accessibilityLabel="Cancel sign-in">
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.hint}>
              {kind === 'codex'
                ? 'Sign in with the ChatGPT account that has the plan. The agent then uses its models (GPT, Codex) with no API key.'
                : 'Sign in with the Claude account that has the plan. The agent then uses its models (Opus, Sonnet) with no API key.'}
            </Text>
            <Pressable
              onPress={() => send({ type: 'accounts.login', provider: kind })}
              disabled={busy}
              style={[styles.primary, busy && styles.off]}
              accessibilityRole="button"
              accessibilityLabel={labels.signIn}>
              {busy ? <ActivityIndicator size="small" /> : <Text style={styles.primaryText}>{labels.signIn}</Text>}
            </Pressable>
          </View>
        )}

        {kind === 'claude' && frame && view?.source !== 'env' && !view?.connected ? (
          <View style={styles.card}>
            <Pressable
              onPress={() => setTokenOpen(shown => !shown)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Use a long-lived token instead">
              <Text style={styles.link}>{tokenOpen ? '▾' : '▸'} Use a long-lived token instead</Text>
            </Pressable>
            {tokenOpen ? (
              <>
                <Text style={styles.detail}>Run `claude setup-token` where Claude Code is installed, then paste what it prints.</Text>
                <View style={styles.row}>
                  <TextInput
                    value={token}
                    onChangeText={setToken}
                    placeholder="sk-ant-oat…"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.input, styles.grow]}
                    accessibilityLabel="Claude long-lived token"
                  />
                  <Pressable
                    onPress={() => send({ type: 'accounts.token', token })}
                    disabled={busy || !token.trim()}
                    style={[styles.primarySmall, (busy || !token.trim()) && styles.off]}
                    accessibilityRole="button"
                    accessibilityLabel="Save the Claude token">
                    <Text style={styles.primaryText}>Save</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  root: { flex: 1 },
  header: headerStyle(palette),
  grow: { flex: 1 },
  title: { fontSize: font.title, fontWeight: '600' as const, color: palette.text },
  subtitle: { fontSize: font.meta, color: palette.textMuted, marginTop: 2 },
  content: { paddingVertical: space.md, gap: space.sm, paddingBottom: space.xl },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.md,
  },
  cardTitle: { fontSize: font.body, fontWeight: '600' as const, color: palette.text },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  step: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.md },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: 'center' as const,
    lineHeight: 24,
    fontSize: font.small,
    fontWeight: '700' as const,
    color: palette.accentText,
    backgroundColor: palette.accent,
    overflow: 'hidden' as const,
  },
  code: {
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: 2,
    color: palette.text,
    fontFamily: 'monospace',
    marginTop: space.xs,
  },
  hint: { fontSize: font.small, color: palette.textMuted, flexShrink: 1 },
  detail: { fontSize: font.small, color: palette.textFaint },
  error: { fontSize: font.small, color: palette.danger },
  link: { fontSize: font.small, color: palette.accent, fontWeight: '600' as const },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotUp: { backgroundColor: palette.ok },
  input: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    color: palette.text,
    backgroundColor: palette.bg,
    fontSize: font.body,
  },
  primary: {
    alignSelf: 'flex-start' as const,
    minHeight: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: palette.accent,
  },
  primarySmall: {
    minHeight: 40,
    justifyContent: 'center' as const,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: palette.accent,
  },
  primaryText: { fontSize: font.body, fontWeight: '600' as const, color: palette.accentText },
  secondary: {
    alignSelf: 'flex-start' as const,
    minHeight: 36,
    justifyContent: 'center' as const,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  secondaryText: { fontSize: font.small, color: palette.textMuted },
  dangerOutline: { borderColor: palette.danger },
  dangerText: { color: palette.danger, fontWeight: '600' as const },
  off: { opacity: 0.5 },
});
