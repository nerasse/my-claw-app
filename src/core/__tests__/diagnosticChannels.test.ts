/**
 * The channel state a device ships with its diagnostics (docs/notifications.md).
 *
 * A channel that sounds wrong is otherwise readable only through the phone's own settings
 * screen, on a phone that is not always on a network where adb can reach it. The frame must
 * carry what the device really holds: the name the recipe derives, the channel in use, its
 * importance, the sound the recipe wants, whether it vibrates, and the sound the channel itself
 * reports. A field that silently stops travelling leaves the server log looking exactly like a
 * healthy device, so it is asserted where it leaves: the frame handed to the bridge.
 */

import { deviceBridge } from '../nativeBridge';
import { flushDiagnostics, recordDiag, resetDiagnosticsForTest } from '../diagnostics';
import type { NotificationChannelsState } from '../protocol';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

const CHANNELS: NotificationChannelsState = {
  ordinary: {
    expected: 'runs-2f8a1c04',
    id: 'com.myclawapp:unified_push_channel:runs-2f8a1c04',
    importance: 4,
    sound: 'content://settings/system/notification_sound',
    vibration: false,
    effectiveSound: 'content://settings/system/notification_sound',
  },
  ring: {
    expected: 'ring-77b0e1aa',
    id: 'com.myclawapp:unified_push_channel:ring-77b0e1aa-v2',
    importance: 4,
    sound: 'content://settings/system/alarm_alert',
    vibration: true,
    effectiveSound: 'content://settings/system/alarm_alert',
  },
};

function lastFrame(): Record<string, unknown> {
  const call = bridge.sendMessage.mock.calls.at(-1);
  if (!call) throw new Error('no frame was sent');
  return JSON.parse(String(call[0])) as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetDiagnosticsForTest();
  bridge.sendMessage.mockResolvedValue(true);
  bridge.getNotificationChannelState.mockResolvedValue(CHANNELS);
});

test('a crash report carries the channels as the device really holds them', async () => {
  recordDiag({ kind: 'js', at: 1_000, message: 'boom' });
  await flushDiagnostics();

  expect(lastFrame()).toEqual({
    type: 'diag.report',
    reports: [{ kind: 'js', at: 1_000, message: 'boom' }],
    notificationChannels: CHANNELS,
  });
});

test('a healthy device still ships them, with nothing to report', async () => {
  await flushDiagnostics();

  expect(lastFrame()).toEqual({ type: 'diag.report', reports: [], notificationChannels: CHANNELS });
});

test('a platform with no channels of ours keeps the frame as it was', async () => {
  bridge.getNotificationChannelState.mockResolvedValue(null);
  recordDiag({ kind: 'js', at: 2_000, message: 'web boom' });
  await flushDiagnostics();

  expect(lastFrame()).toEqual({
    type: 'diag.report',
    reports: [{ kind: 'js', at: 2_000, message: 'web boom' }],
  });
});

test('nothing pending and no channels: nothing goes out', async () => {
  bridge.getNotificationChannelState.mockResolvedValue(null);
  await flushDiagnostics();

  expect(bridge.sendMessage).not.toHaveBeenCalled();
});
