import { deviceBridge, deviceEvents } from './nativeBridge';
import { authQuery } from './serverUrl';
import type { DeviceInfo } from './device';
import type { AppUpdateCheckResult } from './appUpdate';

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
  download(mediaBase: string, deviceInfo: DeviceInfo | null, transferId: string): Promise<void>;
  /** Commits the staged APK; the system confirmation and outcome arrive via onInstallStatus. */
  install(): Promise<void>;
  /** Android 8+ opt-in; if false the system settings must be opened first. */
  canInstall(): Promise<boolean>;
  /** Opens the system "install unknown apps" screen. */
  openInstallSettings(): void;
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

  async download(mediaBase, deviceInfo, transferId) {
    if (!deviceInfo) throw new Error('no device identity');
    const url = `${mediaBase}/app-update/apk?${authQuery(deviceInfo)}`;
    await deviceBridge.downloadApk(url, transferId);
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

  async canAutoDownload(pref) {
    if (pref) return true;
    return (await deviceBridge.getNetworkType()) === 'wifi';
  },

  onInstallStatus(cb) {
    const sub = deviceEvents.addListener(INSTALL_EVENT, cb as never);
    return () => sub.remove();
  },
};
