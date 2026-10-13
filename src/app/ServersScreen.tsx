import React from 'react';
import type { WsStatusPayload } from '../core/types';
import { ServerSection } from './ConnectionSections';
import { SettingsPageFrame } from './settingsParts';

/** The server this app talks to: its address, its state, connecting, and joining one. */
export function ServersScreen({
  url,
  onUrlChange,
  status,
  serverVersion,
  onConnect,
  onDisconnect,
  onJoin,
  onBack,
}: {
  url: string;
  onUrlChange: (url: string) => void;
  status: WsStatusPayload;
  serverVersion: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onJoin?: () => void;
  onBack: () => void;
}): React.JSX.Element {
  return (
    <SettingsPageFrame title="Server" onBack={onBack}>
      <ServerSection
        url={url}
        onUrlChange={onUrlChange}
        status={status}
        serverVersion={serverVersion}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onJoin={onJoin}
      />
    </SettingsPageFrame>
  );
}
