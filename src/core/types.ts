export type WsState = 'idle' | 'connecting' | 'connected' | 'disconnected';

export interface WsStatusPayload {
  state: WsState;
  url?: string;
  reason?: string;
  attempts?: number;
  /** Frames waiting in the native outbox for the next reconnect. */
  pending?: number;
}

export interface Capabilities {
  accessibility: boolean;
  notificationListener: boolean;
  wssConnection: boolean;
}

export interface AccessibilityBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface AccessibilityNode {
  resourceId?: string;
  className?: string;
  text?: string;
  contentDescription?: string;
  clickable: boolean;
  scrollable: boolean;
  checked: boolean;
  bounds: AccessibilityBounds;
  children: AccessibilityNode[];
}

export interface NotificationEvent {
  packageName: string;
  key: string;
  postTime: number;
  title?: string;
  text?: string;
}
