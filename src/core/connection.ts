import { DeviceEventEmitter, NativeModules } from 'react-native';
import type { WsStatusPayload } from './types';
import { parseServerFrame, type ServerFrame } from './protocol';

const { DeviceBridge } = NativeModules;

type StateListener = (status: WsStatusPayload) => void;
type MessageListener = (text: string) => void;
type FrameListener = (frame: ServerFrame) => void;

class ClawConnection {
  private stateListeners = new Set<StateListener>();
  private messageListeners = new Set<MessageListener>();
  private frameListeners = new Set<FrameListener>();

  constructor() {
    DeviceEventEmitter.addListener('claw:ws:state', (status: WsStatusPayload) => {
      this.stateListeners.forEach(listener => listener(status));
    });
    DeviceEventEmitter.addListener('claw:ws:message', (payload: { text: string }) => {
      this.messageListeners.forEach(listener => listener(payload.text));
      const frame = parseServerFrame(payload.text);
      if (frame) {
        this.frameListeners.forEach(listener => listener(frame));
      }
    });
  }

  connect(url: string): void {
    DeviceBridge.connect(url);
  }

  disconnect(): void {
    DeviceBridge.disconnect();
  }

  send(text: string): void {
    DeviceBridge.sendMessage(text);
  }

  getState(): Promise<WsStatusPayload['state']> {
    if (!DeviceBridge) return Promise.resolve('idle');
    return DeviceBridge.getConnectionState();
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
}

export const connection = new ClawConnection();
