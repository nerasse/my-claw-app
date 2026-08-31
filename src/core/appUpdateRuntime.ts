import { Platform } from 'react-native';
import { deviceBridge, deviceEvents } from './nativeBridge';
import { authQuery } from './serverUrl';
import type { DeviceInfo } from './device';
import type { AppUpdateCheckResult } from './appUpdate';

/**
 * Whether this build can replace itself with an APK. The browser cannot: it has no package
 * installer, its "version" is literally the string `web`, so every release reads as newer and
 * the tab gets offered a 45 MB Android download it could never install. A web client updates by
 * reloading the page the server serves. Gate the check, the modal and the settings card on this.
 */
export const appUpdateSupported = Platform.OS !== 'web';

/**
 * The runtime glue between the appUpdate reducer and the device: what the phone asks the server,
 * how a download reports progress, and how an install status comes back. Pure decision logic
 * lives in appUpdate.ts; this file owns the side effects.
 */

const INSTALL_EVENT = 'claw:update:install';

export interface AppUpdateRuntime {
  /** GET /app-update through the server relay, authenticated like media. */
  check(mediaBase: string, deviceInfo: DeviceInfo | null): Promise<AppUpdateCheckResult>;
  /** GET /app-update/apk into the native staging file; resolves on download completion. */
  download(
    mediaBase: string,
    deviceInfo: DeviceInfo | null,
    transferId: string,
    version: string,
    /** What the check reported. The relay streams, so the response carries no Content-Length. */
    expectedSize: number,
  ): Promise<void>;
  /** What is on disk right now. The UI offers Install from this, never from what it remembers. */
  staged(): Promise<{ staged: boolean; size: number; version: string }>;
  /** Drops a staged APK that is stale or refused, so the next tap downloads instead of looping. */
  clearStaged(): Promise<void>;
  /** Commits the staged APK; the system confirmation and outcome arrive via onInstallStatus. */
  install(): Promise<void>;
  /** True if Install can be offered right now; false means the settings permission screen must come first. */
  canInstall(): Promise<boolean>;
  /** Opens the system "install unknown apps" screen. */
  openInstallSettings(): void;
  /** Delivers an install result parked at cold start; call once the status listener is subscribed. */
  drainInstallResult(): void;
  /** Whether the auto-download policy allows a download right now. */
  canAutoDownload(pref: boolean): Promise<boolean>;
  /** Listens for the install status event; returns an unsubscribe. */
  onInstallStatus(cb: (status: string, message?: string) => void): () => void;
}

export const appUpdateRuntime: AppUpdateRuntime = {
  async check(mediaBase, deviceInfo) {
    if (!deviceInfo) return { ok: false, error: 'no device identity' };
    try {
      const url = `${mediaBase}/app-update?${authQuery(deviceInfo)}`;
      const res = await fetch(url);
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const body = (await res.json()) as AppUpdateCheckResult;
      return body.ok ? body : { ok: false, error: body.error ?? 'check failed' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'check failed' };
    }
  },

  async download(mediaBase, deviceInfo, transferId, version, expectedSize) {
    if (!deviceInfo) throw new Error('no device identity');
    const url = `${mediaBase}/app-update/apk?${authQuery(deviceInfo)}`;
    await deviceBridge.downloadApk(url, transferId, version, expectedSize);
  },

  async staged() {
    return deviceBridge.stagedApkInfo();
  },

  async clearStaged() {
    await deviceBridge.clearStagedApk();
  },

  async install() {
    await deviceBridge.installStagedApk();
  },

  async canInstall() {
    return deviceBridge.canInstallApk();
  },

  openInstallSettings() {
    deviceBridge.openUnknownSourcesSettings();
  },

  drainInstallResult() {
    deviceBridge.drainInstallResult();
  },

  async canAutoDownload(pref) {
    if (pref) return true;
    return (await deviceBridge.getNetworkType()) === 'wifi';
  },

  onInstallStatus(cb) {
    const sub = deviceEvents.addListener(INSTALL_EVENT, cb as never);
    return () => sub.remove();
  },
};
