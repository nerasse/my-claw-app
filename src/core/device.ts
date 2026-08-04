import { DeviceEventEmitter, NativeModules, type EmitterSubscription } from 'react-native';
import type { AccessibilityNode, Capabilities, NotificationEvent } from './types';

const { DeviceBridge } = NativeModules;

export async function getCapabilities(): Promise<Capabilities> {
  return DeviceBridge.getCapabilities();
}

export interface DeviceInfo {
  deviceId: string;
  token: string;
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  return DeviceBridge.getDeviceInfo();
}

export async function getAccessibilitySnapshot(): Promise<AccessibilityNode | null> {
  return DeviceBridge.getAccessibilitySnapshot();
}

export async function performAccessibilityAction(action: {
  resourceId?: string;
  text?: string;
  contentDescription?: string;
}): Promise<boolean> {
  return DeviceBridge.performAccessibilityAction(action);
}

export function onNotification(listener: (event: NotificationEvent) => void): EmitterSubscription {
  return DeviceEventEmitter.addListener('claw:notification:posted', listener);
}
