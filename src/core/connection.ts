import { deviceBridge, deviceEvents } from './nativeBridge';
import type { WsStatusPayload } from './types';
import { parseServerFrame, type ServerFrame } from './protocol';

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
      this.messageListeners.forEach(listener => listener(payload.text));
      const frame = parseServerFrame(payload.text);
      if (frame) {
        this.frameListeners.forEach(listener => listener(frame));
      }
    });
    deviceEvents.addListener('claw:ws:outbox', (payload: { pending: number }) => {
      this.pendingListeners.forEach(listener => listener(payload.pending));
    });
  }

  connect(url: string): void {
    deviceBridge.connect(url);
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
