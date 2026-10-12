import { deviceBridge } from './nativeBridge';
import { httpOrigin } from './utils';
import { connection } from './connection';
import { isValidServerUrl } from './serverUrl';

/**
 * Native device pairing over the unauthenticated /pair socket.
 *
 * The CLI `myclaw device add --kind app` mints a device and prints a claim code. This client
 * presents that code on a fresh socket, receives the minted token, adopts it (the server is the
 * source of truth for the pair), then reconnects as a normal client.
 *
 * A browser pairs through the page; this is the native half of the same primitive. The socket
 * is separate from `connection` on purpose: it carries no credentials and never joins the chat.
 */

export type PairingStatus =
  | { phase: 'idle' }
  | { phase: 'connecting'; url: string }
  | { phase: 'waiting'; code: string }
  | { phase: 'granted'; deviceId: string }
  | { phase: 'error'; reason: string };

type Listener = (status: PairingStatus) => void;

const listeners = new Set<Listener>();
let status: PairingStatus = { phase: 'idle' };
let socket: WebSocket | null = null;
let currentUrl = '';
let claimed = false;
let generation = 0;

function set(next: PairingStatus): void {
  status = next;
  listeners.forEach(listener => listener(next));
}

export function pairingStatus(): PairingStatus {
  return status;
}

export function onPairingStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Opens the pairing socket and claims the code. `baseUrl` is the http(s) origin the server runs
 * on, e.g. `http://10.0.0.5:8080`; the ws(s) endpoint is derived from it.
 */
export function startPairing(baseUrl: string, code: string): void {
  // A claim URL from a QR looks like https://host/pair#CODE. The fragment is already stripped by
  // PairScanner; a hand-typed value may still carry it.
  const cleaned = code.trim().toUpperCase().replace(/[\s-]/g, '').split('#')[0] ?? '';
  if (!/^[0-9A-Z]{8}$/.test(cleaned) || !isValidServerUrl(baseUrl)) {
    set({ phase: 'error', reason: 'invalid pairing code or server address' });
    return;
  }
  const session = ++generation;
  if (socket) {
    try {
      socket.close();
    } catch {
      // already gone
    }
  }
  // The origin only: the app's own address setting is the socket URL (`ws://host:8080/my-claw-app`),
  // and appending the pairing path to it asked for `/my-claw-app/my-claw-app/pair`.
  currentUrl = httpOrigin(baseUrl).replace(/^http/, 'ws') + '/my-claw-app/pair';
  const pairingUrl = currentUrl;
  const origin = httpOrigin(baseUrl);
  claimed = false;
  set({ phase: 'connecting', url: currentUrl });

  try {
    socket = new WebSocket(pairingUrl);
  } catch {
    set({ phase: 'error', reason: 'could not open the pairing socket' });
    return;
  }

  socket.onopen = () => {
    if (session !== generation) return;
    socket?.send(JSON.stringify({ type: 'pair.hello', kind: 'native', userAgent: 'my-claw-app' }));
    // The CLI ticket is pre-approved: no human is asked to approve. The code is claimed right
    // after the hello; the server answers pair.granted when it recognises the code.
    socket?.send(JSON.stringify({ type: 'pair.claim', code: cleaned }));
    set({ phase: 'waiting', code: cleaned });
  };

  socket.onmessage = async (event: { data: string }) => {
    if (session !== generation) return;
    let frame: Record<string, unknown> | null = null;
    try {
      frame = JSON.parse(String(event.data)) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!frame || frame.type !== 'pair.granted') return;
    const deviceId = typeof frame.deviceId === 'string' ? frame.deviceId : '';
    const token = typeof frame.token === 'string' ? frame.token : '';
    if (!deviceId || !token || claimed) return;
    claimed = true;
    let ok = false;
    try { ok = await deviceBridge.adoptCredentials(deviceId, token, origin); }
    catch { ok = false; }
    if (session !== generation) return;
    try {
      socket?.close();
    } catch {
      // already gone
    }
    if (!ok) {
      set({ phase: 'error', reason: 'the credentials could not be stored on this device' });
      return;
    }
    set({ phase: 'granted', deviceId });
    // Reconnect the chat socket against the same origin with the new, server-minted identity.
    connection.connect(pairingUrl.replace('/my-claw-app/pair', '/my-claw-app'));
  };

  socket.onerror = () => {
    if (session !== generation) return;
    set({ phase: 'error', reason: 'the pairing socket failed (is the server up?)' });
  };

  socket.onclose = () => {
    if (session !== generation) return;
    if (!claimed) set({ phase: 'error', reason: 'the pairing socket closed before the code was granted' });
    socket = null;
  };

  // The socket may already be open when a fast local server answers the upgrade: a socket at
  // OPEN fires no onopen again, so drive the same handshake here. No timer: the claim is always
  // sent once, by whichever branch ran.
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'pair.hello', kind: 'native', userAgent: 'my-claw-app' }));
    socket.send(JSON.stringify({ type: 'pair.claim', code: cleaned }));
    set({ phase: 'waiting', code: cleaned });
  }
}

export function cancelPairing(): void {
  generation++;
  if (socket) {
    try {
      socket.close();
    } catch {
      // already gone
    }
  }
  socket = null;
  set({ phase: 'idle' });
}

/** Only tests need it: the module state is intentionally module-level. */
export function resetPairingClient(): void {
  generation++;
  socket = null;
  claimed = false;
  currentUrl = '';
  status = { phase: 'idle' };
  listeners.clear();
}
