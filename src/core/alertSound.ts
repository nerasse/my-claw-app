/**
 * The one-shot alert sound for an incoming question sheet.
 *
 * Native path: the system notification sound (RingtoneManager), played through the existing
 * MediaPlayer pattern in DeviceBridgeModule. Web path: a short two-tone WebAudio chirp, no
 * asset to ship. Both ring once; the tray sound for a device that is not looking at the
 * thread is the push's business (server-side skipDevice), never this.
 *
 * The interface is shaped like the native bridge door so tests can mock the module: the web
 * build swaps the implementation, the callers never branch.
 */
import { Platform } from 'react-native';
import { deviceBridge } from './nativeBridge';

/** Plays the notification-style alert once. Resolves when started, rejects when unsupported. */
export async function playAlertSound(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await deviceBridge.playAlertSound();
}
