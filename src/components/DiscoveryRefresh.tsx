import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { modelStore, useDiscovery } from '../core/model';
import { font, radius, space, useTheme, useThemedStyles, type Palette } from '../theme';
import { RefreshIcon } from './icons';

/**
 * Discovery on demand, where the models are read.
 *
 * The server discovers at boot and every six hours, which means a provider that just gained a
 * model (or a key) showed nothing until the next cycle, and the only way to force it was to
 * restart the server. The button asks for a pass now; the answer replaces the catalogue for every
 * screen, so nothing here has to be refreshed by hand afterwards.
 */
export function DiscoveryButton(): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  const discovery = useDiscovery();
  return (
    <Pressable
      onPress={() => modelStore.refreshDiscovery()}
      disabled={discovery.running}
      hitSlop={8}
      style={styles.button}
      accessibilityRole="button"
      accessibilityState={{ disabled: discovery.running }}
      accessibilityLabel={discovery.running ? 'Discovering models' : 'Refresh the model discovery'}>
      {discovery.running ? (
        <ActivityIndicator size="small" color={palette.accent} />
      ) : (
        <RefreshIcon size={20} tone="accent" />
      )}
    </Pressable>
  );
}

/**
 * What the last pass did, in one line. It stays after the pass on purpose: a button that only
 * spins and goes quiet leaves the reader wondering whether anything happened at all, and the one
 * fact worth reporting is a provider that did not answer, since its models are the previously
 * known ones rather than fresh evidence.
 */
export function DiscoveryNote(): React.JSX.Element | null {
  const styles = useThemedStyles(createStyles);
  const discovery = useDiscovery();
  if (discovery.running) return <Text style={styles.note}>asking every provider that discovers...</Text>;
  if (discovery.error) {
    return (
      <Text style={styles.error} accessibilityLabel={`Discovery failed ${discovery.error}`}>
        {`discovery failed · ${discovery.error}`}
      </Text>
    );
  }
  const outcome = discovery.outcome;
  if (!outcome) return null;
  if (!outcome.enabled) {
    return <Text style={styles.note}>no provider is set to discover: the catalogue is what config declares</Text>;
  }
  return (
    <View>
      <Text style={styles.note}>{`${outcome.models} model${outcome.models === 1 ? '' : 's'} in the catalogue`}</Text>
      {outcome.failed.length > 0 ? (
        <Text style={styles.error}>
          {`no answer from ${outcome.failed.join(', ')} · their models are the last known ones`}
        </Text>
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  // The same 40 pt square the page's other header actions live in, so the row reads as one set of
  // controls rather than three sizes side by side. The icon inside stays 20 pt.
  button: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  note: { fontSize: font.small, color: palette.textMuted, paddingHorizontal: space.xs, paddingTop: space.xs },
  error: { fontSize: font.small, color: palette.danger, paddingHorizontal: space.xs, paddingTop: space.xs },
});
