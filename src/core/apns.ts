import type { APNsResultFrame } from './protocol';
export async function configureAPNs(_relay?: string): Promise<void> {}
export async function enableAPNs(): Promise<void> {}
export function handleAPNsResult(_frame: APNsResultFrame): void {}
export function subscribeAPNs(): () => void { return () => {}; }
export function subscribeNotificationOpen(_handle: (link: string | null) => void): () => void { return () => {}; }
export function setVisiblePushThread(_thread: string | null): void {}
export function invalidateAPNs(): void {}
