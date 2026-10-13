import { deviceBridge } from './nativeBridge';
import { httpOrigin } from './utils';
import { connection } from './connection';
import { isValidServerUrl } from './serverUrl';

/**
 * Native device pairing over the unauthenticated /pair socket.
 *
 * Two ways in, both ending in a server-minted token this client adopts before reconnecting as a
 * normal client (the server is the source of truth for the pair):
 * - a code approved already: an invitation from a paired device (Devices, "Add a device") or a
 *   `myclaw device add` ticket, claimed on a fresh socket;
 * - no code: ask, show the code and three digits, and wait for a paired device to approve them.
 *
 * A browser pairs through the page; this is the native half of the same primitive. The socket
 * is separate from `connection` on purpose: it carries no credentials and never joins the chat.
 */

export type PairingStatus =
  | { phase: 'idle' }
  | { phase: 'connecting'; url: string }
  | { phase: 'waiting'; code: string }
  /** Asking for access: the code and digits a paired device approves, and whether one is looking. */
  | { phase: 'asking'; code: string; verification: string; expiresAt: number; seen: boolean }
  | { phase: 'granted'; deviceId: string }
  | { phase: 'error'; reason: string };

type Listener = (status: PairingStatus) => void;

const listeners = new Set<Listener>();
let status: PairingStatus = { phase: 'idle' };
let socket: WebSocket | null = null;
let currentUrl = '';
let claimed = false;
let generation = 0;
/** The challenge an ask raised, to pick it up again on a new socket: a phone can lose its socket. */
let asked: { code: string; token: string } | null = null;

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
  asked = null;
  open(baseUrl, () => {
    // The ticket is approved already (a CLI ticket, an invitation): nobody is asked. The code is
    // claimed right after the hello; the server answers pair.granted when it recognises it.
    send({ type: 'pair.hello', kind: 'native', userAgent: 'my-claw-app' });
    send({ type: 'pair.claim', code: cleaned });
    set({ phase: 'waiting', code: cleaned });
  });
}

/**
 * Asks for access with no code: the server answers a code and three digits, an already paired
 * device (Settings, Devices, "Approve a request") approves them, and the credential arrives here.
 * The same road a browser takes from the pairing page.
 */
export function requestAccess(baseUrl: string): void {
  if (!isValidServerUrl(baseUrl)) {
    set({ phase: 'error', reason: 'invalid server address' });
    return;
  }
  asked = null;
  open(baseUrl, hello);
}

function hello(): void {
  send({ type: 'pair.hello', kind: 'native', userAgent: 'my-claw-app', ...(asked ? { resume: asked } : {}) });
}

function send(frame: Record<string, unknown>): void {
  try {
    socket?.send(JSON.stringify(frame));
  } catch {
    // The close handler says what happened.
  }
}

/**
 * One pairing socket, whichever way it pairs. `start` runs once the socket is open: a socket a fast
 * local server opened before the handlers were set fires no onopen, so it is driven from here too.
 */
function open(baseUrl: string, start: () => void): void {
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
  let started = false;
  const begin = (): void => {
    if (started || session !== generation) return;
    started = true;
    start();
  };

  socket.onopen = begin;

  socket.onmessage = async (event: { data: string }) => {
    if (session !== generation) return;
    let frame: Record<string, unknown> | null = null;
    try {
      frame = JSON.parse(String(event.data)) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!frame) return;
    if (frame.type === 'pair.challenge' && typeof frame.code === 'string' && typeof frame.resumeToken === 'string') {
      asked = { code: frame.code, token: frame.resumeToken };
      set({
        phase: 'asking',
        code: frame.code,
        verification: typeof frame.verification === 'string' ? frame.verification : '',
        expiresAt: typeof frame.expiresAt === 'number' ? frame.expiresAt : 0,
        seen: false,
      });
      return;
    }
    if (frame.type === 'pair.pending') {
      if (status.phase === 'asking') set({ ...status, seen: true });
      return;
    }
    if (frame.type === 'pair.denied') {
      asked = null;
      claimed = true;
      set({ phase: 'error', reason: deniedText(frame.reason) });
      return;
    }
    if (frame.type !== 'pair.granted') return;
    const deviceId = typeof frame.deviceId === 'string' ? frame.deviceId : '';
    const token = typeof frame.token === 'string' ? frame.token : '';
    if (!deviceId || !token || claimed) return;
    claimed = true;
    asked = null;
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
    if (!asked) set({ phase: 'error', reason: 'the pairing socket failed (is the server up?)' });
  };

  socket.onclose = () => {
    if (session !== generation) return;
    socket = null;
    if (claimed) return;
    // A request outlives its socket on the server (docs/web-pairing.md, "Surviving the page"): a
    // phone that slept or changed network picks it up again rather than losing the code on screen.
    if (asked && status.phase === 'asking' && status.expiresAt > Date.now()) {
      const retry = generation;
      setTimeout(() => {
        if (retry === generation && asked) open(baseUrl, hello);
      }, RESUME_DELAY_MS);
      return;
    }
    set({ phase: 'error', reason: 'the pairing socket closed before the code was granted' });
  };

  if (socket.readyState === WebSocket.OPEN) begin();
}

/** Long enough not to spin against a server that is down, short enough to read as one hiccup. */
const RESUME_DELAY_MS = 2000;

function deniedText(reason: unknown): string {
  switch (reason) {
    case 'denied':
      return 'the request was refused';
    case 'expired':
      return 'the code expired, ask for a new one';
    case 'attempts':
      return 'too many tries on that code';
    case 'disabled':
      return 'pairing is disabled on the server';
    default:
      return 'no invitation is waiting on that code';
  }
}

export function cancelPairing(): void {
  generation++;
  asked = null;
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
  asked = null;
  socket = null;
  claimed = false;
  currentUrl = '';
  status = { phase: 'idle' };
  listeners.clear();
}
