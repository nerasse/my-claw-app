/**
 * The one-shot alert sound for an incoming question sheet and the end of a run on screen.
 *
 * Native path: the sound the owner picked for the ordinary notifications -- a system sound or a
 * file imported into the app -- played through the existing MediaPlayer pattern in
 * DeviceBridgeModule, which reads the ringer mode at play time (silent stays silent, vibrate
 * buzzes). The silent choice plays nothing at all. A bridge that cannot answer falls back to the
 * system notification sound rather than swallowing the ding. Web path: a short two-tone WebAudio
 * chirp, no asset to ship -- the browser owns its notification sounds, there is nothing to pick.
 * Both ring once; the tray sound for a device that is not looking at the thread is the push's
 * business (server-side skipDevice), never this.
 *
 * The interface is shaped like the native bridge door so tests can mock the module: the web
 * build swaps the implementation, the callers never branch.
 */
import { Platform } from 'react-native';
import { deviceBridge } from './nativeBridge';

/** Plays the notification-style alert once. Resolves when started, rejects when unsupported. */
export async function playAlertSound(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const sounds = await deviceBridge.getNotificationSounds().catch(() => null);
  const choice = sounds?.ordinary;
  if (choice?.kind === 'silent') return;
  await deviceBridge.playAlertSound(choice?.kind === 'uri' ? choice.uri : null);
}
