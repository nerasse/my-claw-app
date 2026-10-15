/**
 * The Updates page: the restart-the-download escape while a transfer is stuck, and the rest of
 * the page unchanged around it (owner, 2026-10-15: a stalled APK download left the button
 * disabled for the native read timeout, with no way out but killing the app).
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { UpdatesScreen } from '../UpdatesScreen';
import type { AppUpdatePhase } from '../../core/appUpdate';
import type { UpdatePhase } from '../../core/serverUpdate';

jest.mock('../../core/appUpdateRuntime', () => ({ appUpdateSupported: true }));

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
}

function byLabel(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  return tree.root.findAll(
    node => node.props?.accessibilityLabel === label && typeof node.props?.onPress === 'function',
  );
}

function render(props: {
  appUpdatePhase: AppUpdatePhase;
  onAppUpdateRestart?: () => void;
}): ReactTestRenderer.ReactTestRenderer {
  let tree: ReactTestRenderer.ReactTestRenderer | null = null;
  const updatePhase: UpdatePhase = { kind: 'idle' };
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <UpdatesScreen
        connected
        serverVersion="0.7.113"
        appVersion="0.6.152"
        updatePhase={updatePhase}
        appUpdatePhase={props.appUpdatePhase}
        now={0}
        updateOnMobileData={false}
        onUpdateOnMobileDataChange={() => {}}
        onUpdateServer={() => {}}
        onAppUpdate={() => {}}
        onAppUpdateRestart={props.onAppUpdateRestart ?? (() => {})}
        onAppUpdateInstallSettings={() => {}}
        onBack={() => {}}
      />,
    );
  });
  return tree!;
}

describe('UpdatesScreen', () => {
  it('offers the restart while a download runs, and hands the tap to it', () => {
    const onAppUpdateRestart = jest.fn();
    const tree = render({
      appUpdatePhase: { kind: 'downloading', version: '0.6.153', apkSize: 47_000_000, progress: 0.2 },
      onAppUpdateRestart,
    });
    const restart = byLabel(tree, 'Restart the app download');
    expect(restart.length).toBe(1);
    ReactTestRenderer.act(() => {
      restart[0]!.props.onPress();
    });
    expect(onAppUpdateRestart).toHaveBeenCalledTimes(1);
    expect(texts(tree).join('|')).toContain('stuck? restarting drops the partial file and starts over');
  });

  it('has no restart when nothing is downloading', () => {
    const tree = render({ appUpdatePhase: { kind: 'available', version: '0.6.153', apkSize: 47_000_000 } });
    expect(byLabel(tree, 'Restart the app download').length).toBe(0);
  });

  it('an error keeps the plain retry: no restart button, the message stays', () => {
    const tree = render({ appUpdatePhase: { kind: 'error', message: 'download failed' } });
    expect(byLabel(tree, 'Restart the app download').length).toBe(0);
    expect(texts(tree).join('|')).toContain('download failed');
  });
});
