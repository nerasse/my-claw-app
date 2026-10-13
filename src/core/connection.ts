import { deviceBridge, deviceEvents } from './nativeBridge';
import type { WsStatusPayload } from './types';
import { parseServerFrame, type ServerFrame } from './protocol';
import { isValidServerUrl, socketUrl } from './serverUrl';

type StateListener = (status: WsStatusPayload) => void;
type MessageListener = (text: string) => void;
type FrameListener = (frame: ServerFrame) => void;
type PendingListener = (pending: number) => void;

class ClawConnection {
  private stateListeners = new Set<StateListener>();
  private messageListeners = new Set<MessageListener>();
  private frameListeners = new Set<FrameListener>();
  private pendingListeners = new Set<PendingListener>();

  constructor() {
    deviceEvents.addListener('claw:ws:state', (status: WsStatusPayload) => {
      this.stateListeners.forEach(listener => listener(status));
      if (typeof status.pending === 'number') {
        this.pendingListeners.forEach(listener => listener(status.pending as number));
      }
    });
    deviceEvents.addListener('claw:ws:message', (payload: { text: string }) => {
      this.messageListeners.forEach(listener => this.guard(listener, payload.text, 'message'));
      const frame = parseServerFrame(payload.text);
      if (frame) {
        this.frameListeners.forEach(listener => this.guard(listener, frame, frame.type));
      }
    });
    deviceEvents.addListener('claw:ws:outbox', (payload: { pending: number }) => {
      this.pendingListeners.forEach(listener => listener(payload.pending));
    });
  }

  /**
   * Where a listener's throw is reported. Set by `diagnostics`, which already depends on this
   * module: taking the reverse import would close a cycle for one function call.
   */
  private onListenerError: ((error: Error, label: string) => void) | null = null;

  setListenerErrorReporter(report: (error: Error, label: string) => void): void {
    this.onListenerError = report;
  }

  /**
   * One listener must not take the process with it. `parseServerFrame` only validates `type`, so
   * a frame that announces itself correctly and is missing a field the handler walks into throws
   * from here -- out of a native module callback on Android, which is a crash. The app relaunches,
   * reconnects, is handed the same frame, and crashes again: a boot loop no reinstall would fix,
   * driven by one bad frame on the server.
   *
   * The throw is reported rather than swallowed, so the frame that did it is named in the server
   * log on the next connection instead of becoming a mystery.
   */
  private guard<T>(listener: (value: T) => void, value: T, label: string): void {
    try {
      listener(value);
    } catch (error) {
      const detail = error instanceof Error ? error : new Error(String(error));
      this.onListenerError?.(detail, label);
    }
  }

  connect(url: string): void {
    // The one door to the transport, so the one place an address is checked. Below this line it
    // reaches OkHttp, which answers a missing scheme by throwing out of a service callback and
    // taking the process with it, at every launch, since the address was already stored.
    if (!isValidServerUrl(url)) {
      deviceEvents.emit('claw:ws:state', { state: 'disconnected', reason: 'invalid server address' });
      return;
    }
    deviceBridge.connect(socketUrl(url));
  }

  disconnect(): void {
    deviceBridge.disconnect();
  }

  /**
   * Resolves false when the frame was neither sent nor queued natively, which is the only
   * case where the UI must show a failure. A queued frame leaves on the next reconnect.
   */
  async send(text: string): Promise<boolean> {
    try {
      return await deviceBridge.sendMessage(text);
    } catch {
      return false;
    }
  }

  getState(): Promise<WsStatusPayload['state']> {
    return deviceBridge.getConnectionState() as Promise<WsStatusPayload['state']>;
  }

  pendingCount(): Promise<number> {
    return deviceBridge.pendingCount();
  }

  clearOutbox(): Promise<void> {
    return deviceBridge.clearOutbox();
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onFrame(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  onPending(listener: PendingListener): () => void {
    this.pendingListeners.add(listener);
    return () => this.pendingListeners.delete(listener);
  }
}

export const connection = new ClawConnection();
