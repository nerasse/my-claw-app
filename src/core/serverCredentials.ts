export function authQuery(deviceInfo: { ticket?: string }): string | null {
  return deviceInfo.ticket ? `ticket=${encodeURIComponent(deviceInfo.ticket)}` : null;
}

export function authHeaders(deviceInfo: { deviceId: string; token: string }): Record<string, string> {
  if (!deviceInfo.deviceId || !deviceInfo.token) return {};
  return { 'X-My-Claw-Device': deviceInfo.deviceId, Authorization: `Bearer ${deviceInfo.token}` };
}
