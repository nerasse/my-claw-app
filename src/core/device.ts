import { deviceBridge } from './nativeBridge';

export interface DeviceInfo {
  deviceId: string;
  token: string;
  /** The server's media ticket (hello frame): what goes in a URL instead of the token. */
  ticket?: string;
}

/**
 * Who this client is to the server.
 *
 * Read through the bridge, never through `NativeModules` directly: the bridge is the one door
 * with a web twin, and a direct native call throws in a browser. It did, silently, and the whole
 * web build lost its media URLs to it, because a rejected identity meant every attachment URL
 * was built as the empty string.
 *
 * Native holds a deviceId and a token. A browser holds neither: it authenticates with the
 * session cookie set at pairing, so both fields come back empty there and every URL builder
 * leaves the credential query off.
 */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  return deviceBridge.getDeviceInfo();
}
