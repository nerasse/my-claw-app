import React from 'react';
import { View } from 'react-native';
import type { WsStatusPayload } from '../core/types';
import { ConnectionSection } from './ConnectionSections';
import { LinkRow, Section, SettingsPageFrame, useSettingsStyles } from './settingsParts';

/**
 * What only matters when something is wrong, or to someone who edits files: the socket's state,
 * the diagnostics, the raw config, and the setup run again once it is done.
 */
export function AdvancedScreen({
  status,
  serverVersion,
  pending,
  onClearOutbox,
  onOpenDiagnostics,
  onOpenConfig,
  onOpenSetup,
  onBack,
}: {
  status: WsStatusPayload;
  serverVersion: string | null;
  pending: number;
  onClearOutbox: () => void;
  onOpenDiagnostics: () => void;
  onOpenConfig: () => void;
  onOpenSetup: () => void;
  onBack: () => void;
}): React.JSX.Element {
  const styles = useSettingsStyles();
  return (
    <SettingsPageFrame title="Advanced" onBack={onBack}>
      <ConnectionSection status={status} serverVersion={serverVersion} pending={pending} onClearOutbox={onClearOutbox} />
      <Section title="maintenance">
        <LinkRow title="Diagnostics" hint="server snapshot and logs, ready to copy" onPress={onOpenDiagnostics} />
        <View style={styles.separator} />
        <LinkRow title="Raw config" hint="config.json, edited as a file" onPress={onOpenConfig} label="Open config" />
        <View style={styles.separator} />
        <LinkRow title="Get started" hint="the first-run setup, step by step" onPress={onOpenSetup} label="Open get started" />
      </Section>
    </SettingsPageFrame>
  );
}
